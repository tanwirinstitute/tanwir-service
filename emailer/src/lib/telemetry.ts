import { metrics } from "@opentelemetry/api";

/**
 * App meter. Instruments created off this only export once
 * `registerNodeOtel` (@tanwir/shared/otel) has installed a real meter
 * provider (i.e. the GRAFANA_OTLP_* trio is set); otherwise they record into
 * the API's no-op provider and cost nothing.
 */
const meter = metrics.getMeter("tanwir-emailer");

/**
 * One counter per Gmail send attempt out of the blast endpoint, tagged with
 * the outcome and — on failure — the Gmail error reason slug and HTTP
 * status. Chart `outcome="failed"` by `reason` to watch the intermittent
 * 403s (`reason="rateLimitExceeded"` / `"userRateLimitExceeded"` are
 * transient; `"dailyLimitExceeded"` is a hard 24h stop).
 */
export const gmailSendCounter = meter.createCounter("email.gmail.send", {
  description: "Individual Gmail send attempts from POST /api/send-blast-email",
});

export const gmailSendDuration = meter.createHistogram("email.gmail.send.duration", {
  description: "Wall-clock duration of a single Gmail send",
  unit: "ms",
});
