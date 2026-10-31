import { metrics } from "@opentelemetry/api";

/**
 * App meter. Instruments created off this only export once
 * `registerNodeOtel` (@tanwir/shared/otel) has installed a real meter
 * provider (i.e. the GRAFANA_OTLP_* trio is set); otherwise they record into
 * the API's no-op provider and cost nothing.
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
