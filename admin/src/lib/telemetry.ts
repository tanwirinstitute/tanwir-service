import { metrics } from "@opentelemetry/api";

/**
 * App meter. Instruments created off this only export once
 * `registerNodeOtel` (@tanwir/shared/otel) has installed a real meter
 * provider (i.e. the GRAFANA_OTLP_* trio is set); otherwise they record into
 * the API's no-op provider and cost nothing.
 */
const meter = metrics.getMeter("tanwir-admin");

/** POST /api/auth/session attempts, tagged with the outcome — the "who" of a
 * successful login lives on the request span (`enduser.id`/`enduser.email`),
 * not on this counter, so it stays a cheap low-cardinality metric. */
export const loginCounter = meter.createCounter("admin.login", {
  description: "POST /api/auth/session outcomes",
});

/** Squarespace course-sync runs (cron + manual), tagged with the outcome. */
export const syncRunCounter = meter.createCounter("admin.course_sync.run", {
  description: "POST /api/sync-courses invocations",
});

/** Course docs written per successful sync run — chart the rate to see
 * enrollment activity, or a flatline to spot a broken cron. */
export const syncCoursesWritten = meter.createHistogram("admin.course_sync.courses_written", {
  description: "Course records written in one sync run",
});

/**
 * Email Console blast batches handed to the emailer service, tagged with the
 * outcome. Pairs with the emailer's own per-recipient `email.gmail.send`
 * counter — this is the admin-side view (did the batch call succeed at all).
 */
export const blastBatchCounter = meter.createCounter("admin.email.blast_batch", {
  description: "Batches sent via POST /api/email/send-blast",
});

/** Contact warehouse sync runs (currently: students -> contacts), tagged with the outcome. */
export const contactSyncRunCounter = meter.createCounter("admin.contact_sync.run", {
  description: "POST /api/sync-contacts invocations",
});

/** Contact docs written per successful sync run. */
export const contactSyncContactsWritten = meter.createHistogram("admin.contact_sync.contacts_written", {
  description: "Contact records written in one sync run",
});
