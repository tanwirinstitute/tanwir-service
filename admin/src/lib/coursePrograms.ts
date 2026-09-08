/**
 * Course-name normalization and course → program grouping, shared by the
 * Email Console's course picker (server-side, recipients.ts) and the
 * registrations dashboard's Course filter (client-side DashboardClient).
 * Pure string logic only — no firebase/firebase-admin imports — so it's safe
 * to bundle into client components.
 */

// Same term-in-name patterns academicTerm.ts already trusts to derive a
// semester from a product name — reused here to strip that wording back out
// for grouping/display, so "Foo - Fall Session" and "Foo - Full Year" read
// (and group) as the same course. Must cover both trailing words Squarespace
// product names actually use ("Fall Session" *and* "Fall Semester") — an
// earlier version only matched "Session", which left the closing paren and
// "Semester)" behind unstripped (e.g. "Taqwa for Teens (Fall Semester)" ->
// "Taqwa for Teens Semester)").
const TERM_NAME_PATTERN = /\(?\s*(full\s*year|fall|spring|summer)(\s+(session|semester))?\s*\)?/gi;

export function normalizeCourseName(productName: string): string {
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
 * text at all with it (e.g. "The Journey" is Prophetic Guidance's final
 * year) — that can't be derived the way normalizeCourseName strips term
 * wording, so it's an explicit, manually-curated table. Keyed by normalized
 * course display name; update this when a program adds/renames a year.
 * Courses that *do* start with their program's name ("Associates Program
 * Year 2", "Advanced Studies …") don't need entries — the prefix rule below
 * catches them. Applies across every academic year uniformly (including
 * historic ones), since it's matched purely by name, not year.
 */
const PROGRAM_BY_COURSE: Record<string, string> = {
  "Foundations Year 1": "Prophetic Guidance",
  "Foundations Year 2": "Prophetic Guidance",
  "The Journey": "Prophetic Guidance",
  "Associates Post Grad": "Associates Program",
};

/**
 * Programs whose member courses are named after the program itself — either
 * exactly (an early, pre-leveled "Prophetic Guidance" offering; "Taqwa for
 * Teens") or as a prefix ("Associates Program Year 3", "Advanced Studies:
 * …"). Matched case-insensitively against the normalized course name.
 */
const PROGRAM_PREFIXES = ["Prophetic Guidance", "Associates Program", "Taqwa for Teens", "Advanced Studies"];

/** The program a (normalized) course name belongs to, or null for a standalone course. */
export function programForCourse(displayName: string): string | null {
  const fromTable = PROGRAM_BY_COURSE[displayName];
  if (fromTable) return fromTable;
  const lower = displayName.toLowerCase();
  return PROGRAM_PREFIXES.find((prefix) => lower.startsWith(prefix.toLowerCase())) ?? null;
}

/**
 * The fully rolled-up group a raw Squarespace productName belongs to: its
 * program when it has one, otherwise its own term-stripped name. Every
 * variant of a course ("Foo (Fall Semester)", "Foo - Full Year") and every
 * year/level of a program ("Foundations Year 1", "The Journey") lands on the
 * same group name.
 */
export function courseGroupName(productName: string): string {
  const displayName = normalizeCourseName(productName);
  return programForCourse(displayName) ?? displayName;
}
