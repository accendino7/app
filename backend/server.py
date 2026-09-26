import os
import re
import ipaddress
import logging
import random
import string
import asyncio
import io
import secrets
import qrcode
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, WebSocket, WebSocketDisconnect, Response
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
APP_BASE_URL = os.environ.get("APP_BASE_URL", "").rstrip("/")

# Auth (JWT, Bearer header) -------------------------------------------------
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "").strip().lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
WEBHOOK_CRON_SECRET = os.environ.get("WEBHOOK_CRON_SECRET", "")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _decode_token(token) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Non autenticato")
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessione scaduta")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token non valido")


def _token_from_request(request: Request):
    auth = request.headers.get("Authorization", "")
    return auth[7:] if auth.startswith("Bearer ") else None


async def get_current_user(request: Request) -> dict:
    payload = _decode_token(_token_from_request(request))
    role = payload.get("role")
    coll = db.admins if role == "admin" else db.negozianti
    user = await coll.find_one({"id": payload.get("sub")}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Account non trovato")
    user["role"] = role
    return user


async def get_current_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Accesso riservato all'admin")
    return user


async def get_current_negoziante(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "negoziante":
        raise HTTPException(status_code=403, detail="Accesso riservato ai negozianti")
    return user


class WSManager:
    def __init__(self):
        self.active = set()

    async def connect(self, ws):
        await ws.accept()
        self.active.add(ws)

    def disconnect(self, ws):
        self.active.discard(ws)

    async def broadcast(self, msg: dict):
        for ws in list(self.active):
            try:
                await ws.send_json(msg)
            except Exception:
                self.disconnect(ws)


ws_manager = WSManager()

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
async def create_sfida(payload: SfidaCreate, _admin: dict = Depends(get_current_admin)):
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


@api_router.get("/coupons/{code}/qr.png")
async def coupon_qr(code: str):
    img = qrcode.make(code)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png",
                    headers={"Cache-Control": "public, max-age=86400"})


@api_router.post("/coupons")
async def create_coupon(payload: CouponCreate, _admin: dict = Depends(get_current_admin)):
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
    if payload.winner_email:
        asyncio.create_task(_notify_winner_email(payload.winner_email.strip(), dict(coupon)))
    return serialize_coupon(coupon)


class RedeemRequest(BaseModel):
    code: str


@api_router.post("/coupons/redeem")
async def redeem_coupon(payload: RedeemRequest):
    code = payload.code.strip().upper()
    coupon = await db.coupons.find_one({"code": code}, {"_id": 0})
    if not coupon:
        raise HTTPException(status_code=404, detail="Codice coupon non valido")
    return await _do_redeem(coupon, code)


async def _do_redeem(coupon: dict, code: str) -> dict:
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
    asyncio.create_task(ws_manager.broadcast({"type": "redeem", "notification": {k: v for k, v in notif.items()}}))

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


def _winner_email_html(coupon: dict) -> str:
    link = f"{APP_BASE_URL}/?coupon={coupon['code']}"
    return (
        '<table role="presentation" width="100%" style="background:#0C0D0E;padding:24px">'
        '<tr><td style="font-family:Arial,sans-serif;color:#F8FAFC;max-width:520px;margin:auto">'
        '<h2 style="color:#F59E0B;margin:0 0 12px">Hai vinto la Sfida dei Locali! \U0001F3C6</h2>'
        f'<p>Complimenti {escape(coupon["winner_name"])}, hai vinto '
        f'<strong>{escape(coupon["premio"])}</strong> presso <strong>{escape(coupon["locale"])}</strong>.</p>'
        f'<p>Il tuo codice coupon e <strong>{escape(coupon["code"])}</strong>. '
        f'Scade il <strong>{escape(coupon["expires_at"])}</strong>.</p>'
        f'<p style="text-align:center;margin:16px 0"><img src="{APP_BASE_URL}/api/coupons/{escape(coupon["code"])}/qr.png" '
        'alt="QR coupon" width="180" height="180" style="background:#fff;padding:10px;border-radius:12px" /></p>'
        f'<p style="margin:20px 0"><a href="{link}" style="display:inline-block;background:#F59E0B;'
        'color:#000;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">'
        'Apri la tua tessera con QR e countdown</a></p>'
        '<p style="font-size:12px;color:#64748B">Mostra il QR code alla cassa del locale entro la scadenza. '
        'Inviato da La Sfida dei Locali. Non chiediamo mai password o dati della carta via email.</p>'
        '</td></tr></table>'
    )


async def _notify_winner_email(to: str, coupon: dict) -> None:
    try:
        await send_email(
            to=to,
            subject=f"Hai vinto: {coupon['premio']} - {coupon['locale']}",
            html=_winner_email_html(coupon),
        )
    except Exception as e:
        logger.error(f"Winner email failed: {e}")


@api_router.get("/notifications")
async def list_notifications(_admin: dict = Depends(get_current_admin)):
    items = await db.notifications.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@api_router.post("/notifications/{notif_id}/read")
async def mark_read(notif_id: str, _admin: dict = Depends(get_current_admin)):
    await db.notifications.update_one({"id": notif_id}, {"$set": {"read": True}})
    return {"ok": True}


@api_router.post("/notifications/read-all")
async def mark_all_read(_admin: dict = Depends(get_current_admin)):
    await db.notifications.update_many({"read": False}, {"$set": {"read": True}})
    return {"ok": True}


@api_router.get("/settings")
async def get_settings(_admin: dict = Depends(get_current_admin)):
    settings = await db.settings.find_one({"_id": "app"}, {"_id": 0})
    if not settings:
        settings = {"notification_email": DEFAULT_ADMIN_EMAIL}
    return settings


@api_router.put("/settings")
async def update_settings(payload: SettingsUpdate, _admin: dict = Depends(get_current_admin)):
    await db.settings.update_one(
        {"_id": "app"}, {"$set": {"notification_email": payload.notification_email}}, upsert=True
    )
    return {"notification_email": payload.notification_email}


@api_router.get("/stats")
async def stats(_admin: dict = Depends(get_current_admin)):
    coupons = await db.coupons.find({}, {"_id": 0}).to_list(5000)
    attivi = sum(1 for c in coupons if compute_status(c) == "attivo")
    riscattati = sum(1 for c in coupons if compute_status(c) == "riscattato")
    scaduti = sum(1 for c in coupons if compute_status(c) == "scaduto")
    total = len(coupons)
    conversion = round((riscattati / total) * 100) if total else 0
    return {"totale": total, "attivi": attivi, "riscattati": riscattati, "scaduti": scaduti, "conversione": conversion}


# ---------------------------------------------------------------------------
# Auth & Negozianti ---------------------------------------------------------
# ---------------------------------------------------------------------------
class NegozianteCreate(BaseModel):
    name: str
    email: str
    password: str
    locale: str


class LoginRequest(BaseModel):
    email: str
    password: str


@api_router.get("/negozianti")
async def list_negozianti(_admin: dict = Depends(get_current_admin)):
    return await db.negozianti.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)


@api_router.post("/negozianti")
async def create_negoziante(payload: NegozianteCreate, _admin: dict = Depends(get_current_admin)):
    email = payload.email.strip().lower()
    if await db.negozianti.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email gia registrata")
    neg = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "email": email,
        "password_hash": hash_password(payload.password),
        "locale": payload.locale.strip(),
        "created_at": now_iso(),
    }
    await db.negozianti.insert_one(dict(neg))
    return {k: v for k, v in neg.items() if k != "password_hash"}


@api_router.delete("/negozianti/{neg_id}")
async def delete_negoziante(neg_id: str, _admin: dict = Depends(get_current_admin)):
    res = await db.negozianti.delete_one({"id": neg_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Account non trovato")
    return {"ok": True}


@api_router.post("/auth/login")
async def login(payload: LoginRequest):
    email = payload.email.strip().lower()
    admin = await db.admins.find_one({"email": email})
    if admin and verify_password(payload.password, admin["password_hash"]):
        token = create_access_token(admin["id"], email, "admin")
        return {"token": token, "user": {"id": admin["id"], "name": admin["name"], "email": admin["email"], "role": "admin"}}
    neg = await db.negozianti.find_one({"email": email})
    if neg and verify_password(payload.password, neg["password_hash"]):
        token = create_access_token(neg["id"], email, "negoziante")
        return {"token": token, "user": {"id": neg["id"], "name": neg["name"], "email": neg["email"], "locale": neg["locale"], "role": "negoziante"}}
    raise HTTPException(status_code=401, detail="Email o password non validi")


@api_router.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return user


@api_router.get("/negoziante/coupons")
async def negoziante_coupons(neg: dict = Depends(get_current_negoziante)):
    items = await db.coupons.find({"locale": neg["locale"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [serialize_coupon(c) for c in items]


@api_router.post("/negoziante/redeem")
async def negoziante_redeem(payload: RedeemRequest, neg: dict = Depends(get_current_negoziante)):
    code = payload.code.strip().upper()
    coupon = await db.coupons.find_one({"code": code}, {"_id": 0})
    if not coupon:
        raise HTTPException(status_code=404, detail="Codice coupon non valido")
    if coupon["locale"] != neg["locale"]:
        raise HTTPException(status_code=403, detail=f"Coupon di un altro locale: {coupon['locale']}")
    return await _do_redeem(coupon, code)


# ---------------------------------------------------------------------------
# WebSocket (real-time admin notifications) ---------------------------------
# ---------------------------------------------------------------------------
@app.websocket("/api/ws/notifications")
async def ws_notifications(websocket: WebSocket):
    token = websocket.query_params.get("token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("role") != "admin":
            raise ValueError("not admin")
    except Exception:
        await websocket.close(code=1008)
        return
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except Exception:
        ws_manager.disconnect(websocket)


# ---------------------------------------------------------------------------
# Weekly report (scheduled via .emergent/crons.yml) -------------------------
# ---------------------------------------------------------------------------
def _weekly_report_html(groups: dict, total: int, since_label: str) -> str:
    rows = ""
    for locale, items in groups.items():
        rows += (
            f'<tr><td style="padding:6px 0;color:#94A3B8">{escape(locale)}</td>'
            f'<td style="padding:6px 0;text-align:right"><strong>{len(items)}</strong></td></tr>'
        )
    if not rows:
        rows = '<tr><td style="padding:6px 0;color:#94A3B8">Nessun riscatto in questa settimana.</td><td></td></tr>'
    return (
        '<table role="presentation" width="100%" style="background:#0C0D0E;padding:24px">'
        '<tr><td style="font-family:Arial,sans-serif;color:#F8FAFC;max-width:520px;margin:auto">'
        '<h2 style="color:#F59E0B;margin:0 0 12px">Report settimanale \U0001F4CA</h2>'
        f'<p>Coupon riscattati dal {escape(since_label)} a oggi: <strong>{total}</strong>.</p>'
        '<table role="presentation" width="100%" style="background:#141619;border-radius:12px;padding:16px;margin:16px 0">'
        '<tr><td style="padding:6px 0;color:#64748B">Locale</td>'
        '<td style="padding:6px 0;text-align:right;color:#64748B">Riscatti</td></tr>'
        f'{rows}'
        '</table>'
        '<p style="font-size:12px;color:#64748B">Inviato da La Sfida dei Locali. '
        'Non chiediamo mai password o dati della carta via email.</p>'
        '</td></tr></table>'
    )


async def _send_weekly_report(run_id: str) -> None:
    if run_id:
        if await db.cron_runs.find_one({"_id": run_id}):
            return
        await db.cron_runs.insert_one({"_id": run_id, "at": now_iso()})
    since_dt = datetime.now(timezone.utc) - timedelta(days=7)
    since = since_dt.isoformat()
    notifs = await db.notifications.find({"created_at": {"$gte": since}}, {"_id": 0}).to_list(5000)
    groups = {}
    for n in notifs:
        groups.setdefault(n.get("locale", "-"), []).append(n)
    settings = await db.settings.find_one({"_id": "app"})
    admin_email = (settings or {}).get("notification_email") or DEFAULT_ADMIN_EMAIL
    if not admin_email:
        return
    try:
        await send_email(
            to=admin_email,
            subject=f"Report settimanale - {len(notifs)} riscatti",
            html=_weekly_report_html(groups, len(notifs), since_dt.strftime("%d/%m/%Y")),
        )
    except Exception as e:
        logger.error(f"Weekly report email failed: {e}")


@api_router.post("/cron/weekly-report")
async def cron_weekly_report(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    token = _token_from_request(request) or ""
    if not WEBHOOK_CRON_SECRET or not secrets.compare_digest(token, WEBHOOK_CRON_SECRET):
        raise HTTPException(status_code=401, detail="unauthorized")
    run_id = request.headers.get("X-Webhook-Id", "")
    asyncio.create_task(_send_weekly_report(run_id))
    return {"status": "accepted"}


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
    seed_negozianti = [
        {"name": "Marco (Navigli)", "email": "navigli@sfida.it", "locale": "Botanical Bar Navigli"},
        {"name": "Anna (Sole)", "email": "sole@sfida.it", "locale": "Osteria del Sole"},
        {"name": "Gennaro (Michele)", "email": "michele@sfida.it", "locale": "Pizzeria Da Michele"},
    ]
    for n in seed_negozianti:
        await db.negozianti.insert_one({
            "id": str(uuid.uuid4()),
            "name": n["name"],
            "email": n["email"],
            "password_hash": hash_password("negoziante123"),
            "locale": n["locale"],
            "created_at": now_iso(),
        })
    logger.info("Seed complete.")


@app.on_event("startup")
async def ensure_indexes():
    try:
        await db.negozianti.create_index("email", unique=True)
        await db.admins.create_index("email", unique=True)
    except Exception as e:
        logger.error(f"Index creation failed: {e}")
    # seed / update the admin account (idempotent)
    if ADMIN_EMAIL and ADMIN_PASSWORD:
        existing = await db.admins.find_one({"email": ADMIN_EMAIL})
        if not existing:
            await db.admins.insert_one({
                "id": str(uuid.uuid4()),
                "name": "Admin",
                "email": ADMIN_EMAIL,
                "password_hash": hash_password(ADMIN_PASSWORD),
                "created_at": now_iso(),
            })
        elif not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
            await db.admins.update_one(
                {"email": ADMIN_EMAIL}, {"$set": {"password_hash": hash_password(ADMIN_PASSWORD)}}
            )


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
