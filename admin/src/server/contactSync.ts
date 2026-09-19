import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase";
import type { StudentRecord } from "@/types/student";
import type { ContactRecord, ContactSource } from "@/types/contact";

const STUDENTS_COLLECTION = process.env.STUDENTS_COLLECTION || "students";
const CONTACTS_COLLECTION = process.env.CONTACTS_COLLECTION || "contacts";

export interface ContactSyncSummary {
  studentsScanned: number;
  contactsWritten: number;
  studentsSkippedNoEmail: number;
  errors: number;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Incoming wins when it has something to say; a blank field never clobbers a value another source (or an earlier run) already filled in. */
function pick(incoming: string | null, existing: string | null): string | null {
  return incoming && incoming.trim() ? incoming : existing;
}

interface ContactInput {
  source: ContactSource;
  sourceId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

async function upsertContact(db: Firestore, input: ContactInput): Promise<void> {
  const contactId = normalizeEmail(input.email);
  const contactRef = db.collection(CONTACTS_COLLECTION).doc(contactId);
  const existingSnapshot = await contactRef.get();
  const existing = existingSnapshot.exists ? (existingSnapshot.data() as ContactRecord) : null;

  const sources = (existing?.sources ?? []).filter(
    (entry) => !(entry.source === input.source && entry.sourceId === input.sourceId)
  );
  // A Date, not FieldValue.serverTimestamp() — Firestore doesn't allow the
  // server-timestamp sentinel inside array elements.
  sources.push({ source: input.source, sourceId: input.sourceId, syncedAt: new Date() });

  await contactRef.set(
    {
      email: input.email,
      firstName: pick(input.firstName, existing?.firstName ?? null),
      lastName: pick(input.lastName, existing?.lastName ?? null),
      phone: pick(input.phone, existing?.phone ?? null),
      sources,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true }
  );
}

/**
 * Pulls every student into the contact warehouse, tagged source="student".
 * Students are keyed by email in their own collection already, so this is a
 * straight full-collection scan — no incremental "since" needed at this
 * size. Once the mailchimp/event/student_legacy dumps arrive, their
 * importers upsert into the same `contacts` collection through the same
 * upsertContact shape, keyed by the same normalized email.
 */
export async function runContactSync(): Promise<ContactSyncSummary> {
  const db = getDb();
  const summary: ContactSyncSummary = {
    studentsScanned: 0,
    contactsWritten: 0,
    studentsSkippedNoEmail: 0,
    errors: 0,
  };

  const snapshot = await db.collection(STUDENTS_COLLECTION).get();

  for (const doc of snapshot.docs) {
    summary.studentsScanned++;
    const data = doc.data() as StudentRecord;
    if (!data.email) {
      summary.studentsSkippedNoEmail++;
      continue;
    }

    try {
      await upsertContact(db, {
        source: "student",
        sourceId: doc.id,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
      });
      summary.contactsWritten++;
    } catch (error) {
      console.error(`Failed to sync contact for student ${doc.id}:`, error);
      summary.errors++;
    }
  }

  return summary;
}
