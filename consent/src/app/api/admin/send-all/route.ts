import { NextRequest, NextResponse } from "next/server";
import { hasValidSendAllToken } from "@/server/sendAllAuth";
import { getPendingZakatApplicants, sendConsentEmailForApplicant } from "@/server/zakat";

interface SendAllResult {
  id: string;
  status: string;
  error?: string;
}

/**
 * Bulk equivalent of POST /api/admin/send/[docId] — sends the Zakat consent
 * email to every currently-pending applicant (see zakat.ts's
 * getPendingZakatApplicants), meant to be called on a schedule (see
 * .github/workflows/send-zakat-consent-emails.yml) instead of an admin
 * clicking "Send all pending" by hand. Safe to run repeatedly/overlapping:
 * sendConsentEmailForApplicant re-reads and re-checks each doc itself, so a
 * doc already sent (or raced by a concurrent run) is just skipped, not
 * double-emailed.
 */
export async function POST(request: NextRequest) {
  if (!hasValidSendAllToken(request)) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  try {
    const pending = await getPendingZakatApplicants();
    const results: SendAllResult[] = [];

    // Sequential — same reasoning as the admin UI's "Send all pending": don't
    // burst the shared mail API, and each result stays easy to attribute.
    for (const applicant of pending) {
      try {
        const result = await sendConsentEmailForApplicant(applicant.id);
        results.push({ id: applicant.id, status: result.status });
      } catch (error) {
        console.error(`Failed to send zakat consent email for doc ${applicant.id}:`, error);
        results.push({ id: applicant.id, status: "error", error: (error as Error).message });
      }
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "error").length;

    return NextResponse.json({ success: true, total: pending.length, sent, failed, results });
  } catch (error) {
    console.error("Bulk zakat consent send failed:", error);
    return NextResponse.json(
      { success: false, message: "Bulk send failed", error: (error as Error).message },
      { status: 500 }
    );
  }
}
