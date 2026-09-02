import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { sendBlastBatch, type BlastRecipient } from "@/server/mailApi";
import { wrapBrandedEmail } from "@/server/emailTemplate";

// Must match emailer's own MAX_BATCH_SIZE (send-blast-email/route.ts) — this
// endpoint is called once per batch by the Email Console's client-side loop.
const MAX_BATCH_SIZE = 25;

interface SendBlastRequestBody {
  subject: string;
  bodyHtml: string;
  recipients: BlastRecipient[];
}

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  let body: SendBlastRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.subject || !body.bodyHtml) {
    return NextResponse.json({ success: false, message: "subject and bodyHtml are required" }, { status: 400 });
  }
  if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
    return NextResponse.json({ success: false, message: "At least one recipient is required" }, { status: 400 });
  }
  if (body.recipients.length > MAX_BATCH_SIZE) {
    return NextResponse.json({ success: false, message: `At most ${MAX_BATCH_SIZE} recipients per batch` }, { status: 400 });
  }

  try {
    const result = await sendBlastBatch({
      recipients: body.recipients,
      subject: body.subject,
      htmlContent: wrapBrandedEmail(body.bodyHtml),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Failed to send email batch:", error);
    return NextResponse.json(
      { success: false, message: "Failed to send email batch", error: (error as Error).message },
      { status: 500 }
    );
  }
}
