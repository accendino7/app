"""Backend tests for La Sfida dei Locali (iteration 2: auth, scoped redeem, negozianti, winner email)."""
import os
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- baseline sanity ---
def test_root(session):
    r = session.get(f"{API}/")
    assert r.status_code == 200


def test_list_sfide(session):
    r = session.get(f"{API}/sfide")
    assert r.status_code == 200
    assert len(r.json()) >= 3


def test_list_coupons(session):
    r = session.get(f"{API}/coupons")
    assert r.status_code == 200
    for c in r.json():
        assert "_id" not in c
        assert c["code"].startswith("SFIDA-")


def test_stats(session):
    r = session.get(f"{API}/stats")
    assert r.status_code == 200
    for k in ["totale", "attivi", "riscattati", "scaduti", "conversione"]:
        assert k in r.json()


# --- Auth / Negozianti ---
def test_login_invalid(session):
    r = session.post(f"{API}/auth/login", json={"email": "navigli@sfida.it", "password": "wrong"})
    assert r.status_code == 401
    assert "detail" in r.json()


def test_login_success_navigli(session):
    r = session.post(f"{API}/auth/login", json={"email": "navigli@sfida.it", "password": "negoziante123"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert "token" in d and isinstance(d["token"], str) and len(d["token"]) > 20
    assert d["negoziante"]["locale"] == "Botanical Bar Navigli"


@pytest.fixture(scope="module")
def navigli_token(session):
    r = session.post(f"{API}/auth/login", json={"email": "navigli@sfida.it", "password": "negoziante123"})
    return r.json()["token"]


@pytest.fixture(scope="module")
def sole_token(session):
    r = session.post(f"{API}/auth/login", json={"email": "sole@sfida.it", "password": "negoziante123"})
    return r.json()["token"]


def test_auth_me_requires_token(session):
    r = session.get(f"{API}/auth/me")
    assert r.status_code == 401


def test_auth_me_ok(session, navigli_token):
    r = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {navigli_token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "navigli@sfida.it"
    assert "password_hash" not in r.json()


def test_negoziante_coupons_scoped(session, navigli_token):
    r = session.get(f"{API}/negoziante/coupons", headers={"Authorization": f"Bearer {navigli_token}"})
    assert r.status_code == 200
    items = r.json()
    for c in items:
        assert c["locale"] == "Botanical Bar Navigli"


# --- Scoped redeem: cross-locale = 403, own = 200 ---
def test_negoziante_scoped_redeem(session, navigli_token, sole_token):
    # create a fresh sfida+coupon for Botanical Bar Navigli
    sfida = session.post(f"{API}/sfide", json={
        "titolo": "TEST_it2 sfida", "locale": "Botanical Bar Navigli",
        "premio": "TEST prize", "expiry_hours": 24
    }).json()
    coupon = session.post(f"{API}/coupons", json={"sfida_id": sfida["id"], "winner_name": "TEST_it2"}).json()
    code = coupon["code"]

    # Sole tries to redeem Navigli coupon -> 403
    r = session.post(f"{API}/negoziante/redeem",
                     headers={"Authorization": f"Bearer {sole_token}"},
                     json={"code": code})
    assert r.status_code == 403, r.text
    assert "altro locale" in r.json()["detail"].lower()

    # Navigli redeems own coupon -> 200
    r = session.post(f"{API}/negoziante/redeem",
                     headers={"Authorization": f"Bearer {navigli_token}"},
                     json={"code": code})
    assert r.status_code == 200, r.text
    assert r.json()["coupon"]["status"] == "riscattato"

    # again -> 409
    r = session.post(f"{API}/negoziante/redeem",
                     headers={"Authorization": f"Bearer {navigli_token}"},
                     json={"code": code})
    assert r.status_code == 409


def test_negoziante_redeem_no_token(session):
    r = session.post(f"{API}/negoziante/redeem", json={"code": "SFIDA-XXXXX"})
    assert r.status_code == 401


# --- Negozianti CRUD ---
def test_negozianti_crud(session):
    r = session.get(f"{API}/negozianti")
    assert r.status_code == 200
    assert len(r.json()) >= 3

    email = f"test_neg_{int(time.time())}@example.com"
    r = session.post(f"{API}/negozianti", json={
        "name": "TEST_Negoziante", "email": email, "password": "pass123456", "locale": "TEST_Locale"
    })
    assert r.status_code == 200, r.text
    neg = r.json()
    assert neg["email"] == email
    assert "password_hash" not in neg
    neg_id = neg["id"]

    # dup -> 409
    r = session.post(f"{API}/negozianti", json={
        "name": "x", "email": email, "password": "pass123456", "locale": "TEST_Locale"
    })
    assert r.status_code == 409

    # login works
    r = session.post(f"{API}/auth/login", json={"email": email, "password": "pass123456"})
    assert r.status_code == 200

    # delete
    r = session.delete(f"{API}/negozianti/{neg_id}")
    assert r.status_code == 200


# --- Winner email creates coupon and returns 200 ---
def test_create_coupon_with_winner_email(session):
    sfida = session.post(f"{API}/sfide", json={
        "titolo": "TEST_wemail", "locale": "TEST_BarE", "premio": "TEST_PrizeE", "expiry_hours": 24
    }).json()
    r = session.post(f"{API}/coupons", json={
        "sfida_id": sfida["id"], "winner_name": "TEST_wemail_winner",
        "winner_email": "delivered@resend.dev",
    })
    assert r.status_code == 200, r.text
    assert r.json()["code"].startswith("SFIDA-")


# --- Notifications after redeem ---
def test_redeem_creates_notification(session):
    sfida = session.post(f"{API}/sfide", json={
        "titolo": "TEST_notif", "locale": "TEST_BarN", "premio": "P", "expiry_hours": 24
    }).json()
    coupon = session.post(f"{API}/coupons", json={"sfida_id": sfida["id"], "winner_name": "TEST_N"}).json()
    r = session.post(f"{API}/coupons/redeem", json={"code": coupon["code"]})
    assert r.status_code == 200
    time.sleep(0.5)
    notifs = session.get(f"{API}/notifications").json()
    assert any(n["code"] == coupon["code"] for n in notifs)


def test_settings_persist(session):
    orig = session.get(f"{API}/settings").json().get("notification_email", "")
    r = session.put(f"{API}/settings", json={"notification_email": "TEST_admin@example.com"})
    assert r.status_code == 200
    assert session.get(f"{API}/settings").json()["notification_email"] == "TEST_admin@example.com"
    # restore
    session.put(f"{API}/settings", json={"notification_email": orig or "eugeniumnapoli@gmail.com"})
