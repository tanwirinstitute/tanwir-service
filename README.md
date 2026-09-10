# Tanwir Service

Monorepo for tanwir.institute. Each subdomain is its own independently deployed Next.js app; this root app is the gateway that routes between them.

| App | Subdomain | Local port |
| --- | --- | --- |
| `/` (this app) | tanwir.institute | 3000 |
| `emailer/` | email.tanwir.institute | 3002 |
| `admin/` | admin.tanwir.institute | 3003 |
| `tlp/` | tlp.tanwir.institute | 3004 |
| `api/` | api.tanwir.institute | 3005 |

## How routing works

The gateway has no pages of its own for the subdomains — `src/proxy.ts` reads the `Host` header and rewrites the request to the matching app's origin (`EMAIL_ORIGIN`, `ADMIN_ORIGIN`, `TLP_ORIGIN`, `API_ORIGIN`, configured in `.env`; see `.env.example`). Requests to the apex domain, or an unrecognized subdomain, fall through to this app's own pages.

## Local development

Each app has its own `package.json` and runs on its own port. Copy `.env.example` to `.env` in the root, then start each app you need in a separate terminal:

```bash
npm install && npm run dev          # gateway, :3000
(cd emailer && npm install && npm run dev)  # :3002
(cd admin && npm install && npm run dev)    # :3003
(cd tlp && npm install && npm run dev)      # :3004
(cd api && npm install && npm run dev)      # :3005
```

To test subdomain routing locally, add entries to `/etc/hosts` (e.g. `127.0.0.1 email.localhost`) and hit the gateway with that host, or set the relevant `*_ORIGIN` env var and send a request with a matching `Host` header.

## Telemetry

`emailer/`, `admin/`, and `api/` ship OpenTelemetry (traces + metrics) to the **Grafana Cloud OTLP gateway** via `@vercel/otel`, and `admin/` also runs **Grafana Faro** browser RUM. Each app's `## Telemetry` README section has the setup; all of it is a no-op until the `GRAFANA_OTLP_*` env trio (and, for Faro, `NEXT_PUBLIC_FARO_COLLECTOR_URL`) is populated on the deploy. The gateway (`/`) and `tlp/` are not instrumented.
