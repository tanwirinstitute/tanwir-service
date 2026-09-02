# Tanwir API

Internal APIs for Tanwir Institute. Deployed at `api.tanwir.institute`, reached through the root gateway's subdomain proxy.

## Squarespace discount codes

`POST /api/discount-codes` generates a code and creates a matching live, redeemable promo code via Squarespace's Commerce Discounts API (site-wide, percentage-off, one use per customer).

Request body:

```json
{
  "programCode": "YP",
  "discountPercentage": 75,
  "type": "FAID",
  "name": "Financial Aid 75% - Young Professionals",
  "validDays": 14,
  "maxUsesAllowed": 1
}
```

- `programCode` (required) — 2-6 uppercase letters/digits identifying the program (e.g. `YP`). Callers own this mapping; this service doesn't maintain a program list.
- `discountPercentage` (required) — one of `25`, `50`, `75`, `100` (same set emailer's `send-financial-aid-email` validates against).
- `type` (optional, default `FAID`) — 2-6 uppercase letters/digits; the award-type prefix.
- `name` (optional) — display name shown in the Squarespace dashboard. Defaults to `"{type} {discountPercentage}% - {programCode}"`.
- `validDays` (optional, default `14`) — days until the discount expires, matching the "expires in 14 days" copy in the financial aid email.
- `maxUsesAllowed` (optional) — if set, caps total site-wide redemptions (in addition to the one-per-customer limit that's always applied).

Response:

```json
{
  "success": true,
  "code": "FAID-YP-75-26-2B3E",
  "discount": { "id": "...", "name": "...", "status": "ACTIVE", "...": "..." }
}
```

### Code format

`{TYPE}-{PROGRAM}-{PERCENT}-{YEAR}-{SUFFIX}`, e.g. `FAID-YP-75-26-2B3E`:

- `TYPE` — award type (`FAID` = financial aid).
- `PROGRAM` — the `programCode` from the request.
- `PERCENT` — `discountPercentage`.
- `YEAR` — current 2-digit year.
- `SUFFIX` — random 4-char alphanumeric, so repeat codes for the same type/program/percentage/year don't collide (Squarespace rejects duplicate promo codes; the endpoint retries with a fresh suffix on that specific conflict).

## Setup

1. Install dependencies: `npm install`
2. Create a `.env` with:
   - `SQUARESPACE_API_KEY` — Settings > Advanced > API Keys, needs the **Discounts** read/write scope (a separate scope from the Orders-read key `admin/` uses)
   - `SQUARESPACE_API_URL` — defaults to `https://api.squarespace.com`
   - `SQUARESPACE_USER_AGENT` — sent as the required `User-Agent` header on Squarespace API calls
   - `SYNC_API_TOKEN` — shared secret required on every endpoint; must match `SYNC_API_TOKEN` in `admin/.env`
3. `npm run dev` (runs on port 3005)

```bash
curl -X POST http://localhost:3005/api/discount-codes \
  -H "Authorization: Bearer $SYNC_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"programCode": "YP", "discountPercentage": 75}'
```

## Endpoints

- `POST /api/discount-codes` — see above. Requires `Authorization: Bearer <SYNC_API_TOKEN>`.
- `GET /api/health` — `{ status: "ok" }`. Open.
