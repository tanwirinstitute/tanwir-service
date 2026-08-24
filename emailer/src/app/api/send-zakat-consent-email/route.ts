import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sendGmailEmail, isValidEmail, GmailError } from "@/lib/gmail";

interface SendZakatConsentEmailRequest {
  recipientEmail: string;
  studentName: string;
  programName: string;
  consentLink: string;
}

function buildHtml(studentName: string, programName: string, consentLink: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="https://images.squarespace-cdn.com/content/66a00d45db79b1271d17284d/f596f1b5-33ae-4fde-b6e1-3a6c9beb0deb/tanwir-horizontal.png" alt="Tanwir Institute Logo" style="max-width: 300px; height: auto;">
      </div>
      <h2 style="color: #2c3e50; text-align: center;">Zakat Funding Consent</h2>
      <p>Asalamu alaikum ${studentName},</p>
      <p>You indicated that you would like your financial aid for <strong>${programName}</strong> to be funded through Zakat. Before we can proceed, we need your consent.</p>
      <div style="text-align: center; margin: 25px 0;">
        <a href="${consentLink}" style="display: inline-block; background-color: #0078d4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Review and Give Consent</a>
      </div>
      <p>If the button above doesn't work, copy and paste this link into your browser:</p>
      <p style="word-break: break-all;"><a href="${consentLink}">${consentLink}</a></p>
      <p>If you have any questions, please contact our Programs Office at <a href="mailto:programs@tanwirinstitute.org">programs@tanwirinstitute.org</a>.</p>
      <p>Sincerely,</p>
      <p><strong>Tanwir Institute</strong></p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      <p style="font-size: 12px; color: #6c757d; text-align: center;">
        This is an automated email. Please direct any questions to programs@tanwirinstitute.org.
      </p>
    </div>
  `;
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const { recipientEmail, studentName, programName, consentLink } =
    (await request.json()) as SendZakatConsentEmailRequest;

  if (!recipientEmail || !studentName || !programName || !consentLink) {
    return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
  }

  if (!isValidEmail(recipientEmail)) {
    return NextResponse.json({ success: false, message: "Invalid recipientEmail" }, { status: 400 });
  }

  try {
    const sendResult = await sendGmailEmail({
      to: [{ email: recipientEmail, name: studentName }],
      subject: "Action Required: Zakat Consent for " + programName,
      htmlContent: buildHtml(studentName, programName, consentLink),
    });

    return NextResponse.json({
      success: true,
      message: "Zakat consent email sent successfully",
      messageId: sendResult.id,
    });
  } catch (error) {
    console.error("Error sending zakat consent email:", error);
    if (error instanceof GmailError) {
      return NextResponse.json(
        { success: false, message: "Failed to send email via Gmail API", error: error.body },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { success: false, message: "Failed to send email", error: (error as Error).message },
      { status: 500 }
    );
  }
}
