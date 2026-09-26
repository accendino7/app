# La Sfida dei Locali — PRD

## Problem statement (verbatim)
"crea una webapp che si chiama la sfida dei locali, dove si crea un coupon a tempo, esempio 96 ore dall'evento, quando il vincitore va in negozio, il negoziante spara il coupon e a noi arriva una notifica che è stato usato"

## Ruoli & accesso
- Admin: LOGIN (JWT). Crea coupon/sfide, assegna vincitori, gestisce negozianti, approva/rifiuta richieste, storico/CSV, notifiche real-time.
- Negoziante: LOGIN (JWT), scoped al proprio locale. Spara coupon (QR/codice) e PROPONE coupon (con approvazione admin).
- Cliente/Vincitore: pubblico (tessera QR + countdown, deep-link ?coupon=CODE).
- Token unico JWT (role) in localStorage `sfida_token`. Admin seed da .env; negozianti creati dall'Admin.

## Architecture
- Frontend: React (CRA), Tailwind, shadcn/ui, framer-motion, qrcode.react, html5-qrcode, canvas-confetti, AuthContext, WebSocket client
- Backend: FastAPI + MongoDB (motor), JWT (PyJWT) + bcrypt, WebSocket real-time, qrcode (PNG)
- Email: Emergent managed Resend (background). Cron: `.emergent/crons.yml` (report settimanale).

## Implemented (tutte le iterazioni verificate 100%)
### MVP
- Role switcher; coupon a tempo con countdown; riscatto QR+codice; notifiche in-app+email; seed 3 locali.
### Iterazione 2
- Tessera vincitore email; notifiche istantanee (beep+toast); Storico+CSV; login Negozianti JWT scoped; gestione account negoziante.
### Iterazione 3
- WebSocket real-time (fallback polling 15s); Pannello Admin protetto da login; QR immagine in email + endpoint /api/coupons/{code}/qr.png; report settimanale (cron).
### Iterazione 4 (2026-06)
- Il negoziante propone/crea un coupon (POST /api/negoziante/coupons) in stato `in_attesa`
- Admin lo APPROVA (diventa `attivo`, countdown parte all'approvazione, email vincitore se presente) o RIFIUTA (`rifiutato`)
- Tab Admin "Richieste" con badge contatore + real-time (WS type=request, toast+beep)
- Coupon pending non riscattabile (409). Stati UI: in_attesa (viola) / rifiutato / attivo / riscattato / scaduto
- Verificato: backend 33/33, frontend 6/6 flussi. WS request end-to-end (~600ms).

## Backlog (P1/P2)
- P1: heartbeat/ping WebSocket; Promise.allSettled in AdminView.refresh
- P2: endpoint scoped GET /api/negoziante/sfide; estrarre helper badge status condiviso
- P2: split server.py in moduli; migrare a lifespan handlers
