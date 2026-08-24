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
