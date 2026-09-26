"""Backend tests for La Sfida dei Locali - iteration 3 (admin login gate, QR, cron, WS)."""
import os
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "eugeniumnapoli@gmail.com"
ADMIN_PASSWORD = "SfidaAdmin2026"
CRON_SECRET = "c7f2a9e14b6d4c8fa0e3b512d9764af18e2c5b3a7d0f6e94"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["user"]["role"] == "admin"
    return d["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def navigli_token(session):
    r = session.post(f"{API}/auth/login", json={"email": "navigli@sfida.it", "password": "negoziante123"})
    assert r.status_code == 200
    return r.json()["token"]


# --- baseline: public endpoints ---
def test_root(session):
    assert session.get(f"{API}/").status_code == 200


def test_public_list_sfide(session):
    r = session.get(f"{API}/sfide")
    assert r.status_code == 200 and len(r.json()) >= 3


def test_public_list_coupons(session):
    r = session.get(f"{API}/coupons")
    assert r.status_code == 200
    for c in r.json():
        assert "_id" not in c
        assert c["code"].startswith("SFIDA-")


# --- Admin login ---
def test_admin_login_success(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["user"]["role"] == "admin"
    assert d["user"]["email"].lower() == ADMIN_EMAIL.lower()
    assert isinstance(d["token"], str) and len(d["token"]) > 20


def test_admin_login_invalid(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "WRONG"})
    assert r.status_code == 401


# --- Admin-protected endpoints: 401 without token, 403 with negoziante token, 200 with admin ---
ADMIN_ENDPOINTS_GET = ["/stats", "/notifications", "/negozianti", "/settings"]


@pytest.mark.parametrize("path", ADMIN_ENDPOINTS_GET)
def test_admin_get_requires_auth(session, path):
    r = session.get(f"{API}{path}")
    assert r.status_code == 401, f"{path} expected 401 got {r.status_code}"


@pytest.mark.parametrize("path", ADMIN_ENDPOINTS_GET)
def test_admin_get_negoziante_forbidden(session, path, navigli_token):
    r = session.get(f"{API}{path}", headers={"Authorization": f"Bearer {navigli_token}"})
    assert r.status_code == 403, f"{path} expected 403 got {r.status_code}"


@pytest.mark.parametrize("path", ADMIN_ENDPOINTS_GET)
def test_admin_get_ok(session, path, admin_headers):
    r = session.get(f"{API}{path}", headers=admin_headers)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text}"


def test_post_sfida_requires_admin(session):
    r = session.post(f"{API}/sfide", json={"titolo": "x", "locale": "y", "premio": "z", "expiry_hours": 24})
    assert r.status_code == 401


def test_post_sfida_negoziante_forbidden(session, navigli_token):
    r = session.post(f"{API}/sfide",
                     headers={"Authorization": f"Bearer {navigli_token}"},
                     json={"titolo": "x", "locale": "y", "premio": "z", "expiry_hours": 24})
    assert r.status_code == 403


def test_post_coupon_requires_admin(session):
    r = session.post(f"{API}/coupons", json={"sfida_id": "abc", "winner_name": "x"})
    assert r.status_code == 401


def test_put_settings_requires_admin(session):
    r = session.put(f"{API}/settings", json={"notification_email": "x@x.com"})
    assert r.status_code == 401


# --- Admin session: create sfida + assign coupon (with winner_email) ---
def test_admin_can_create_sfida_and_coupon_with_winner_email(session, admin_headers):
    r = session.post(f"{API}/sfide",
                     headers=admin_headers,
                     json={"titolo": "TEST_it3", "locale": "TEST_LocaleIT3",
                           "premio": "TEST_prizeIT3", "expiry_hours": 24})
    assert r.status_code == 200, r.text
    sfida = r.json()
    r = session.post(f"{API}/coupons",
                     headers=admin_headers,
                     json={"sfida_id": sfida["id"], "winner_name": "TEST_it3_winner",
                           "winner_email": "delivered@resend.dev"})
    assert r.status_code == 200, r.text
    code = r.json()["code"]
    assert code.startswith("SFIDA-")

    # Public QR endpoint returns 200 image/png
    r = session.get(f"{API}/coupons/{code}/qr.png")
    assert r.status_code == 200
    assert r.headers.get("content-type") == "image/png"
    assert len(r.content) > 100  # non-empty PNG bytes
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_qr_seeded_coupon_public(session):
    codes = [c["code"] for c in session.get(f"{API}/coupons").json()]
    assert codes
    r = session.get(f"{API}/coupons/{codes[0]}/qr.png")
    assert r.status_code == 200
    assert r.headers.get("content-type") == "image/png"


# --- Cron weekly report ---
def test_cron_weekly_no_auth(session):
    r = session.post(f"{API}/cron/weekly-report")
    assert r.status_code == 401


def test_cron_weekly_bad_secret(session):
    r = session.post(f"{API}/cron/weekly-report", headers={"Authorization": "Bearer WRONG"})
    assert r.status_code == 401


def test_cron_weekly_valid_secret(session):
    r = session.post(f"{API}/cron/weekly-report",
                     headers={"Authorization": f"Bearer {CRON_SECRET}"})
    assert r.status_code == 200
    assert r.json().get("status") == "accepted"


# --- Regression: negoziante scoped ---
def test_negoziante_scoped_redeem(session, admin_headers, navigli_token):
    sfida = session.post(f"{API}/sfide", headers=admin_headers, json={
        "titolo": "TEST_scoped", "locale": "Botanical Bar Navigli",
        "premio": "TEST_prize", "expiry_hours": 24
    }).json()
    coupon = session.post(f"{API}/coupons", headers=admin_headers,
                          json={"sfida_id": sfida["id"], "winner_name": "TEST_scoped_w"}).json()
    code = coupon["code"]

    # Sole tries -> 403
    sole_tok = session.post(f"{API}/auth/login",
                            json={"email": "sole@sfida.it", "password": "negoziante123"}).json()["token"]
    r = session.post(f"{API}/negoziante/redeem",
                     headers={"Authorization": f"Bearer {sole_tok}"}, json={"code": code})
    assert r.status_code == 403
    assert "altro locale" in r.json()["detail"].lower()

    # Navigli redeems own -> 200
    r = session.post(f"{API}/negoziante/redeem",
                     headers={"Authorization": f"Bearer {navigli_token}"}, json={"code": code})
    assert r.status_code == 200
    assert r.json()["coupon"]["status"] == "riscattato"


def test_notifications_has_recent_redeem(session, admin_headers):
    # create+redeem to guarantee a notification
    sfida = session.post(f"{API}/sfide", headers=admin_headers, json={
        "titolo": "TEST_notif3", "locale": "TEST_BarN3", "premio": "P", "expiry_hours": 24
    }).json()
    coupon = session.post(f"{API}/coupons", headers=admin_headers,
                          json={"sfida_id": sfida["id"], "winner_name": "TEST_notif3_w"}).json()
    r = session.post(f"{API}/coupons/redeem", json={"code": coupon["code"]})
    assert r.status_code == 200
    time.sleep(0.5)
    notifs = session.get(f"{API}/notifications", headers=admin_headers).json()
    assert any(n["code"] == coupon["code"] for n in notifs)


# ------------------------------------------------------------------
# Iteration 4: Negoziante-proposed coupons + admin approval workflow
# ------------------------------------------------------------------
def test_iter4_negoziante_creates_pending_coupon(session, admin_headers, navigli_token):
    # Ensure a sfida exists for Botanical Bar Navigli
    sfida = session.post(f"{API}/sfide", headers=admin_headers, json={
        "titolo": "TEST_it4_sfida", "locale": "Botanical Bar Navigli",
        "premio": "TEST_it4_prize", "expiry_hours": 24,
    }).json()

    # Negoziante submits request
    r = session.post(f"{API}/negoziante/coupons",
                     headers={"Authorization": f"Bearer {navigli_token}"},
                     json={"sfida_id": sfida["id"], "winner_name": "TEST_it4_winner"})
    assert r.status_code == 200, r.text
    coupon = r.json()
    assert coupon["status"] == "in_attesa"
    assert coupon["approval_status"] == "pending"
    assert coupon["locale"] == "Botanical Bar Navigli"
    assert coupon["code"].startswith("SFIDA-")

    # Redeem while pending -> 409
    r = session.post(f"{API}/negoziante/redeem",
                     headers={"Authorization": f"Bearer {navigli_token}"},
                     json={"code": coupon["code"]})
    assert r.status_code == 409
    assert "attesa" in r.json()["detail"].lower()

    # Appears in /coupon-requests
    reqs = session.get(f"{API}/coupon-requests", headers=admin_headers).json()
    assert any(x["code"] == coupon["code"] for x in reqs)

    # Approve -> becomes active
    r = session.post(f"{API}/coupons/{coupon['id']}/approve", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "attivo"
    assert r.json()["approval_status"] == "approved"

    # Now redeemable
    r = session.post(f"{API}/negoziante/redeem",
                     headers={"Authorization": f"Bearer {navigli_token}"},
                     json={"code": coupon["code"]})
    assert r.status_code == 200
    assert r.json()["coupon"]["status"] == "riscattato"

    # Re-approve already handled -> 409
    r = session.post(f"{API}/coupons/{coupon['id']}/approve", headers=admin_headers)
    assert r.status_code == 409


def test_iter4_admin_rejects_request(session, admin_headers, navigli_token):
    sfida = session.post(f"{API}/sfide", headers=admin_headers, json={
        "titolo": "TEST_it4_reject", "locale": "Botanical Bar Navigli",
        "premio": "TEST_reject_prize", "expiry_hours": 24,
    }).json()
    coupon = session.post(f"{API}/negoziante/coupons",
                          headers={"Authorization": f"Bearer {navigli_token}"},
                          json={"sfida_id": sfida["id"], "winner_name": "TEST_reject_w"}).json()

    r = session.post(f"{API}/coupons/{coupon['id']}/reject", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "rifiutato"
    assert r.json()["approval_status"] == "rejected"

    # Not redeemable
    r = session.post(f"{API}/negoziante/redeem",
                     headers={"Authorization": f"Bearer {navigli_token}"},
                     json={"code": coupon["code"]})
    assert r.status_code == 409
    assert "rifiutato" in r.json()["detail"].lower()

    # No longer in pending list
    reqs = session.get(f"{API}/coupon-requests", headers=admin_headers).json()
    assert not any(x["code"] == coupon["code"] for x in reqs)


def test_iter4_negoziante_cannot_request_other_locale(session, admin_headers, navigli_token):
    sfida = session.post(f"{API}/sfide", headers=admin_headers, json={
        "titolo": "TEST_it4_other", "locale": "Osteria del Sole",
        "premio": "prize", "expiry_hours": 24,
    }).json()
    r = session.post(f"{API}/negoziante/coupons",
                     headers={"Authorization": f"Bearer {navigli_token}"},
                     json={"sfida_id": sfida["id"], "winner_name": "x"})
    assert r.status_code == 403


def test_iter4_coupon_requests_requires_admin(session, navigli_token):
    r = session.get(f"{API}/coupon-requests")
    assert r.status_code == 401
    r = session.get(f"{API}/coupon-requests",
                    headers={"Authorization": f"Bearer {navigli_token}"})
    assert r.status_code == 403


def test_iter4_negoziante_coupons_requires_negoziante(session, admin_headers):
    r = session.post(f"{API}/negoziante/coupons", json={"sfida_id": "x", "winner_name": "y"})
    assert r.status_code == 401
    # admin token has no locale -> 403
    r = session.post(f"{API}/negoziante/coupons", headers=admin_headers,
                     json={"sfida_id": "x", "winner_name": "y"})
    assert r.status_code == 403
