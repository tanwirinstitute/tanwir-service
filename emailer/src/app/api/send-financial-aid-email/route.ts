import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sendBrevoEmail, BrevoError } from "@/lib/brevo";

interface FinancialAidEmailRequest {
  recipientEmail: string;
  studentName: string;
  discountPercentage: number | string;
  discountCode: string;
  programName: string;
  additionalDetails?: string;
}

const VALID_DISCOUNTS = [25, 50, 75, 100];

function buildHtml(studentName: string, programName: string, discountValue: number, discountCode: string, additionalDetails?: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="https://images.squarespace-cdn.com/content/66a00d45db79b1271d17284d/f596f1b5-33ae-4fde-b6e1-3a6c9beb0deb/tanwir-horizontal.png" alt="Tanwir Institute Logo" style="max-width: 300px; height: auto;">
      </div>
      <h2 style="color: #2c3e50; text-align: center;">Financial Aid Approval</h2>
      <p>Asalamu alaikum ${studentName},</p>
      <p>We are pleased to inform you that your application for financial aid for the <strong>${programName}</strong> has been <strong>approved</strong>.</p>
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="font-size: 18px; text-align: center;">
          You have been awarded a <strong style="color: #28a745;">${discountValue}% award</strong>
        </p>
      </div>
      <div style="background-color: #e9f7fe; padding: 20px; border-radius: 5px; margin: 25px 0; text-align: center; border: 1px dashed #0078d4;">
        <p style="margin: 0; font-size: 16px;">Your Discount Code:</p>
        <h3 style="margin: 10px 0; font-size: 24px; letter-spacing: 2px; color: #0078d4; font-weight: bold;">${discountCode}</h3>
        <p style="margin: 0; font-size: 14px;">Use this code during checkout to receive your ${discountValue}% award</p>
      </div>
      <h3>How to Use Your Discount Code:</h3>
      <ol style="margin-left: 20px; line-height: 1.5;">
        <li>Visit our website and select your program</li>
        <li>Proceed to checkout</li>
        <li>Enter the discount code in the "Gift or Discount Code" field</li>
        <li>Complete your registration</li>
      </ol>
      ${additionalDetails ? `<p><strong>Additional Information:</strong> ${additionalDetails}</p>` : ""}
      <p>This discount code will expire in 14 days. Please complete your registration before then to secure your place in the program.</p>
      <p>If you have any questions regarding your financial aid package, please contact our Programs Office at <a href="mailto:programs@tanwirinstitute.org">programs@tanwirinstitute.org</a>.</p>
      <p>Congratulations again on your award!</p>
      <p>Sincerely,</p>
      <p><strong>The Financial Aid Committee</strong><br>Tanwir Institute</p>
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

  const { recipientEmail, studentName, discountPercentage, discountCode, programName, additionalDetails } =
    (await request.json()) as FinancialAidEmailRequest;

  if (!recipientEmail || !studentName || discountPercentage === undefined || !discountCode || !programName) {
    return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
  }

  const discountValue = typeof discountPercentage === "string" ? parseInt(discountPercentage, 10) : discountPercentage;

  if (!VALID_DISCOUNTS.includes(discountValue)) {
    return NextResponse.json(
      { success: false, message: "Invalid discount percentage. Must be 25, 50, 75, or 100." },
      { status: 400 }
    );
  }

  try {
    const brevoResponse = await sendBrevoEmail({
      to: [{ email: recipientEmail, name: studentName }],
      subject: "Congratulations! Your Financial Aid Application Has Been Approved",
      htmlContent: buildHtml(studentName, programName, discountValue, discountCode, additionalDetails),
    });

    return NextResponse.json({
      success: true,
      message: "Financial aid acceptance email sent successfully",
      brevoResponse,
    });
  } catch (error) {
    console.error("Error sending email:", error);
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
