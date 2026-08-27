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
   - `FIREBASE_SERVICE_ACCOUNT_BASE64` — same Firebase project as `consent/`
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

`/dashboard?token=<ADMIN_TOKEN>` — live student/course list with search, and a per-course "mark materials picked up" toggle. No login screen: the URL token is validated server-side (`src/server/adminAuth.ts`, same fail-closed-404 pattern as `consent/admin`), which mints a Firebase custom token (`src/server/customToken.ts`) carrying an `admin` claim. The dashboard client signs in with that token and opens live Firestore listeners (`onSnapshot`) on `students` and a `courses` collection group, so changes — a new signup from the sync job, another admin marking a pickup — appear immediately without a refresh.

There's no per-admin identity (everyone shares the one dashboard link), so "picked up" only records *that* it happened and *when* (`materialsPickedUpAt`), not *who* marked it.

Firestore access for the dashboard is governed by `../firestore.rules` (repo root — Firestore rules are project-wide, not per-app) and deployed with `firebase deploy --only firestore:rules --project tanwir-students`. It only grants the `admin`-claim custom token read/write on `students` and `students/*/courses`; everything else is denied by default. `firebase-admin` (used by the sync job and everywhere else server-side) bypasses these rules entirely — they only matter for this dashboard's direct client access.
