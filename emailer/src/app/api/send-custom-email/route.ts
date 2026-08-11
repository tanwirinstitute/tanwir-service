import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sendBrevoEmail, isValidEmail, BrevoError } from "@/lib/brevo";

interface CustomEmailRequest {
  recipients: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
  senderName?: string;
  senderEmail?: string;
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const { recipients, subject, htmlContent, senderName, senderEmail } =
    (await request.json()) as CustomEmailRequest;

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json({ success: false, message: "At least one recipient is required" }, { status: 400 });
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

  try {
    const brevoResponse = await sendBrevoEmail({
      to: recipients.map((r) => ({ email: r.email, name: r.name || r.email })),
      subject,
      htmlContent,
      senderName,
      senderEmail,
    });

    return NextResponse.json({
      success: true,
      message: `Custom email sent successfully to ${recipients.length} recipient(s)`,
      recipientCount: recipients.length,
      brevoResponse,
    });
  } catch (error) {
    console.error("Error sending custom email:", error);
    if (error instanceof BrevoError) {
      return NextResponse.json(
        { success: false, message: "Failed to send email via Brevo API", error: error.body },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { success: false, message: "Failed to send email", error: (error as Error).message },
      { status: 500 }
    );
  }
}
