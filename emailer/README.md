# Tanwir Emailer

A Next.js app that sends transactional email for Tanwir Institute via the Brevo API. Deployed at `email.tanwir.institute`, reached through the root gateway's subdomain proxy.

## Setup

1. Install dependencies: `npm install`
2. Create a `.env` with:
   - `BREVO_API_KEY` — Brevo transactional email API key
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
- `POST /api/send-custom-email` — `{ recipients: [{ email, name? }], subject, htmlContent, senderName?, senderEmail? }`
- `POST /api/send-prophetic-guidance-welcome` — `{ recipients: [{ email, name? }], classDate?, year1Year2Time?, graduatesJourneyTime?, senderName?, senderEmail? }`
- `POST /api/send-associates-program-welcome` — `{ recipients: [{ email, name? }], senderName?, senderEmail? }`
- `GET /api/health` — `{ status: "ok" }`
