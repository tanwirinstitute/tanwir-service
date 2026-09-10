import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { listEmailSends, recordEmailSend, type HistoryRecipient } from "@/server/emailHistory";

// Reads/writes the session-gated send log; never statically cached.
export const dynamic = "force-dynamic";

interface RecordSendBody {
  subject?: string;
  bodyHtml?: string;
  audienceLabel?: string;
  recipients?: HistoryRecipient[];
}

export async function GET() {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  try {
    const sends = await listEmailSends();
    return NextResponse.json({ success: true, sends });
  } catch (error) {
    console.error("Failed to load email history:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load email history", error: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * Called by the Email Console once its client-side batch loop finishes, to
 * record what actually went out. The client is trusted here (already behind
 * the admin session gate) and reports its own per-recipient results.
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  let body: RecordSendBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.subject || !body.bodyHtml || !body.audienceLabel) {
    return NextResponse.json(
      { success: false, message: "subject, bodyHtml and audienceLabel are required" },
      { status: 400 }
    );
  }
  if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
    return NextResponse.json({ success: false, message: "recipients is required" }, { status: 400 });
  }

  try {
    const sendId = await recordEmailSend({
      createdBy: { uid: session.uid, email: session.email, name: session.name },
      subject: body.subject,
      bodyHtml: body.bodyHtml,
      audienceLabel: body.audienceLabel,
      recipients: body.recipients,
    });
    return NextResponse.json({ success: true, sendId });
  } catch (error) {
    console.error("Failed to record email send:", error);
    return NextResponse.json(
      { success: false, message: "Failed to record email send", error: (error as Error).message },
      { status: 500 }
    );
  }
}
