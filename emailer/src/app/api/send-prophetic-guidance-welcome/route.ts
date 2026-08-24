import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sendGmailEmail, isValidEmail, GmailError } from "@/lib/gmail";

interface PropheticGuidanceWelcomeRequest {
  recipients: { email: string; name?: string }[];
  classDate?: string;
  year1Year2Time?: string;
  graduatesJourneyTime?: string;
  senderName?: string;
  senderEmail?: string;
}

function buildHtml(recipientName: string | undefined, classDate: string, year1Year2Time: string, graduatesJourneyTime: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="https://images.squarespace-cdn.com/content/66a00d45db79b1271d17284d/f596f1b5-33ae-4fde-b6e1-3a6c9beb0deb/tanwir-horizontal.png" alt="Tanwir Institute Logo" style="max-width: 300px; height: auto;">
      </div>
      <h2 style="color: #2c3e50; text-align: center;">Welcome to Prophetic Guidance</h2>
      <p style="text-align: center; font-style: italic;">Bismillah al-Rahman al-Rahim</p>
      <p>Dear ${recipientName || "Student"},</p>
      <p>Assalamu alaykum wa rahmatullahi wa barakatuh,</p>
      <p>It is with great joy and gratitude that I welcome you to Prophetic Guidance, Tanwir Institute's flagship program dedicated to drawing closer to Allah through the study of Sacred Knowledge.</p>
      <p>This program is designed to equip new students with the portion of knowledge that is fard al-'ayn—personally obligatory upon every Muslim, while also supporting continuing students in their study of Islam. Together, we will not only study classical texts, but also learn how to apply these timeless teachings to our daily lives in a world filled with challenges and distractions.</p>
      <p>At Tanwir Institute, we believe that knowledge is not meant to remain in books, but to illuminate our hearts and transform our character. By embarking on this journey, you are committing to walking in the footsteps of the Prophet ﷺ, striving to embody his mercy, wisdom, and compassion in today's world.</p>
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Important Information:</strong></p>
        <ul style="list-style-type: none; padding-left: 5px;">
          <li>• Class begins ${classDate}.</li>
          <li>• Year 1 & Year 2 students should plan to be at Tanwir Institute by ${year1Year2Time}.</li>
          <li>• Graduates and The Journey students should plan to arrive at ${graduatesJourneyTime}.</li>
          <li>• After registering, you should have received an email to create a login and password for the Tanwir Learning Portal. Please complete that if you haven't already.</li>
        </ul>
      </div>
      <p>I am honored to accompany you on this path of learning and self-betterment. May Allah bless your efforts, increase you in beneficial knowledge, and make this program a means of nearness to Him.</p>
      <p>Sincerely,</p>
      <p><strong>Omar Popal</strong><br>Instructor<br>Tanwir Institute</p>
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

  const {
    recipients,
    classDate = "Sunday, Sept 7th",
    year1Year2Time = "10 AM",
    graduatesJourneyTime = "12 PM",
    senderName,
    senderEmail,
  } = (await request.json()) as PropheticGuidanceWelcomeRequest;

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
        subject: "Welcome to Prophetic Guidance - Tanwir Institute",
        htmlContent: buildHtml(recipient.name, classDate, year1Year2Time, graduatesJourneyTime),
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
        ? `Prophetic Guidance Welcome Letter sent successfully to all ${recipients.length} recipient(s)`
        : "Some emails failed to send",
      recipientCount: recipients.length,
      results,
    },
    { status: allSuccessful ? 200 : 207 }
  );
}
