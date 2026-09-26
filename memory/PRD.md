# La Sfida dei Locali — PRD

## Problem statement (verbatim)
"crea una webapp che si chiama la sfida dei locali, dove si crea un coupon a tempo, esempio 96 ore dall'evento, quando il vincitore va in negozio, il negoziante spara il coupon e a noi arriva una notifica che è stato usato"

## User choices
- Ruoli: Admin + Negoziante + Cliente
- Login: nessuno all'inizio (role switcher in header)
- Riscatto: scansione QR code + inserimento manuale codice
- Notifica riscatto: in-app dashboard admin (real-time) + email
- Vincitore: assegnato manualmente dall'admin
- Email notifiche admin: eugeniumnapoli@gmail.com (configurabile in dashboard)

## Architecture
- Frontend: React (CRA), Tailwind, shadcn/ui, framer-motion, qrcode.react, html5-qrcode, canvas-confetti
- Backend: FastAPI + MongoDB (motor). All routes prefixed /api
- Email: Emergent managed Resend integration (background, non-blocking)

## Personas
- Admin: crea sfide, assegna coupon, monitora statistiche e notifiche
- Negoziante: "spara il coupon" al bancone (QR o codice)
- Cliente/Vincitore: mostra la tessera coupon con QR + countdown

## Implemented (2026-06)
- Role switcher a 3 ruoli senza login
- Admin dashboard: statistiche (attivi/riscattati/scaduti/conversione), crea sfida, assegna coupon, config email
- Coupon a tempo con scadenza (ore configurabili, es. 96h) + countdown live
- Negoziante: riscatto via QR scan (html5-qrcode) + codice manuale, feedback VALIDO/NON VALIDO + confetti
- Notifiche in-app real-time (polling 5s) con campanella + pannello + email al riscatto
- Guardie: coupon già usato (409), scaduto (410), inesistente (404)
- Seed automatico: 3 sfide + 3 coupon (locali italiani)
- Testato end-to-end: backend 7/7, frontend 100%

## Backlog (P1/P2)
- P1: Notifica email/QR anche al vincitore alla creazione del coupon
- P1: Push/websocket real-time al posto del polling
- P2: Login/ruoli reali (JWT o Google) quando servirà
- P2: Storico riscatti esportabile, filtri per sfida/locale
- P2: Pannello dedicato per singolo negoziante (multi-negozio)
