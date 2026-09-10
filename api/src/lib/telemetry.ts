import { metrics } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { AggregationTemporality, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import type { Configuration } from "@vercel/otel";

/**
 * Shared OpenTelemetry wiring for this app. `@vercel/otel` handles traces
 * (its env-driven "auto" OTLP exporter), and we hand it an explicit metric
 * reader for the Grafana Cloud OTLP gateway — `@vercel/otel` v2 has no
 * "auto" for metrics.
 *
 * Everything targets the Grafana Cloud OTLP gateway, authenticated with HTTP
 * Basic auth built from a numeric instance ID + an access-policy token. We
 * take those as a friendly GRAFANA_OTLP_* trio and synthesize the standard
 * OTEL_EXPORTER_OTLP_* vars from them so nobody has to hand-base64 an auth
 * header. When the trio is absent (local dev, preview builds) this returns a
 * bare config: the Next.js span hooks still register but nothing is
 * exported.
 */

interface GrafanaOtlpTarget {
  /** e.g. https://otlp-gateway-prod-us-east-0.grafana.net/otlp */
  endpoint: string;
  headers: Record<string, string>;
}

function resolveTarget(): GrafanaOtlpTarget | null {
  const endpoint = process.env.GRAFANA_OTLP_ENDPOINT?.replace(/\/+$/, "");
  const instanceId = process.env.GRAFANA_OTLP_INSTANCE_ID;
  const token = process.env.GRAFANA_OTLP_TOKEN;
  if (!endpoint || !instanceId || !token) return null;

  const auth = Buffer.from(`${instanceId}:${token}`).toString("base64");
  return { endpoint, headers: { Authorization: `Basic ${auth}` } };
}

export function buildOtelConfig(serviceName: string): Configuration {
  const attributes = {
    "service.namespace": "tanwir",
    "deployment.environment.name":
      process.env.OTEL_DEPLOYMENT_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
  };

  const target = resolveTarget();
  if (!target) return { serviceName, attributes };

  // `@vercel/otel`'s "auto" trace exporter reads these. `||=` so an explicit
  // OTEL_* var set on the deploy still wins.
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||= target.endpoint;
  process.env.OTEL_EXPORTER_OTLP_PROTOCOL ||= "http/protobuf";
  process.env.OTEL_EXPORTER_OTLP_HEADERS ||= `Authorization=${target.headers.Authorization}`;

  const metricExporter = new OTLPMetricExporter({
    url: `${target.endpoint}/v1/metrics`,
    headers: target.headers,
    // Grafana Cloud (Mimir) expects delta temporality for OTLP metrics.
    temporalityPreference: AggregationTemporality.DELTA,
  });

  return {
    serviceName,
    attributes,
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 60_000,
      }),
    ],
  };
}

/**
 * App meter. Instruments created off this only export once
 * `buildOtelConfig` has installed a real meter provider (i.e. the
 * GRAFANA_OTLP_* trio is set); otherwise they record into the API's no-op
 * provider and cost nothing.
 */
const meter = metrics.getMeter("tanwir-api");

/**
 * Squarespace discount-code creations via POST /api/discount-codes, tagged
 * with the outcome (`created`, `rejected` = Squarespace 4xx, `error` =
 * anything else).
 */
export const discountCreateCounter = meter.createCounter("api.discount_code.create", {
  description: "Discount code creation attempts",
});
