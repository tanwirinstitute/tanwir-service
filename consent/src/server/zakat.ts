import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase";
import { sendZakatConsentEmail } from "@/server/mailApi";
import type { ScholarshipDocument } from "@/types/scholarship";

const SCHOLARSHIPS_COLLECTION = process.env.SCHOLARSHIPS_COLLECTION || "scholarships";

// The "zakat" field is free text from an external form ("Yes"/"No"/"yes"/...),
// so eligibility can't be checked with an exact-match Firestore query.
function isZakatEligible(zakat: unknown): boolean {
  return typeof zakat === "string" && zakat.trim().toLowerCase() === "yes";
}

export interface PendingApplicant {
  id: string;
  firstName: string;
  email: string;
  course: string;
}

/**
 * A "pending" applicant is one who opted into Zakat funding (`zakat === "yes"`)
 * but has not yet been sent the consent email. This is exactly the set the
 * scheduler would email on its next run; the admin UI shows it so an email can
 * be triggered by hand instead.
 */
export async function getPendingZakatApplicants(): Promise<PendingApplicant[]> {
  const db = getDb();
  const snapshot = await db.collection(SCHOLARSHIPS_COLLECTION).get();

  // Firestore can't query case-insensitively or for "field does not exist",
  // so filter to the zakat-eligible, not-yet-emailed docs in memory.
  return snapshot.docs
    .filter((doc) => isZakatEligible(doc.get("zakat")) && !doc.get("consentEmailSentAt"))
    .map((doc) => {
      const data = doc.data() as ScholarshipDocument;
      return {
        id: doc.id,
        firstName: data.firstName,
        email: data.email,
        course: data.course,
      };
    });
}

export type SendConsentResult =
  | { status: "sent" }
  | { status: "not_found" }
  | { status: "not_eligible" }
  | { status: "already_sent" };

/**
 * Sends the consent email for a single applicant and records the send time.
 * Re-reads the doc so it stays safe to call concurrently with the scheduler:
 * a doc that's already been emailed (or isn't Zakat-eligible) is left alone.
 */
export async function sendConsentEmailForApplicant(docId: string): Promise<SendConsentResult> {
  const appBaseUrl = process.env.APP_BASE_URL;
  if (!appBaseUrl) {
    throw new Error("APP_BASE_URL is not set");
  }

  const db = getDb();
  const docRef = db.collection(SCHOLARSHIPS_COLLECTION).doc(docId);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    return { status: "not_found" };
  }

  const data = snapshot.data() as ScholarshipDocument;

  if (!isZakatEligible(data.zakat)) {
    return { status: "not_eligible" };
  }

  if (data.consentEmailSentAt) {
    return { status: "already_sent" };
  }

  await sendZakatConsentEmail({
    recipientEmail: data.email,
    studentName: data.firstName,
    programName: data.course,
    consentLink: `${appBaseUrl}/consent/${docId}`,
  });

  await docRef.update({
    consentEmailSentAt: FieldValue.serverTimestamp(),
  });

  return { status: "sent" };
}
