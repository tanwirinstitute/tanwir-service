import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { sendBlastBatch } from "@/server/mailApi";
import { wrapBrandedEmail } from "@/server/emailTemplate";
import { getEmailSend, recordEmailSend, type HistoryRecipient } from "@/server/emailHistory";

export const dynamic = "force-dynamic";

// Matches emailer's MAX_BATCH_SIZE; the failed subset is usually small, but
// a large partial failure still gets chunked.
const MAX_BATCH_SIZE = 25;

interface RetryBody {
  sendId?: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Re-sends a past blast to only the recipients it failed on, then records the
 * attempt as its own history entry linked back via `retryOf`. Content
 * (subject + body) is taken verbatim from the original send.
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  let body: RetryBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.sendId) {
    return NextResponse.json({ success: false, message: "sendId is required" }, { status: 400 });
  }

  const original = await getEmailSend(body.sendId);
  if (!original) {
    return NextResponse.json({ success: false, message: "That send was not found" }, { status: 404 });
  }

  const failed = original.recipients.filter((r) => r.status === "failed");
  if (failed.length === 0) {
    return NextResponse.json(
      { success: false, message: "This send has no failed recipients to retry" },
      { status: 400 }
    );
  }

  const htmlContent = wrapBrandedEmail(original.bodyHtml);
  const attempted: HistoryRecipient[] = [];

  try {
    for (const batch of chunk(failed, MAX_BATCH_SIZE)) {
      const nameByEmail = new Map(batch.map((r) => [r.email, r.name]));
      const result = await sendBlastBatch({
        recipients: batch.map((r) => ({ email: r.email, name: r.name ?? undefined })),
        subject: original.subject,
        htmlContent,
      });
      for (const r of result.results) {
        attempted.push({
          email: r.email,
          name: nameByEmail.get(r.email) ?? null,
          status: r.success ? "sent" : "failed",
          ...(r.success ? {} : { error: r.error || "send failed" }),
        });
      }
    }
  } catch (error) {
    console.error("Retry send failed:", error);
    return NextResponse.json(
      { success: false, message: "Retry send failed", error: (error as Error).message },
      { status: 502 }
    );
  }

  const sent = attempted.filter((r) => r.status === "sent").length;
  const stillFailed = attempted.length - sent;

  const newSendId = await recordEmailSend({
    createdBy: { uid: session.uid, email: session.email, name: session.name },
    subject: original.subject,
    bodyHtml: original.bodyHtml,
    audienceLabel: `${original.audienceLabel} — retry of failed`,
    recipients: attempted,
    retryOf: original.id,
  });

  return NextResponse.json({ success: true, sendId: newSendId, sent, failed: stillFailed, attempted: attempted.length });
}
