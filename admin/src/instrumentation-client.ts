import { faro, getWebInstrumentations, initializeFaro } from "@grafana/faro-web-sdk";

/**
 * Grafana Faro real-user monitoring for the admin UI (dashboard + Email
 * Console): page-load and web-vitals timing, uncaught JS errors, and session
 * tracking, shipped to the Grafana Cloud Frontend Observability collector.
 *
 * The collector URL is public (the app key is baked into the URL, and CORS
 * on the collector is what gates it), so it lives in a NEXT_PUBLIC_ var. When
 * it's unset — local dev, or before the Faro app is created in Grafana —
 * initialization is skipped and this file is inert.
 */
const collectorUrl = process.env.NEXT_PUBLIC_FARO_COLLECTOR_URL;

if (collectorUrl && typeof window !== "undefined") {
  try {
    initializeFaro({
      url: collectorUrl,
      app: {
        name: process.env.NEXT_PUBLIC_FARO_APP_NAME || "tanwir-admin",
        version: process.env.NEXT_PUBLIC_APP_VERSION || undefined,
        environment: process.env.NEXT_PUBLIC_FARO_ENVIRONMENT || "production",
      },
      instrumentations: getWebInstrumentations(),
    });
  } catch (err) {
    // Never let monitoring setup break the page.
    console.error("Faro init failed:", err);
  }
}

/**
 * Next.js calls this when a client-side navigation starts. Recorded as a
 * Faro event so error reports carry a "what page were they on" breadcrumb.
 */
export function onRouterTransitionStart(
  url: string,
  navigationType: "push" | "replace" | "traverse"
) {
  try {
    faro?.api?.pushEvent("route_change", { url, navigationType });
  } catch {
    // faro not initialized (no collector URL) — nothing to record.
  }
}
