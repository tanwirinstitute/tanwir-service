import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { sendBlastBatch } from "@/server/mailApi";
import { wrapBrandedEmail } from "@/server/emailTemplate";

interface SendTestRequestBody {
  subject: string;
  bodyHtml: string;
}

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }
  if (!session.email) {
    return NextResponse.json({ success: false, message: "Signed-in account has no email on record" }, { status: 400 });
  }

  let body: SendTestRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.subject || !body.bodyHtml) {
    return NextResponse.json({ success: false, message: "subject and bodyHtml are required" }, { status: 400 });
  }

  try {
    const result = await sendBlastBatch({
      recipients: [{ email: session.email, name: session.name ?? undefined }],
      subject: `[TEST] ${body.subject}`,
      htmlContent: wrapBrandedEmail(body.bodyHtml),
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Failed to send test email:", error);
    return NextResponse.json(
      { success: false, message: "Failed to send test email", error: (error as Error).message },
      { status: 500 }
    );
  }
}
