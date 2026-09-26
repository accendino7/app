"""Backend tests for La Sfida dei Locali."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://sfida-locali.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def test_root(session):
    r = session.get(f"{API}/")
    assert r.status_code == 200
    assert "message" in r.json()


def test_list_sfide(session):
    r = session.get(f"{API}/sfide")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 3
    assert {"id", "titolo", "locale", "premio", "expiry_hours"} <= set(data[0].keys())


def test_list_coupons(session):
    r = session.get(f"{API}/coupons")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) >= 3
    c = data[0]
    assert c["code"].startswith("SFIDA-")
    assert c["status"] in {"attivo", "riscattato", "scaduto"}
    assert "_id" not in c


def test_stats(session):
    r = session.get(f"{API}/stats")
    assert r.status_code == 200
    d = r.json()
    for k in ["totale", "attivi", "riscattati", "scaduti", "conversione"]:
        assert k in d


def test_create_sfida_and_coupon_flow(session):
    # create sfida
    payload = {"titolo": "TEST_Sfida", "locale": "TEST_Bar", "premio": "TEST_Prize", "expiry_hours": 24}
    r = session.post(f"{API}/sfide", json=payload)
    assert r.status_code == 200, r.text
    sfida = r.json()
    assert sfida["titolo"] == "TEST_Sfida"
    sfida_id = sfida["id"]

    # verify persistence
    r = session.get(f"{API}/sfide")
    assert any(s["id"] == sfida_id for s in r.json())

    # create coupon
    r = session.post(f"{API}/coupons", json={"sfida_id": sfida_id, "winner_name": "TEST_Winner"})
    assert r.status_code == 200, r.text
    coupon = r.json()
    assert coupon["code"].startswith("SFIDA-")
    assert coupon["status"] == "attivo"
    code = coupon["code"]

    # get by code
    r = session.get(f"{API}/coupons/{code}")
    assert r.status_code == 200
    assert r.json()["winner_name"] == "TEST_Winner"

    # redeem
    r = session.post(f"{API}/coupons/redeem", json={"code": code})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["coupon"]["status"] == "riscattato"
    assert body["notification"]["code"] == code

    # redeem again -> 409
    r = session.post(f"{API}/coupons/redeem", json={"code": code})
    assert r.status_code == 409

    # bogus code -> 404
    r = session.post(f"{API}/coupons/redeem", json={"code": "SFIDA-NOPE1"})
    assert r.status_code == 404

    # notification appeared
    r = session.get(f"{API}/notifications")
    assert r.status_code == 200
    assert any(n["code"] == code for n in r.json())


def test_create_coupon_invalid_sfida(session):
    r = session.post(f"{API}/coupons", json={"sfida_id": "does-not-exist", "winner_name": "X"})
    assert r.status_code == 404


def test_settings_persist(session):
    email = "TEST_admin@example.com"
    r = session.put(f"{API}/settings", json={"notification_email": email})
    assert r.status_code == 200
    r = session.get(f"{API}/settings")
    assert r.json()["notification_email"] == email
    # restore
    session.put(f"{API}/settings", json={"notification_email": "eugeniumnapoli@gmail.com"})
