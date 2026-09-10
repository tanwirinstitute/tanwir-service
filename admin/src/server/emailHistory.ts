import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase";

/**
 * Persistent log of Email Console blast sends, so an admin can see what went
 * out and re-send to just the recipients a send failed on (Gmail
 * intermittently 403s individual sends under rate/quota pressure). Written
 * and read only from server routes via the Admin SDK — never touched by
 * client code — so it needs no firestore.rules entry beyond the default deny.
 */
const COLLECTION = "emailSends";

/** Cap stored per-send recipient detail. A blast to "all students" is well
 * under this today; the guard keeps one runaway send from blowing the 1 MiB
 * Firestore document ceiling. Excess recipients are still counted, just not
 * listed individually (so they can't be retried from history). */
const MAX_STORED_RECIPIENTS = 4000;

export type SendStatus = "completed" | "partial" | "failed";

export interface HistoryRecipient {
  email: string;
  name: string | null;
  status: "sent" | "failed";
  error?: string;
}

export interface HistoryActor {
  uid: string;
  email: string | null;
  name: string | null;
}

/** Full stored record, including the heavy fields (every recipient + the
 * message body) used to power a retry. */
export interface EmailSendRecord {
  id: string;
  createdAt: string | null;
  createdBy: HistoryActor;
  subject: string;
  bodyHtml: string;
  audienceLabel: string;
  totalRecipients: number;
  sent: number;
  failed: number;
  status: SendStatus;
  /** id of the send this one retried, or null for an original send. */
  retryOf: string | null;
  recipients: HistoryRecipient[];
  /** true when the stored recipient list was truncated at MAX_STORED_RECIPIENTS. */
  recipientsTruncated: boolean;
}

/** Lightweight row for the history list — drops `bodyHtml` and the full
 * recipient roster, keeping only the failures (what the UI shows and what a
 * retry acts on). */
export interface EmailSendSummary {
  id: string;
  createdAt: string | null;
  createdBy: HistoryActor;
  subject: string;
  audienceLabel: string;
  totalRecipients: number;
  sent: number;
  failed: number;
  status: SendStatus;
  retryOf: string | null;
  failedRecipients: HistoryRecipient[];
  recipientsTruncated: boolean;
}

export interface RecordSendInput {
  createdBy: HistoryActor;
  subject: string;
  bodyHtml: string;
  audienceLabel: string;
  recipients: HistoryRecipient[];
  retryOf?: string | null;
}

function deriveStatus(sent: number, failed: number): SendStatus {
  if (failed === 0) return "completed";
  if (sent === 0) return "failed";
  return "partial";
}

function toIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function normalizeRecipient(raw: unknown): HistoryRecipient | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.email !== "string" || !r.email) return null;
  const status = r.status === "failed" ? "failed" : "sent";
  const recipient: HistoryRecipient = {
    email: r.email,
    name: typeof r.name === "string" && r.name ? r.name : null,
    status,
  };
  if (status === "failed" && typeof r.error === "string" && r.error) recipient.error = r.error;
  return recipient;
}

/** Writes one send to the log and returns its generated id. */
export async function recordEmailSend(input: RecordSendInput): Promise<string> {
  const recipients = input.recipients
    .map(normalizeRecipient)
    .filter((r): r is HistoryRecipient => r !== null);

  const totalRecipients = recipients.length;
  const stored = recipients.slice(0, MAX_STORED_RECIPIENTS);
  const sent = recipients.filter((r) => r.status === "sent").length;
  const failed = totalRecipients - sent;

  const doc = await getDb()
    .collection(COLLECTION)
    .add({
      createdAt: FieldValue.serverTimestamp(),
      createdBy: input.createdBy,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      audienceLabel: input.audienceLabel,
      totalRecipients,
      sent,
      failed,
      status: deriveStatus(sent, failed),
      retryOf: input.retryOf ?? null,
      recipients: stored,
      recipientsTruncated: stored.length < totalRecipients,
    });

  return doc.id;
}

function mapRecord(id: string, data: FirebaseFirestore.DocumentData): EmailSendRecord {
  const recipients = Array.isArray(data.recipients)
    ? data.recipients.map(normalizeRecipient).filter((r): r is HistoryRecipient => r !== null)
    : [];
  const sent = typeof data.sent === "number" ? data.sent : recipients.filter((r) => r.status === "sent").length;
  const failed = typeof data.failed === "number" ? data.failed : recipients.filter((r) => r.status === "failed").length;
  return {
    id,
    createdAt: toIso(data.createdAt),
    createdBy: {
      uid: typeof data.createdBy?.uid === "string" ? data.createdBy.uid : "",
      email: typeof data.createdBy?.email === "string" ? data.createdBy.email : null,
      name: typeof data.createdBy?.name === "string" ? data.createdBy.name : null,
    },
    subject: typeof data.subject === "string" ? data.subject : "",
    bodyHtml: typeof data.bodyHtml === "string" ? data.bodyHtml : "",
    audienceLabel: typeof data.audienceLabel === "string" ? data.audienceLabel : "",
    totalRecipients: typeof data.totalRecipients === "number" ? data.totalRecipients : recipients.length,
    sent,
    failed,
    status: (data.status as SendStatus) ?? deriveStatus(sent, failed),
    retryOf: typeof data.retryOf === "string" ? data.retryOf : null,
    recipients,
    recipientsTruncated: data.recipientsTruncated === true,
  };
}

/** Most recent sends, newest first, as lightweight summaries. */
export async function listEmailSends(limit = 30): Promise<EmailSendSummary[]> {
  const snapshot = await getDb().collection(COLLECTION).orderBy("createdAt", "desc").limit(limit).get();

  return snapshot.docs.map((doc) => {
    const record = mapRecord(doc.id, doc.data());
    return {
      id: record.id,
      createdAt: record.createdAt,
      createdBy: record.createdBy,
      subject: record.subject,
      audienceLabel: record.audienceLabel,
      totalRecipients: record.totalRecipients,
      sent: record.sent,
      failed: record.failed,
      status: record.status,
      retryOf: record.retryOf,
      failedRecipients: record.recipients.filter((r) => r.status === "failed"),
      recipientsTruncated: record.recipientsTruncated,
    };
  });
}

/** Full record (body + every stored recipient), for driving a retry. */
export async function getEmailSend(id: string): Promise<EmailSendRecord | null> {
  const doc = await getDb().collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return mapRecord(doc.id, doc.data() as FirebaseFirestore.DocumentData);
}
