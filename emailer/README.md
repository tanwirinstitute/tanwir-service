# Tanwir Emailer

A Next.js app that sends transactional email for Tanwir Institute via the Gmail API (OAuth2). Deployed at `email.tanwir.institute`, reached through the root gateway's subdomain proxy.

## Setup

1. Install dependencies: `npm install`
2. Create a `.env` with:
   - `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` — OAuth2 credentials for the sending Gmail account
   - `SENDER_NAME` / `SENDER_EMAIL` — default From header
   - `MAIL_API_TOKEN` — shared secret required on every `send-*` endpoint; every calling app must send this as its bearer token
3. `npm run dev` (runs on port 3002)

## API docs

Swagger UI is served at `/docs` (reads the spec from `/openapi.json`).

## Auth

Every `POST /api/send-*` endpoint requires `Authorization: Bearer <MAIL_API_TOKEN>`. `GET /api/health` is open.

## Telemetry

OpenTelemetry is wired up in `src/instrumentation.ts` (traces via [`@vercel/otel`](https://www.npmjs.com/package/@vercel/otel)) and `src/lib/telemetry.ts` (metrics), both exporting to the **Grafana Cloud OTLP gateway**. Traces cover Next.js route handlers, RSC renders, and outbound `fetch` (i.e. the Gmail API calls). It's a no-op until the `GRAFANA_OTLP_*` trio is set, so local dev and preview builds export nothing.

Add to `.env`:

```
# Grafana Cloud → Connections → "OpenTelemetry (OTLP)" — copy the endpoint,
# the numeric instance ID, and an access-policy token with metrics:write +
# traces:write. Leave any of the three blank to disable telemetry.
GRAFANA_OTLP_ENDPOINT=https://otlp-gateway-<zone>.grafana.net/otlp
GRAFANA_OTLP_INSTANCE_ID=
GRAFANA_OTLP_TOKEN=
OTEL_DEPLOYMENT_ENVIRONMENT=production   # optional; defaults to NODE_ENV
```

The trio is built into an HTTP Basic auth header for you (`instanceID:token`, base64). You can instead set the standard `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_HEADERS` directly and they'll take precedence.

Custom metrics (OTLP → Grafana Cloud Prometheus), on top of the request/duration data Grafana can derive from traces:

- `email.gmail.send` — counter per individual Gmail send from `POST /api/send-blast-email`, tagged `outcome` (`sent` / `failed`) and, on failure, `reason` (the Gmail slug: `rateLimitExceeded`, `userRateLimitExceeded` — transient; `dailyLimitExceeded` — a hard 24h stop). This is the one to chart when the Email Console starts throwing 403s.
- `email.gmail.send.duration` — histogram (ms) of a single send, same tags.

> **Netlify note:** these apps run as serverless functions, which freeze between requests. The batch span processor and 60s metric reader flush on the next thaw, so under very low traffic a tail of spans/metrics can be delayed or dropped. Tune with `OTEL_BSP_SCHEDULE_DELAY`, or point at a co-located OpenTelemetry Collector if it matters.

## Endpoints

- `POST /api/send-financial-aid-email` — `{ recipientEmail, studentName, discountPercentage, discountCode, programName, additionalDetails? }`
- `POST /api/send-custom-email` — `{ recipients: [{ email, name? }], subject, htmlContent, senderName?, senderEmail? }`. All recipients share one Gmail send (bundled into a single message's `To:` header) — fine for a handful of known recipients, wrong for a mass blast (every recipient would see every other recipient's address).
- `POST /api/send-blast-email` — `{ recipients: [{ email, name? }] (max 25), subject, htmlContent, senderName?, senderEmail? }`. Each recipient gets their own individual Gmail send; `subject`/`htmlContent` may contain a `{{name}}` token, substituted per-recipient. Used by admin's Email Console for audience blasts — callers with a larger audience split it into multiple ≤25 batches and call this once per batch. Returns `{ success, sent, failed, results: [{ email, success, error? }] }`.
- `POST /api/send-prophetic-guidance-welcome` — `{ recipients: [{ email, name? }], classDate?, year1Year2Time?, graduatesJourneyTime?, senderName?, senderEmail? }`
- `POST /api/send-associates-program-welcome` — `{ recipients: [{ email, name? }], senderName?, senderEmail? }`
- `GET /api/health` — `{ status: "ok" }`
