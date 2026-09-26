# La Sfida dei Locali — PRD

## Problem statement (verbatim)
"crea una webapp che si chiama la sfida dei locali, dove si crea un coupon a tempo, esempio 96 ore dall'evento, quando il vincitore va in negozio, il negoziante spara il coupon e a noi arriva una notifica che è stato usato"

## Ruoli & accesso
- Admin: LOGIN richiesto (JWT). Crea sfide, assegna coupon, gestisce negozianti, storico/CSV, config email, notifiche real-time.
- Negoziante: LOGIN richiesto (JWT), scoped al proprio locale ("spara il coupon" QR/codice).
- Cliente/Vincitore: pubblico (tessera QR + countdown, deep-link ?coupon=CODE). Nessun dato richiesto.
- Token unico JWT (role) in localStorage `sfida_token`. Account admin seed da .env; account negoziante creati dall'Admin.

## Architecture
- Frontend: React (CRA), Tailwind, shadcn/ui, framer-motion, qrcode.react, html5-qrcode, canvas-confetti, AuthContext
- Backend: FastAPI + MongoDB (motor), JWT (PyJWT) + bcrypt, WebSocket real-time, qrcode (PNG)
- Email: Emergent managed Resend (background, non-blocking)
- Cron: `.emergent/crons.yml` (report settimanale, endpoint /api/cron/weekly-report protetto da WEBHOOK_CRON_SECRET)

## Implemented
### 2026-06 MVP
- Role switcher; sfide + coupon a tempo con countdown; riscatto QR+codice; notifiche in-app + email; seed 3 locali. (7/7, 100%)
### 2026-06 Iterazione 2
- Tessera vincitore via email (link); notifiche istantanee (beep+toast); Storico + CSV; login Negozianti JWT scoped; gestione account negoziante. (15/15, 100%)
### 2026-06 Iterazione 3
- Notifiche Push real-time via WebSocket (fallback polling 15s) per l'Admin
- Pannello Admin protetto da login (endpoint admin: 401 senza token, 403 per negoziante)
- QR code (immagine) dentro l'email della tessera vincitore + endpoint pubblico /api/coupons/{code}/qr.png (cache 24h)
- Report settimanale via email all'admin (cron lunedì 08:00 UTC)
- Verificato: backend 28/28, frontend 100%, WebSocket end-to-end confermato

## Backlog (P1/P2)
- P1: heartbeat/ping sul WebSocket per connessioni idle dietro proxy
- P2: migrare startup/shutdown a lifespan handlers (FastAPI ≥0.109)
- P2: split server.py in moduli (auth/email/routes/websocket/cron)
- P2: multi-negozio per singolo negoziante; login per Cliente se necessario
