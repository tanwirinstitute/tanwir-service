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
  /** `${productName}__${academicYear}` — stable key for the dropdown's value/React key. */
  key: string;
  productName: string;
  academicYear: string;
  /**
   * Distinct semesters this (name, year) group has records under. Some
   * courses get synced under more than one Squarespace productId within
   * the same year — e.g. a "Full Year" enrollment product and a separate
   * "Fall"-only one for the same course — which previously showed as
   * separate, confusingly-identical dropdown entries. Grouping by name+year
   * instead of productId collapses those into one entry; this field is what
   * still surfaces that a group actually covers more than one semester.
   */
  semesters: string[];
}

export type Audience =
  | { type: "all" }
  | { type: "course"; productName?: string; academicYear?: string; semester?: string };

function studentName(data: Partial<StudentRecord>): string | null {
  const first = data.firstName?.trim();
  const last = data.lastName?.trim();
  return [first, last].filter(Boolean).join(" ") || null;
}

/** Distinct (course name, academic year) pairs across every student, for the audience picker's course dropdown. */
export async function getCourseCatalog(): Promise<CourseCatalogEntry[]> {
  const db = getDb();
  const snapshot = await db.collectionGroup("courses").select("productName", "academicYear", "semester").get();

  const byKey = new Map<string, { productName: string; academicYear: string; semesters: Set<string> }>();
  for (const doc of snapshot.docs) {
    const data = doc.data() as { productName?: string; academicYear?: string; semester?: string };
    const productName = data.productName?.trim();
    if (!productName || !data.academicYear) continue;

    const key = `${productName}__${data.academicYear}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { productName, academicYear: data.academicYear, semesters: new Set() };
      byKey.set(key, entry);
    }
    if (data.semester) entry.semesters.add(data.semester);
  }

  return Array.from(byKey, ([key, { productName, academicYear, semesters }]) => ({
    key,
    productName,
    academicYear,
    semesters: Array.from(semesters).sort(),
  })).sort((a, b) => a.productName.localeCompare(b.productName) || b.academicYear.localeCompare(a.academicYear));
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
 * group, filtered by whichever of productName/academicYear/semester is
 * present (a student can still have multiple matching course records, e.g.
 * a payment-plan course synced as several line items, or a course spanning
 * more than one Squarespace productId — dedup by student doc path before
 * fetching names). Bypasses firestore.rules entirely via firebase-admin,
 * same as courseSync.ts.
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
  if (audience.productName) {
    coursesQuery = coursesQuery.where("productName", "==", audience.productName);
  }
  if (audience.academicYear) {
    coursesQuery = coursesQuery.where("academicYear", "==", audience.academicYear);
  }
  if (audience.semester) {
    coursesQuery = coursesQuery.where("semester", "==", audience.semester);
  }

  const snapshot = await coursesQuery.get();
  const studentRefsByPath = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const doc of snapshot.docs) {
    const studentRef = doc.ref.parent.parent;
    if (studentRef) studentRefsByPath.set(studentRef.path, studentRef);
  }

  return studentRefsToRecipients(Array.from(studentRefsByPath.values()));
}
