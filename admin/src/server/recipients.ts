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
  /** `${displayName}__${academicYear}` — stable key for the dropdown's value/React key. */
  key: string;
  /** Term wording stripped out — see normalizeCourseName. */
  displayName: string;
  academicYear: string;
  /**
   * Raw Squarespace productName values collapsed into this group. Some
   * recurring courses get synced under more than one productId within the
   * same year with the term spelled out right in the name itself (e.g. "The
   * Journey - Fall Session" vs "The Journey - Full Year") — same course,
   * different literal name — needed here so resolveRecipients can match all
   * of them.
   */
  productNames: string[];
}

export type Audience =
  | { type: "all" }
  | { type: "course"; productNames?: string[]; academicYear?: string; semester?: string };

function studentName(data: Partial<StudentRecord>): string | null {
  const first = data.firstName?.trim();
  const last = data.lastName?.trim();
  return [first, last].filter(Boolean).join(" ") || null;
}

// Same term-in-name patterns academicTerm.ts already trusts to derive a
// semester from a product name — reused here to strip that wording back out
// for grouping/display, so "Foo - Fall Session" and "Foo - Full Year" read
// (and group) as the same course. Must cover both trailing words Squarespace
// product names actually use ("Fall Session" *and* "Fall Semester") — an
// earlier version only matched "Session", which left the closing paren and
// "Semester)" behind uncstripped (e.g. "Taqwa for Teens (Fall Semester)" ->
// "Taqwa for Teens Semester)").
const TERM_NAME_PATTERN = /\(?\s*(full\s*year|fall|spring|summer)(\s+(session|semester))?\s*\)?/gi;

function normalizeCourseName(productName: string): string {
  const stripped = productName
    .replace(TERM_NAME_PATTERN, " ")
    .replace(/[|:–—-]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  // Fall back to the original if stripping ate the entire name (e.g. a
  // product literally just named "Fall").
  return stripped || productName.trim();
}

/**
 * Some courses belong to the same multi-year program despite sharing no
 * text at all with it or each other (e.g. "The Journey" is Prophetic
 * Guidance's final year) — that can't be derived the way normalizeCourseName
 * strips term wording, so it's an explicit, manually-curated table. Keyed by
 * normalized course display name; update this when a program adds/renames a
 * year. Applies across every academic year uniformly (including historic
 * ones), since it's matched purely by name, not year.
 */
const PROGRAM_BY_COURSE: Record<string, string> = {
  "Foundations Year 1": "Prophetic Guidance",
  "Foundations Year 2": "Prophetic Guidance",
  "The Journey": "Prophetic Guidance",
  "Associates Program Year 1": "Associates Program",
  "Associates Program Year 2": "Associates Program",
  "Associates Program Year 3": "Associates Program",
  "Associates Post Grad": "Associates Program",
};

const PROGRAM_NAMES = new Set(Object.values(PROGRAM_BY_COURSE));

/**
 * A course literally named after its own program (e.g. an early,
 * pre-leveled "Prophetic Guidance" offering before it split into Foundations
 * Year 1/2 + The Journey) counts as a member of that program too, with no
 * table entry needed.
 */
function programForCourse(displayName: string): string | null {
  return PROGRAM_BY_COURSE[displayName] ?? (PROGRAM_NAMES.has(displayName) ? displayName : null);
}

/**
 * Distinct (course name, academic year) pairs across every student, plus one
 * additional "whole program" aggregate entry per (program, year) — e.g.
 * "Prophetic Guidance" for 2026-2027 unions Foundations Year 1/2 + The
 * Journey's productNames for that year — so the dropdown offers both a
 * specific year/level and the entire program as a target. A program
 * aggregate's key is namespaced (`program:...`) so it can never collide with
 * a same-named individual course (see programForCourse's self-title case).
 */
export async function getCourseCatalog(): Promise<CourseCatalogEntry[]> {
  const db = getDb();
  const snapshot = await db.collectionGroup("courses").select("productName", "academicYear").get();

  const byKey = new Map<string, { displayName: string; academicYear: string; productNames: Set<string> }>();
  for (const doc of snapshot.docs) {
    const data = doc.data() as { productName?: string; academicYear?: string };
    const rawName = data.productName?.trim();
    if (!rawName || !data.academicYear) continue;

    const displayName = normalizeCourseName(rawName);
    const key = `${displayName}__${data.academicYear}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { displayName, academicYear: data.academicYear, productNames: new Set() };
      byKey.set(key, entry);
    }
    entry.productNames.add(rawName);
  }

  const courseEntries: CourseCatalogEntry[] = Array.from(byKey, ([key, { displayName, academicYear, productNames }]) => ({
    key,
    displayName,
    academicYear,
    productNames: Array.from(productNames),
  }));

  const programGroups = new Map<string, { displayName: string; academicYear: string; productNames: Set<string> }>();
  for (const course of courseEntries) {
    const program = programForCourse(course.displayName);
    if (!program) continue;

    const key = `program:${program}__${course.academicYear}`;
    let group = programGroups.get(key);
    if (!group) {
      group = { displayName: program, academicYear: course.academicYear, productNames: new Set() };
      programGroups.set(key, group);
    }
    for (const name of course.productNames) group.productNames.add(name);
  }

  const programEntries: CourseCatalogEntry[] = Array.from(programGroups, ([key, { displayName, academicYear, productNames }]) => ({
    key,
    displayName,
    academicYear,
    productNames: Array.from(productNames),
  }));

  // Newest year first; within a year, program aggregates before individual
  // courses (see EmailConsoleClient's courseOptionLabel for how these are
  // told apart in the UI), each group alphabetical.
  return [...programEntries, ...courseEntries].sort((a, b) => {
    if (a.academicYear !== b.academicYear) return b.academicYear.localeCompare(a.academicYear);
    const aIsProgram = a.key.startsWith("program:");
    const bIsProgram = b.key.startsWith("program:");
    if (aIsProgram !== bIsProgram) return aIsProgram ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });
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
 * students collection directly.
 *
 * "course" scans the *entire* courses collection group with no `.where()`
 * at all and filters in memory. This looks wasteful but isn't optional:
 * confirmed live against this project that a `collectionGroup()` query
 * needs an explicit, manually-provisioned index for *every* field used in
 * any `.where()` — even a single equality filter (FAILED_PRECONDITION,
 * first on productName+academicYear together, then again on academicYear
 * alone). getCourseCatalog/getSectionCatalog above only ever worked because
 * they never call `.where()` either (just `.select()`, a field mask, on an
 * unfiltered scan) — this mirrors that same proven-working shape. The
 * courses collection group is small (~580 docs for this institute), so a
 * full scan is cheap; if that stops being true, provision the composite
 * indexes Firestore asks for instead of reintroducing `.where()` blind.
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

  const snapshot = await db.collectionGroup("courses").get();
  const studentRefsByPath = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const doc of snapshot.docs) {
    const data = doc.data() as { productName?: string; academicYear?: string; semester?: string };
    if (audience.academicYear && data.academicYear !== audience.academicYear) continue;
    if (audience.semester && data.semester !== audience.semester) continue;
    if (audience.productNames && audience.productNames.length > 0 && !audience.productNames.includes(data.productName || "")) continue;

    const studentRef = doc.ref.parent.parent;
    if (studentRef) studentRefsByPath.set(studentRef.path, studentRef);
  }

  return studentRefsToRecipients(Array.from(studentRefsByPath.values()));
}
