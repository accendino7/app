import os
import re
import ipaddress
import logging
import random
import string
import asyncio
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
import uuid

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Email (Emergent managed Resend) ------------------------------------------
# ---------------------------------------------------------------------------
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
DEFAULT_ADMIN_EMAIL = os.environ.get("ADMIN_NOTIFICATION_EMAIL", "")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    async with httpx.AsyncClient(timeout=30) as http_client:
        resp = await http_client.post(
            f"{EMAIL_BASE_URL}/api/v1/email/send",
            headers={"X-Email-Key": EMAIL_KEY},
            json=payload,
        )
    resp.raise_for_status()
    return resp.json().get("id")


def _redeem_email_html(coupon: dict) -> str:
    return (
        '<table role="presentation" width="100%" style="background:#0C0D0E;padding:24px">'
        '<tr><td style="font-family:Arial,sans-serif;color:#F8FAFC;max-width:520px;margin:auto">'
        '<h2 style="color:#F59E0B;margin:0 0 12px">Coupon riscattato \U0001F525</h2>'
        f'<p>Un coupon della sfida <strong>{escape(coupon["sfida_titolo"])}</strong> '
        'e stato appena usato in negozio.</p>'
        '<table role="presentation" width="100%" style="background:#141619;border-radius:12px;padding:16px;margin:16px 0">'
        f'<tr><td style="padding:6px 0;color:#94A3B8">Codice</td><td style="padding:6px 0;text-align:right"><strong>{escape(coupon["code"])}</strong></td></tr>'
        f'<tr><td style="padding:6px 0;color:#94A3B8">Locale</td><td style="padding:6px 0;text-align:right">{escape(coupon["locale"])}</td></tr>'
        f'<tr><td style="padding:6px 0;color:#94A3B8">Premio</td><td style="padding:6px 0;text-align:right">{escape(coupon["premio"])}</td></tr>'
        f'<tr><td style="padding:6px 0;color:#94A3B8">Vincitore</td><td style="padding:6px 0;text-align:right">{escape(coupon["winner_name"])}</td></tr>'
        f'<tr><td style="padding:6px 0;color:#94A3B8">Riscattato il</td><td style="padding:6px 0;text-align:right">{escape(coupon.get("redeemed_at", ""))}</td></tr>'
        '</table>'
        '<p style="font-size:12px;color:#64748B">Inviato da La Sfida dei Locali. Non chiediamo mai password o dati della carta via email.</p>'
        '</td></tr></table>'
    )


# ---------------------------------------------------------------------------
# Models --------------------------------------------------------------------
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def gen_code() -> str:
    return "SFIDA-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=5))


class SfidaCreate(BaseModel):
    titolo: str
    locale: str
    premio: str
    expiry_hours: int = 96
    cover_image: Optional[str] = None


class Sfida(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    titolo: str
    locale: str
    premio: str
    expiry_hours: int = 96
    cover_image: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class CouponCreate(BaseModel):
    sfida_id: str
    winner_name: str
    winner_email: Optional[str] = None


class SettingsUpdate(BaseModel):
    notification_email: str


def compute_status(coupon: dict) -> str:
    if coupon.get("redeemed_at"):
        return "riscattato"
    try:
        exp = datetime.fromisoformat(coupon["expires_at"])
        if datetime.now(timezone.utc) > exp:
            return "scaduto"
    except Exception:
        pass
    return "attivo"


def serialize_coupon(coupon: dict) -> dict:
    coupon = {k: v for k, v in coupon.items() if k != "_id"}
    coupon["status"] = compute_status(coupon)
    return coupon


# ---------------------------------------------------------------------------
# Routes --------------------------------------------------------------------
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "La Sfida dei Locali API"}


@api_router.get("/sfide")
async def list_sfide():
    items = await db.sfide.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@api_router.post("/sfide")
async def create_sfida(payload: SfidaCreate):
    sfida = Sfida(**payload.model_dump())
    await db.sfide.insert_one(sfida.model_dump())
    return sfida.model_dump()


@api_router.get("/coupons")
async def list_coupons(sfida_id: Optional[str] = None):
    query = {"sfida_id": sfida_id} if sfida_id else {}
    items = await db.coupons.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [serialize_coupon(c) for c in items]


@api_router.get("/coupons/{code}")
async def get_coupon(code: str):
    coupon = await db.coupons.find_one({"code": code}, {"_id": 0})
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon non trovato")
    return serialize_coupon(coupon)


@api_router.post("/coupons")
async def create_coupon(payload: CouponCreate):
    sfida = await db.sfide.find_one({"id": payload.sfida_id}, {"_id": 0})
    if not sfida:
        raise HTTPException(status_code=404, detail="Sfida non trovata")
    code = gen_code()
    while await db.coupons.find_one({"code": code}):
        code = gen_code()
    created = datetime.now(timezone.utc)
    expires = created + timedelta(hours=sfida["expiry_hours"])
    coupon = {
        "id": str(uuid.uuid4()),
        "code": code,
        "sfida_id": sfida["id"],
        "sfida_titolo": sfida["titolo"],
        "locale": sfida["locale"],
        "premio": sfida["premio"],
        "cover_image": sfida.get("cover_image"),
        "winner_name": payload.winner_name,
        "winner_email": payload.winner_email,
        "expiry_hours": sfida["expiry_hours"],
        "created_at": created.isoformat(),
        "expires_at": expires.isoformat(),
        "redeemed_at": None,
    }
    await db.coupons.insert_one(dict(coupon))
    return serialize_coupon(coupon)


class RedeemRequest(BaseModel):
    code: str


@api_router.post("/coupons/redeem")
async def redeem_coupon(payload: RedeemRequest):
    code = payload.code.strip().upper()
    coupon = await db.coupons.find_one({"code": code}, {"_id": 0})
    if not coupon:
        raise HTTPException(status_code=404, detail="Codice coupon non valido")
    status = compute_status(coupon)
    if status == "riscattato":
        raise HTTPException(status_code=409, detail=f"Coupon gia usato il {coupon.get('redeemed_at')}")
    if status == "scaduto":
        raise HTTPException(status_code=410, detail="Coupon scaduto")

    redeemed_at = now_iso()
    await db.coupons.update_one({"code": code}, {"$set": {"redeemed_at": redeemed_at}})
    coupon["redeemed_at"] = redeemed_at

    notif = {
        "id": str(uuid.uuid4()),
        "coupon_id": coupon["id"],
        "code": coupon["code"],
        "locale": coupon["locale"],
        "premio": coupon["premio"],
        "winner_name": coupon["winner_name"],
        "sfida_titolo": coupon["sfida_titolo"],
        "message": f"Coupon {coupon['code']} convalidato da {coupon['locale']} per {coupon['winner_name']}",
        "created_at": redeemed_at,
        "read": False,
    }
    await db.notifications.insert_one(dict(notif))

    # email notification (best effort, non-blocking — never delays redemption)
    settings = await db.settings.find_one({"_id": "app"})
    admin_email = (settings or {}).get("notification_email") or DEFAULT_ADMIN_EMAIL
    email_queued = False
    if admin_email:
        asyncio.create_task(_notify_redeem_email(admin_email, dict(coupon)))
        email_queued = True

    return {"coupon": serialize_coupon(coupon), "notification": {k: v for k, v in notif.items()}, "email_sent": email_queued}


async def _notify_redeem_email(admin_email: str, coupon: dict) -> None:
    try:
        await send_email(
            to=admin_email,
            subject=f"Coupon usato: {coupon['code']} - {coupon['locale']}",
            html=_redeem_email_html(coupon),
        )
    except Exception as e:
        logger.error(f"Email notify failed: {e}")


@api_router.get("/notifications")
async def list_notifications():
    items = await db.notifications.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@api_router.post("/notifications/{notif_id}/read")
async def mark_read(notif_id: str):
    await db.notifications.update_one({"id": notif_id}, {"$set": {"read": True}})
    return {"ok": True}


@api_router.post("/notifications/read-all")
async def mark_all_read():
    await db.notifications.update_many({"read": False}, {"$set": {"read": True}})
    return {"ok": True}


@api_router.get("/settings")
async def get_settings():
    settings = await db.settings.find_one({"_id": "app"}, {"_id": 0})
    if not settings:
        settings = {"notification_email": DEFAULT_ADMIN_EMAIL}
    return settings


@api_router.put("/settings")
async def update_settings(payload: SettingsUpdate):
    await db.settings.update_one(
        {"_id": "app"}, {"$set": {"notification_email": payload.notification_email}}, upsert=True
    )
    return {"notification_email": payload.notification_email}


@api_router.get("/stats")
async def stats():
    coupons = await db.coupons.find({}, {"_id": 0}).to_list(5000)
    attivi = sum(1 for c in coupons if compute_status(c) == "attivo")
    riscattati = sum(1 for c in coupons if compute_status(c) == "riscattato")
    scaduti = sum(1 for c in coupons if compute_status(c) == "scaduto")
    total = len(coupons)
    conversion = round((riscattati / total) * 100) if total else 0
    return {"totale": total, "attivi": attivi, "riscattati": riscattati, "scaduti": scaduti, "conversione": conversion}


# ---------------------------------------------------------------------------
# Seed ----------------------------------------------------------------------
# ---------------------------------------------------------------------------
SEED_VENUES = [
    {
        "titolo": "Aperitivo per Due", "locale": "Botanical Bar Navigli", "premio": "2 Spritz + tagliere",
        "expiry_hours": 96,
        "cover_image": "https://images.unsplash.com/photo-1616091216791-a5360b5fc78a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzR8MHwxfHNlYXJjaHwxfHxpdGFsaWFuJTIwcmVzdGF1cmFudCUyMGJhciUyMGNhZmUlMjBzaG9wfGVufDB8fHx8MTc5MDM5MjczM3ww&ixlib=rb-4.1.0&q=85",
    },
    {
        "titolo": "Cena della Sfida", "locale": "Osteria del Sole", "premio": "Menu degustazione x2",
        "expiry_hours": 72,
        "cover_image": "https://images.unsplash.com/photo-1593548615309-5a45c504f994?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzR8MHwxfHNlYXJjaHwzfHxpdGFsaWFuJTIwcmVzdGF1cmFudCUyMGJhciUyMGNhZmUlMjBzaG9wfGVufDB8fHx8MTc5MDM5MjczM3ww&ixlib=rb-4.1.0&q=85",
    },
    {
        "titolo": "Pizza Night Gourmet", "locale": "Pizzeria Da Michele", "premio": "Pizza + birra artigianale",
        "expiry_hours": 48,
        "cover_image": "https://images.unsplash.com/photo-1660561973160-27dbd9963ed3?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA4Mzl8MHwxfHNlYXJjaHwyfHxhcnRpc2FuYWwlMjBiYWtlcnklMjBwaXp6YSUyMGNvY2t0YWlsfGVufDB8fHx8MTc5MDM5MjczM3ww&ixlib=rb-4.1.0&q=85",
    },
]

SEED_WINNERS = ["Marco Rossi", "Giulia Bianchi", "Luca Esposito"]


@app.on_event("startup")
async def seed_db():
    if await db.sfide.count_documents({}) > 0:
        return
    logger.info("Seeding database...")
    for i, v in enumerate(SEED_VENUES):
        sfida = Sfida(**v)
        await db.sfide.insert_one(sfida.model_dump())
        created = datetime.now(timezone.utc)
        expires = created + timedelta(hours=v["expiry_hours"])
        coupon = {
            "id": str(uuid.uuid4()),
            "code": gen_code(),
            "sfida_id": sfida.id,
            "sfida_titolo": sfida.titolo,
            "locale": sfida.locale,
            "premio": sfida.premio,
            "cover_image": sfida.cover_image,
            "winner_name": SEED_WINNERS[i],
            "winner_email": None,
            "expiry_hours": v["expiry_hours"],
            "created_at": created.isoformat(),
            "expires_at": expires.isoformat(),
            "redeemed_at": None,
        }
        await db.coupons.insert_one(coupon)
    await db.settings.update_one({"_id": "app"}, {"$set": {"notification_email": DEFAULT_ADMIN_EMAIL}}, upsert=True)
    logger.info("Seed complete.")


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
