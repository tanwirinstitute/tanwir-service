import { FieldValue } from "firebase-admin/firestore";
import cron from "node-cron";
import { getDb } from "@/lib/firebase";
import { sendZakatConsentEmail } from "@/server/mailApi";
import type { ScholarshipDocument } from "@/types/scholarship";

const SCHOLARSHIPS_COLLECTION = process.env.SCHOLARSHIPS_COLLECTION || "scholarships";

export async function runZakatConsentEmailJob(): Promise<void> {
  const appBaseUrl = process.env.APP_BASE_URL;
  if (!appBaseUrl) {
    console.error("APP_BASE_URL is not set; skipping zakat consent email job");
    return;
  }

  const db = getDb();
  const snapshot = await db
    .collection(SCHOLARSHIPS_COLLECTION)
    .where("zakat", "==", "yes")
    .get();

  // Firestore can't query "field does not exist", so filter the
  // not-yet-emailed docs out of the zakat-eligible set in memory.
  const pending = snapshot.docs.filter((doc) => !doc.get("consentEmailSentAt"));

  for (const doc of pending) {
    const data = doc.data() as ScholarshipDocument;

    try {
      await sendZakatConsentEmail({
        recipientEmail: data.email,
        studentName: data.firstName,
        programName: data.course,
        consentLink: `${appBaseUrl}/consent/${doc.id}`,
      });

      await doc.ref.update({
        consentEmailSentAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error(`Failed to send zakat consent email for doc ${doc.id}:`, error);
    }
  }
}

let started = false;

export function startZakatConsentScheduler(): void {
  if (started) return;
  started = true;

  const schedule = process.env.CRON_SCHEDULE || "0 2 * * *";
  cron.schedule(schedule, () => {
    runZakatConsentEmailJob().catch((error) => {
      console.error("Zakat consent email job failed:", error);
    });
  });

  console.log(`Zakat consent email scheduler started (${schedule})`);
}
