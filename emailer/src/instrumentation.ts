/**
 * Server startup hook (Next.js calls `register` once per server instance).
 * Boots OpenTelemetry for the Node runtime only — this app has no Edge
 * routes, and the OTLP setup uses Node APIs (Buffer, process.env mutation).
 * See src/lib/telemetry.ts for what gets exported and where.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { registerOTel } = await import("@vercel/otel");
  const { buildOtelConfig } = await import("./lib/telemetry");

  registerOTel(buildOtelConfig("tanwir-emailer"));
}
