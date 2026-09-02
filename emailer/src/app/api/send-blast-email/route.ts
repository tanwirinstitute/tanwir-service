import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sendGmailEmail, isValidEmail, GmailError } from "@/lib/gmail";

interface BlastRecipient {
  email: string;
  name?: string;
}

interface BlastEmailRequest {
  recipients: BlastRecipient[];
  subject: string;
  htmlContent: string;
  senderName?: string;
  senderEmail?: string;
}

interface RecipientResult {
  email: string;
  success: boolean;
  error?: string;
}

// Caps how long a single request can run — the caller (admin's Email
// Console) is expected to chunk a larger audience into batches of this size
// or smaller and call this endpoint once per batch.
const MAX_BATCH_SIZE = 25;

// Each recipient gets their own Gmail send (never bundled into one
// message's To:/Cc header) so recipients can't see each other's address and
// the message can be personalized. Concurrency is kept low and requests are
// processed in small waves rather than all at once, since Gmail's per-user
// send quota is shared across this entire process.
const CONCURRENCY = 3;

function personalize(template: string, recipient: BlastRecipient): string {
  const name = recipient.name?.trim() || "Student";
  return template.replaceAll("{{name}}", name);
}

async function sendToRecipient(
  recipient: BlastRecipient,
  subject: string,
  htmlContent: string,
  senderName?: string,
  senderEmail?: string
): Promise<RecipientResult> {
  try {
    await sendGmailEmail({
      to: [{ email: recipient.email, name: recipient.name || recipient.email }],
      subject: personalize(subject, recipient),
      htmlContent: personalize(htmlContent, recipient),
      senderName,
      senderEmail,
    });
    return { email: recipient.email, success: true };
  } catch (error) {
    const message = error instanceof GmailError ? `Gmail API responded ${error.status}` : (error as Error).message;
    return { email: recipient.email, success: false, error: message };
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const { recipients, subject, htmlContent, senderName, senderEmail } = (await request.json()) as BlastEmailRequest;

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json({ success: false, message: "At least one recipient is required" }, { status: 400 });
  }

  if (recipients.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { success: false, message: `At most ${MAX_BATCH_SIZE} recipients per request; split larger audiences into multiple calls` },
      { status: 400 }
    );
  }

  if (!subject || !htmlContent) {
    return NextResponse.json(
      { success: false, message: "Missing required fields: subject and htmlContent are required" },
      { status: 400 }
    );
  }

  const invalidEmails = recipients.filter((recipient) => !isValidEmail(recipient.email));
  if (invalidEmails.length > 0) {
    return NextResponse.json(
      { success: false, message: "Invalid email format found in recipients", invalidEmails: invalidEmails.map((r) => r.email) },
      { status: 400 }
    );
  }

  const results: RecipientResult[] = [];
  for (let i = 0; i < recipients.length; i += CONCURRENCY) {
    const wave = recipients.slice(i, i + CONCURRENCY);
    const waveResults = await Promise.all(wave.map((r) => sendToRecipient(r, subject, htmlContent, senderName, senderEmail)));
    results.push(...waveResults);
  }

  const sent = results.filter((r) => r.success).length;
  const failed = results.length - sent;

  return NextResponse.json({ success: true, sent, failed, results });
}
