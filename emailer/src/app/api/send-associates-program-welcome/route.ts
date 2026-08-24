import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sendGmailEmail, isValidEmail, GmailError } from "@/lib/gmail";

interface AssociatesProgramWelcomeRequest {
  recipients: { email: string; name?: string }[];
  senderName?: string;
  senderEmail?: string;
}

function buildHtml(): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="https://images.squarespace-cdn.com/content/66a00d45db79b1271d17284d/f596f1b5-33ae-4fde-b6e1-3a6c9beb0deb/tanwir-horizontal.png" alt="Tanwir Institute Logo" style="max-width: 300px; height: auto;">
      </div>
      <h2 style="color: #2c3e50; text-align: center;">Welcome to the Associates Program</h2>
      <p>Assalam Alaykum,</p>
      <p>See you all today at 7pm inshaAllah. Please join your WhatsApp group below:</p>
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Associates Program WhatsApp Groups</strong></p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="https://chat.whatsapp.com/C54XSQLy8SMClxvyQg2od5?mode=ems_copy_c" style="display: inline-block; background-color: #25D366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 5px; font-weight: bold;">Join Year 1 Group</a>
        </div>
        <div style="text-align: center; margin: 20px 0;">
          <a href="https://chat.whatsapp.com/CqDzlJwcJ6H51NEhAitJ22?mode=ems_copy_c" style="display: inline-block; background-color: #25D366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 5px; font-weight: bold;">Join Year 2 Group</a>
        </div>
        <div style="text-align: center; margin: 20px 0;">
          <a href="https://chat.whatsapp.com/EEusFJZRvRS0lClUcxygkD?mode=ems_copy_c" style="display: inline-block; background-color: #25D366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 5px; font-weight: bold;">Join Year 3/Post Grad Group</a>
        </div>
      </div>
      <p>Dua's</p>
      <p>-Omar Popal</p>
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

  const { recipients, senderName, senderEmail } = (await request.json()) as AssociatesProgramWelcomeRequest;

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json({ success: false, message: "At least one recipient is required" }, { status: 400 });
  }

  const invalidEmails = recipients.filter((recipient) => !isValidEmail(recipient.email));
  if (invalidEmails.length > 0) {
    return NextResponse.json(
      { success: false, message: "Invalid email format found in recipients", invalidEmails: invalidEmails.map((r) => r.email) },
      { status: 400 }
    );
  }

  const results = [];
  for (const recipient of recipients) {
    try {
      const sendResult = await sendGmailEmail({
        to: [{ email: recipient.email, name: recipient.name || recipient.email.split("@")[0] }],
        subject: "Welcome to the Associates Program - Tanwir Institute",
        htmlContent: buildHtml(),
        senderName: senderName || "Omar Popal, Tanwir Institute",
        senderEmail,
      });

      results.push({ email: recipient.email, success: true, messageId: sendResult.id });
    } catch (error) {
      console.error(`Error sending email to ${recipient.email}:`, error);
      results.push({
        email: recipient.email,
        success: false,
        error: error instanceof GmailError ? error.body : (error as Error).message,
      });
    }
  }

  const allSuccessful = results.every((result) => result.success);

  return NextResponse.json(
    {
      success: allSuccessful,
      message: allSuccessful
        ? `Associates Program Welcome Letter sent successfully to all ${recipients.length} recipient(s)`
        : "Some emails failed to send",
      recipientCount: recipients.length,
      results,
    },
    { status: allSuccessful ? 200 : 207 }
  );
}
