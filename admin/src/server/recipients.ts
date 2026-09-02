import { getDb } from "@/lib/firebase";
import type { StudentRecord } from "@/types/student";

// Same collection this app's course sync writes to (courseSync.ts).
const STUDENTS_COLLECTION = process.env.STUDENTS_COLLECTION || "students";

export interface Recipient {
  email: string;
  name: string | null;
}

export interface CourseCatalogEntry {
  productId: string;
  productName: string;
}

export interface SectionCatalogEntry {
  academicYear: string;
  semester: string;
}

export type Audience =
  | { type: "all" }
  | { type: "course"; productId: string }
  | { type: "section"; academicYear: string; semester: string };

function studentName(data: Partial<StudentRecord>): string | null {
  const first = data.firstName?.trim();
  const last = data.lastName?.trim();
  return [first, last].filter(Boolean).join(" ") || null;
}

/** Distinct courses across every student, for the audience picker's course dropdown. */
export async function getCourseCatalog(): Promise<CourseCatalogEntry[]> {
  const db = getDb();
  const snapshot = await db.collectionGroup("courses").select("productId", "productName").get();

  const byId = new Map<string, string>();
  for (const doc of snapshot.docs) {
    const data = doc.data() as { productId?: string; productName?: string };
    if (data.productId && !byId.has(data.productId)) {
      byId.set(data.productId, data.productName || data.productId);
    }
  }

  return Array.from(byId, ([productId, productName]) => ({ productId, productName })).sort((a, b) =>
    a.productName.localeCompare(b.productName)
  );
}

/** Distinct academicYear/semester pairs across every student, for the audience picker's section dropdown. */
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
 * students collection directly; "course"/"section" query the courses
 * collection group (a student can have multiple matching courses — dedup by
 * student doc path before fetching names) and bypass firestore.rules
 * entirely via firebase-admin, same as courseSync.ts.
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
  coursesQuery =
    audience.type === "course"
      ? coursesQuery.where("productId", "==", audience.productId)
      : coursesQuery.where("academicYear", "==", audience.academicYear).where("semester", "==", audience.semester);

  const snapshot = await coursesQuery.get();
  const studentRefsByPath = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const doc of snapshot.docs) {
    const studentRef = doc.ref.parent.parent;
    if (studentRef) studentRefsByPath.set(studentRef.path, studentRef);
  }

  return studentRefsToRecipients(Array.from(studentRefsByPath.values()));
}
