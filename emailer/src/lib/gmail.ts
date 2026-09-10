import { google } from "googleapis";

interface GmailRecipient {
  email: string;
  name?: string;
}

interface SendGmailEmailParams {
  to: GmailRecipient[];
  subject: string;
  htmlContent: string;
  senderName?: string;
  senderEmail?: string;
}

export class GmailError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`Gmail API responded ${status}`);
    this.name = "GmailError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Turns a GmailError into a short, actionable string. Gmail's send failures —
 * especially 403s — carry the real cause (rate limit vs. daily quota vs.
 * permission) only in the response body's `error.errors[].reason` /
 * `error.message`; without surfacing it a caller just sees "403" and can't
 * tell a transient throttle (worth retrying) from a hard quota stop.
 */
export function describeGmailError(error: GmailError): string {
  const body = error.body as
    | { error?: { message?: string; errors?: Array<{ reason?: string; message?: string }> } }
    | string
    | undefined;

  if (typeof body === "string" && body.trim()) {
    return `Gmail ${error.status}: ${body.trim()}`;
  }

  const inner = typeof body === "object" ? body?.error : undefined;
  const reason = inner?.errors?.find((e) => e.reason)?.reason;
  const message = inner?.message || inner?.errors?.find((e) => e.message)?.message;

  if (reason && message) return `Gmail ${error.status} (${reason}): ${message}`;
  if (message) return `Gmail ${error.status}: ${message}`;
  if (reason) return `Gmail ${error.status} (${reason})`;
  return `Gmail API responded ${error.status}`;
}

/**
 * The bare Gmail `reason` slug (e.g. `rateLimitExceeded`,
 * `userRateLimitExceeded`, `dailyLimitExceeded`) for use as a low-cardinality
 * metric/span attribute. Falls back to the HTTP status when Gmail didn't
 * name a reason. Never returns free text — keep this label bounded.
 */
export function gmailErrorReason(error: GmailError): string {
  const body = error.body as
    | { error?: { errors?: Array<{ reason?: string }> } }
    | string
    | undefined;
  const reason =
    typeof body === "object" ? body?.error?.errors?.find((e) => e.reason)?.reason : undefined;
  return reason || `http_${error.status}`;
}

function formatAddress(recipient: GmailRecipient): string {
  return recipient.name ? `"${recipient.name}" <${recipient.email}>` : recipient.email;
}

function buildRawMessage(params: SendGmailEmailParams, from: string): string {
  const to = params.to.map(formatAddress).join(", ");

  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${params.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    params.htmlContent,
  ].join("\r\n");

  return Buffer.from(message).toString("base64url");
}

export async function sendGmailEmail(params: SendGmailEmailParams): Promise<{ id?: string | null }> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, or GMAIL_REFRESH_TOKEN is not set");
  }

  const senderName = params.senderName || process.env.SENDER_NAME || "Tanwir Institute";
  const senderEmail = params.senderEmail || process.env.SENDER_EMAIL || "noreply@tanwirinstitute.org";
  const from = `"${senderName}" <${senderEmail}>`;

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  const gmail = google.gmail({ version: "v1", auth });
  const raw = buildRawMessage(params, from);

  try {
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    return { id: response.data.id };
  } catch (error) {
    const gaxiosError = error as { code?: number; response?: { status?: number; data?: unknown }; message?: string };
    const status = gaxiosError.response?.status ?? gaxiosError.code ?? 500;
    const body = gaxiosError.response?.data ?? gaxiosError.message;
    throw new GmailError(status, body);
  }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
