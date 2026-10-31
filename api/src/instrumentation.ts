/**
 * Server startup hook (Next.js calls `register` once per server instance).
 * Boots OpenTelemetry for the Node runtime only — this app has no Edge
 * routes, and the OTLP setup uses Node APIs (Buffer, process.env mutation).
 * Exporter wiring lives in @tanwir/shared/otel; app metrics in src/lib/telemetry.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { registerNodeOtel } = await import("@tanwir/shared/otel");
  registerNodeOtel("tanwir-api");
}
