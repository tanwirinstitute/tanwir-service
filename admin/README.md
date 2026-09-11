# Tanwir Admin

Internal ops app for Tanwir Institute. Deployed at `admin.tanwir.institute`, reached through the root gateway's subdomain proxy.

## Squarespace course sync

`POST /api/sync-courses` pulls Squarespace orders modified since the last successful run, and for each course line item writes a course record to `students/{email}/courses/{lineItemId}` in Firestore. No account/login is created — Squarespace accounts handle that now, so this is purely enrollment tracking.

- **Course filter**: only `SERVICE` and `PAYWALL_PRODUCT` line items are treated as courses (both have carried real course purchases in production). Everything else (e.g. `PHYSICAL_PRODUCT` merch) is skipped.
- **Event exclusion**: some products are one-off events sold the same way as courses (e.g. "Commemoration of the Battle of Badr", "Annual Arafat Program") — excluded by name in `EXCLUDED_EVENT_PRODUCT_NAMES` (`src/server/courseSync.ts`), since Squarespace recreates at least the Arafat product as a new `productId` every year.
- **Payment plans**: confirmed against live data (Aug 2026) that a payment-plan installment is a brand-new *order* (new `orderId`, new `orderNumber`) that reuses the *same* `lineItemId` as the original purchase — it's not one order getting re-modified. Course docs are keyed by `lineItemId` alone (not `orderId_lineItemId`), so every installment of the same enrollment collapses to one record. Orders are processed oldest-first so that record's `purchasedOn`/`orderNumber` reflect the original enrollment, not whichever installment happened to sync first.
- **Sync window**: the last successful run's cutoff is stored in `syncState/squarespaceOrders`, with a 5-minute overlap buffer on the next run to cover clock skew. First run defaults to a 24-hour lookback. The cursor only advances if the run had zero per-order errors, so a partial failure gets retried rather than silently skipped. Pass `{"since": "<ISO timestamp>"}` in the POST body to backfill from a specific point instead of the persisted cursor (the cursor still advances to now on success).
- **Student identity**: keyed by the order's `customerEmail` (lowercased/trimmed). Name/phone come from `billingAddress`, which is present on every order. Per-course checkout answers (which vary by product and aren't worth modeling rigidly) are stored generically under each course's `formResponses`/`variantOptions` rather than parsed into fixed fields.
- **Semester/academic year**: `src/server/academicTerm.ts` (`deriveTerm`), computed together rather than independently. Semester is parsed from the product name when it states one ("Fall Session", "(Spring)", "2026 | Summer | ...", "Full Year"); some products (e.g. "Associates Program", "Prophetic Guidance") don't state a term in the name at all and instead carry it in the "Plan" variant option ("Full Year", "Fall Semester", ...), checked next; only then does it fall back to purchase month. Registration cycle: **Fall = Jul-Sep, Spring = Oct-Feb, Summer = Mar-Jun**, and the whole Jul(Y)-Jun(Y+1) cycle shares one academic-year label `"Y-(Y+1)"` (Fall starts the year). When the semester comes from the name/Plan rather than the date, the purchase month alone can't be trusted to pick the year — registration opens well before a term starts, so e.g. a "Fall"-named course bought that preceding Summer is still *next* Fall, not whatever cycle Summer's date would suggest. That case snaps to whichever cycle's semester "sits closest" to the purchase date. "Full Year" is the exception: since it can legitimately be paid off (e.g. via a payment plan) across the *entire* cycle — confirmed against a real 8-month installment plan running Sep(Y) through Apr(Y+1) — it uses the plain month math instead of nearest-cycle snapping, so late installments don't get misfiled into the next cycle.

### Setup

1. Install dependencies: `npm install`
2. Create a `.env` with:
   - `FIREBASE_SERVICE_ACCOUNT_BASE64` — the `tanwir-students` Firebase project
   - `SQUARESPACE_API_KEY` — Settings > Advanced > API Keys, needs Orders read scope
   - `SYNC_API_TOKEN` — shared secret required on `POST /api/sync-courses`
   - `ADMIN_TOKEN` — shared secret required on `/dashboard?token=...`
   - `NEXT_PUBLIC_FIREBASE_API_KEY` / `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` / `NEXT_PUBLIC_FIREBASE_PROJECT_ID` — the `tanwir-students` Firebase Web app config (public, get via `firebase apps:sdkconfig WEB <appId> --project tanwir-students`)
3. `npm run dev` (runs on port 3003)

Trigger a sync manually with:

```bash
curl -X POST http://localhost:3003/api/sync-courses \
  -H "Authorization: Bearer $SYNC_API_TOKEN"
```

In production, a GitHub Actions cron (`.github/workflows/sync-courses.yml`, repo root) calls `https://admin.tanwir.institute/api/sync-courses` every 30 minutes. It needs a `SYNC_API_TOKEN` **repository secret** set in GitHub (Settings > Secrets and variables > Actions) matching the deployed app's env var. The workflow can also be run manually from the Actions tab, with an optional `since` timestamp for backfills.

## Admin dashboard

`/dashboard?token=<ADMIN_TOKEN>` — live student/course list with search, and a per-course "mark materials picked up" toggle. No login screen: the URL token is validated server-side (`src/server/adminAuth.ts`, a fail-closed-404 pattern), which mints a Firebase custom token (`src/server/customToken.ts`) carrying an `admin` claim. The dashboard client signs in with that token and opens live Firestore listeners (`onSnapshot`) on `students` and a `courses` collection group, so changes — a new signup from the sync job, another admin marking a pickup — appear immediately without a refresh.

There's no per-admin identity (everyone shares the one dashboard link), so "picked up" only records *that* it happened and *when* (`materialsPickedUpAt`), not *who* marked it.

Firestore access for the dashboard is governed by `../firestore.rules` (repo root — Firestore rules are project-wide, not per-app) and deployed with `firebase deploy --only firestore:rules --project tanwir-students`. It only grants the `admin`-claim custom token read/write on `students` and `students/*/courses`; everything else is denied by default. `firebase-admin` (used by the sync job and everywhere else server-side) bypasses these rules entirely — they only matter for this dashboard's direct client access.

## Email Console

`/email` — compose a rich-text message, pick an audience (all students, or a course/term), preview the exact recipient list, send a test to yourself, then blast. Sends go out through the emailer service (`../emailer`, `POST /api/send-blast-email`) one Gmail message per recipient, chunked into batches of 25 by the client.

Every blast is logged to the `emailSends` Firestore collection (written and read only server-side via `firebase-admin` in `src/server/emailHistory.ts` — no `firestore.rules` entry needed, the project-wide default deny covers it). The **History** tab lists recent sends with per-send delivered/failed counts; when Gmail rejected some recipients (intermittent 403s under rate/quota pressure), each failure shows the reason and a **Retry failed** button re-sends the same content to just those recipients (`POST /api/email/retry`), recording the attempt as its own history entry linked back via `retryOf`. Retrying is safe to repeat — it only ever targets the recipients still marked failed.

## QR Codes

`/qr` — generate branded, **dynamic** QR codes: green-dot styling with the Tanwir logo in the middle, downloadable as SVG (print) or PNG. Each code encodes a permanent short link (`https://admin.tanwir.institute/qr/<slug>`) rather than the destination itself; the public, unauthenticated route `/qr/[slug]` resolves the slug in Firestore on every scan and 302-redirects (with `Cache-Control: no-store`, so retargeting takes effect immediately). Admins can repoint a code's destination any time from the console without reprinting anything. Scans of unknown/deleted slugs fall back to `https://tanwir.institute`.

Links live in the `qrLinks` Firestore collection (doc id = slug), written and read only server-side via `firebase-admin` in `src/server/qrLinks.ts` — no `firestore.rules` entry needed, the project-wide default deny covers it. Slugs are auto-generated (7 chars, unambiguous alphabet) or custom (`[a-z0-9-]`, a few route-shadowing names reserved), immutable once created, and each doc tracks `scanCount`/`lastScannedAt`. Destinations are validated to absolute http(s) URLs at write time so the redirect never forwards anywhere else.

The QR rendering (`src/app/qr/tanwirQr.ts`) is a hand-rolled SVG on top of the `qrcode` encoder: error correction forced to H, round dots at 80% of the module pitch, rounded finder eyes, full 4-module quiet zone, and a centered logo badge knocking out ~9% of the modules — verified decodable with ZXing from 200px rasters up, logo included. Codes are generated client-side; downloads embed the logo as a data URI so the files are self-contained. Set `NEXT_PUBLIC_QR_ORIGIN` to change the host baked into new codes (defaults to wherever the console is browsed).

## Telemetry

**Backend** — OpenTelemetry in `src/instrumentation.ts` (traces via [`@vercel/otel`](https://www.npmjs.com/package/@vercel/otel)) + `src/lib/telemetry.ts` (metrics), exporting to the **Grafana Cloud OTLP gateway**. No-op until the `GRAFANA_OTLP_*` trio is set.

```
# Grafana Cloud → Connections → "OpenTelemetry (OTLP)": endpoint, numeric
# instance ID, and an access-policy token with metrics:write + traces:write.
GRAFANA_OTLP_ENDPOINT=https://otlp-gateway-<zone>.grafana.net/otlp
GRAFANA_OTLP_INSTANCE_ID=
GRAFANA_OTLP_TOKEN=
OTEL_DEPLOYMENT_ENVIRONMENT=production   # optional; defaults to NODE_ENV
```

Custom metrics: `admin.course_sync.run` (counter, tag `outcome`) and `admin.course_sync.courses_written` (histogram) around `POST /api/sync-courses`; `admin.email.blast_batch` (counter, tag `outcome`) around `POST /api/email/send-blast` — the admin-side complement to the emailer's per-recipient `email.gmail.send`.

**Frontend (RUM)** — [Grafana Faro](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/) in `src/instrumentation-client.ts`: page-load + web-vitals timing, uncaught JS errors, session tracking, and a `route_change` event on every client navigation. No-op until the collector URL is set.

```
# Grafana Cloud → Frontend Observability → your app → "Web SDK" config URL.
# Public value (the app key is in the URL); safe as NEXT_PUBLIC_.
NEXT_PUBLIC_FARO_COLLECTOR_URL=
NEXT_PUBLIC_FARO_APP_NAME=tanwir-admin        # optional
NEXT_PUBLIC_FARO_ENVIRONMENT=production        # optional
```

> **Netlify note:** these apps run as serverless functions that freeze between requests, so under very low traffic a tail of backend spans/metrics can be delayed or dropped on flush. Faro (browser-side) is unaffected.
