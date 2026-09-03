import { getDb } from "@/lib/firebase";
import type { StudentRecord } from "@/types/student";

// Same collection this app's course sync writes to (courseSync.ts).
const STUDENTS_COLLECTION = process.env.STUDENTS_COLLECTION || "students";

export interface Recipient {
  email: string;
  name: string | null;
}

export interface SectionCatalogEntry {
  academicYear: string;
  semester: string;
}

export interface CourseCatalogEntry {
  productId: string;
  productName: string;
  /**
   * Every distinct academicYear/semester this productId has records under.
   * Squarespace recreates some recurring products as a brand-new productId
   * each year (confirmed in courseSync.ts's notes), so two catalog entries
   * can share an identical productName but be different years entirely —
   * this is what lets the UI show the year(s) right next to the course name
   * instead of leaving two identically-labeled options.
   */
  terms: SectionCatalogEntry[];
}

export type Audience =
  | { type: "all" }
  | { type: "course"; productId?: string; academicYear?: string; semester?: string };

function studentName(data: Partial<StudentRecord>): string | null {
  const first = data.firstName?.trim();
  const last = data.lastName?.trim();
  return [first, last].filter(Boolean).join(" ") || null;
}

/** Distinct courses across every student, each with the term(s) it has records under, for the audience picker. */
export async function getCourseCatalog(): Promise<CourseCatalogEntry[]> {
  const db = getDb();
  const snapshot = await db.collectionGroup("courses").select("productId", "productName", "academicYear", "semester").get();

  const byId = new Map<string, { productName: string; terms: Map<string, SectionCatalogEntry> }>();
  for (const doc of snapshot.docs) {
    const data = doc.data() as { productId?: string; productName?: string; academicYear?: string; semester?: string };
    if (!data.productId) continue;

    let entry = byId.get(data.productId);
    if (!entry) {
      entry = { productName: data.productName || data.productId, terms: new Map() };
      byId.set(data.productId, entry);
    }

    if (data.academicYear && data.semester) {
      const key = `${data.academicYear}__${data.semester}`;
      if (!entry.terms.has(key)) {
        entry.terms.set(key, { academicYear: data.academicYear, semester: data.semester });
      }
    }
  }

  return Array.from(byId, ([productId, { productName, terms }]) => ({
    productId,
    productName,
    terms: Array.from(terms.values()).sort((a, b) => b.academicYear.localeCompare(a.academicYear) || a.semester.localeCompare(b.semester)),
  })).sort((a, b) => a.productName.localeCompare(b.productName));
}

/** Distinct academicYear/semester pairs across every student, for the "any course, just this term" filter. */
export async function getSectionCatalog(): Promise<SectionCatalogEntry[]> {
  const db = getDb();
  const snapshot = await db.collectionGroup("courses").select("academicYear", "semester").get();

  const seen = new Set<string>();
  const sections: SectionCatalogEntry[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data() as { academicYear?: string; semester?: string };
    if (!data.academicYear || !data.semester) continue;
    const key = `${data.academicYear}__${data.semester}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sections.push({ academicYear: data.academicYear, semester: data.semester });
  }

  return sections.sort((a, b) => b.academicYear.localeCompare(a.academicYear) || a.semester.localeCompare(b.semester));
}

async function studentRefsToRecipients(studentRefs: FirebaseFirestore.DocumentReference[]): Promise<Recipient[]> {
  if (studentRefs.length === 0) return [];
  const db = getDb();
  const snapshots = await db.getAll(...studentRefs);
  return snapshots
    .filter((snap) => snap.exists)
    .map((snap) => {
      const data = snap.data() as StudentRecord;
      return { email: data.email || snap.id, name: studentName(data) };
    });
}

/**
 * Resolves an audience to a deduplicated recipient list. "all" reads the
 * students collection directly. "course" queries the courses collection
 * group, filtered by whichever of productId/(academicYear+semester) is
 * present — either alone, or both together for "this course, this specific
 * year" (a student can still have multiple matching course records, e.g.
 * a payment-plan course synced as several line items — dedup by student doc
 * path before fetching names). Bypasses firestore.rules entirely via
 * firebase-admin, same as courseSync.ts.
 */
export async function resolveRecipients(audience: Audience): Promise<Recipient[]> {
  const db = getDb();

  if (audience.type === "all") {
    const snapshot = await db.collection(STUDENTS_COLLECTION).get();
    return snapshot.docs.map((doc) => {
      const data = doc.data() as StudentRecord;
      return { email: data.email || doc.id, name: studentName(data) };
    });
  }

  let coursesQuery: FirebaseFirestore.Query = db.collectionGroup("courses");
  if (audience.productId) {
    coursesQuery = coursesQuery.where("productId", "==", audience.productId);
  }
  if (audience.academicYear && audience.semester) {
    coursesQuery = coursesQuery.where("academicYear", "==", audience.academicYear).where("semester", "==", audience.semester);
  }

  const snapshot = await coursesQuery.get();
  const studentRefsByPath = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const doc of snapshot.docs) {
    const studentRef = doc.ref.parent.parent;
    if (studentRef) studentRefsByPath.set(studentRef.path, studentRef);
  }

  return studentRefsToRecipients(Array.from(studentRefsByPath.values()));
}
