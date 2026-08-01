import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase";
import type { ScholarshipDocument } from "@/types/scholarship";

const SCHOLARSHIPS_COLLECTION = process.env.SCHOLARSHIPS_COLLECTION || "scholarships";

export type ConsentResult =
  | { status: "not_found" }
  | { status: "already_confirmed"; data: ScholarshipDocument }
  | { status: "confirmed"; data: ScholarshipDocument };

export async function getScholarshipSnapshot(docId: string) {
  const db = getDb();
  return db.collection(SCHOLARSHIPS_COLLECTION).doc(docId).get();
}

/**
 * Idempotent: only ever transitions consented false -> true. Called from the
 * POST route on an explicit button click, never from the GET page render, so
 * link-prefetching email scanners can't record consent nobody gave.
 */
export async function recordConsent(docId: string): Promise<ConsentResult> {
  const db = getDb();
  const docRef = db.collection(SCHOLARSHIPS_COLLECTION).doc(docId);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    return { status: "not_found" };
  }

  const data = snapshot.data() as ScholarshipDocument;

  if (data.consented === true) {
    return { status: "already_confirmed", data };
  }

  await docRef.update({
    consented: true,
    consentedAt: FieldValue.serverTimestamp(),
  });

  return { status: "confirmed", data };
}
