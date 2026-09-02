# Tanwir Emailer

A Next.js app that sends transactional email for Tanwir Institute via the Gmail API (OAuth2). Deployed at `email.tanwir.institute`, reached through the root gateway's subdomain proxy.

## Setup

1. Install dependencies: `npm install`
2. Create a `.env` with:
   - `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` — OAuth2 credentials for the sending Gmail account
   - `SENDER_NAME` / `SENDER_EMAIL` — default From header
   - `MAIL_API_TOKEN` — shared secret required on every `send-*` endpoint; must match `ZAKAT_MAIL_API_TOKEN` in `consent/.env`
3. `npm run dev` (runs on port 3002)

## API docs

Swagger UI is served at `/docs` (reads the spec from `/openapi.json`).

## Auth

Every `POST /api/send-*` endpoint requires `Authorization: Bearer <MAIL_API_TOKEN>`. `GET /api/health` is open.

## Endpoints

- `POST /api/send-zakat-consent-email` — `{ recipientEmail, studentName, programName, consentLink }`. Called by the consent app.
- `POST /api/send-financial-aid-email` — `{ recipientEmail, studentName, discountPercentage, discountCode, programName, additionalDetails? }`
- `POST /api/send-custom-email` — `{ recipients: [{ email, name? }], subject, htmlContent, senderName?, senderEmail? }`. All recipients share one Gmail send (bundled into a single message's `To:` header) — fine for a handful of known recipients, wrong for a mass blast (every recipient would see every other recipient's address).
- `POST /api/send-blast-email` — `{ recipients: [{ email, name? }] (max 25), subject, htmlContent, senderName?, senderEmail? }`. Each recipient gets their own individual Gmail send; `subject`/`htmlContent` may contain a `{{name}}` token, substituted per-recipient. Used by admin's Email Console for audience blasts — callers with a larger audience split it into multiple ≤25 batches and call this once per batch. Returns `{ success, sent, failed, results: [{ email, success, error? }] }`.
- `POST /api/send-prophetic-guidance-welcome` — `{ recipients: [{ email, name? }], classDate?, year1Year2Time?, graduatesJourneyTime?, senderName?, senderEmail? }`
- `POST /api/send-associates-program-welcome` — `{ recipients: [{ email, name? }], senderName?, senderEmail? }`
- `GET /api/health` — `{ status: "ok" }`
