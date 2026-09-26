# La Sfida dei Locali — PRD

## Problem statement (verbatim)
"crea una webapp che si chiama la sfida dei locali, dove si crea un coupon a tempo, esempio 96 ore dall'evento, quando il vincitore va in negozio, il negoziante spara il coupon e a noi arriva una notifica che è stato usato"

## User choices
- Ruoli: Admin + Negoziante + Cliente (role switcher in header)
- Login: solo i Negozianti (JWT email+password, token Bearer in localStorage). Admin e Cliente senza login. Account negoziante creati dall'Admin.
- Riscatto: scansione QR code + inserimento manuale codice
- Notifica riscatto: in-app dashboard admin (real-time, beep+toast) + email
- Vincitore: assegnato manualmente dall'admin; il vincitore non fornisce dati (email tessera solo se l'admin la inserisce)
- Email notifiche admin: eugeniumnapoli@gmail.com (configurabile in dashboard)

## Architecture
- Frontend: React (CRA), Tailwind, shadcn/ui, framer-motion, qrcode.react, html5-qrcode, canvas-confetti; AuthContext + localStorage token
- Backend: FastAPI + MongoDB (motor). Route con prefisso /api. JWT (PyJWT) + bcrypt
- Email: Emergent managed Resend (invio in background, non-blocking) — notifica riscatto all'admin + tessera al vincitore

## Personas
- Admin: crea sfide, assegna coupon, gestisce account negozianti, monitora statistiche/notifiche, storico riscatti (CSV)
- Negoziante: login → "spara il coupon" al bancone (QR o codice), scoped al proprio locale
- Cliente/Vincitore: mostra la tessera coupon con QR + countdown (deep-link ?coupon=CODE)

## Implemented
### 2026-06 (MVP)
- Role switcher a 3 ruoli; sfide + coupon a tempo con countdown; riscatto QR+codice; notifiche in-app + email; seed 3 locali; testato 7/7 backend, 100% frontend
### 2026-06 (Iterazione 2)
- Tessera al Vincitore via email (link a QR+countdown) se l'admin inserisce winner_email
- Notifiche istantanee: polling 3s + beep sonoro + toast per l'Admin (baseline seenCountRef, nessun toast al load)
- Storico Riscatti: tab Admin con filtri per locale/sfida + export CSV
- Accesso Negozianti: login JWT scoped al locale; gestione account negoziante dall'Admin (crea/lista/elimina); redeem scoped (403 cross-locale, 401 senza token)
- Testato: backend 15/15, frontend 100%

## Backlog (P1/P2)
- P1: Push/websocket real-time al posto del polling
- P1: Restringere gli endpoint admin (GET/POST/DELETE /negozianti) dietro un ruolo admin autenticato
- P2: Login/ruoli per Admin e Cliente (se necessario in futuro)
- P2: Multi-negozio per singolo negoziante; QR embed diretto nell'email
- P2: Refactor server.py in moduli (auth, email, seed)
