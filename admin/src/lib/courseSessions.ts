import { normalizeCourseName, programForCourse } from "./coursePrograms";

/**
 * Programs that sell a single "Full Year" product spanning two
 * materially-different sessions — separate Fall and Spring class meetings
 * and separate materials — alongside a "Fall" (or, eventually, "Spring")
 * only option. Everywhere else "Full Year" is one continuous course with no
 * meaningful Fall/Spring split. Keyed by the program name programForCourse
 * returns (see coursePrograms.ts's PROGRAM_PREFIXES/PROGRAM_BY_COURSE).
 */
const SPLIT_SESSION_PROGRAMS: ReadonlySet<string> = new Set(["Prophetic Guidance", "Taqwa for Teens", "Advanced Studies"]);

export interface CourseSession {
  /** "Fall" | "Spring" | "Summer" | "Full Year" — kept as a plain string
   * since a derived session isn't itself a stored Semester value anywhere. */
  semester: string;
  /** true when this session was synthesized from a single "Full Year"
   * purchase rather than read directly off the course record. */
  derived: boolean;
}

/**
 * The session(s) a course enrollment actually belongs to. Almost always
 * just the course's own stored semester, passed through unchanged — that
 * already covers a future "Spring only" plan for latecomers with no special
 * handling here, since it would just arrive as semester: "Spring".
 *
 * The one exception: a "Full Year" purchase in a split-session program (see
 * above) is expanded into both Fall and Spring, since that one purchase
 * covers two sessions with different materials and different class
 * meetings — anything that lists/counts/exports "who's in Fall" needs to
 * include these students, not just literal Fall-only buyers.
 *
 * This never touches Firestore or the stored course record — it's a
 * read-time/display expansion only.
 */
export function courseSessions(productName: string, semester: string): CourseSession[] {
  if (semester !== "Full Year") return [{ semester, derived: false }];

  const program = programForCourse(normalizeCourseName(productName));
  if (!program || !SPLIT_SESSION_PROGRAMS.has(program)) {
    return [{ semester: "Full Year", derived: false }];
  }

  return [
    { semester: "Fall", derived: true },
    { semester: "Spring", derived: true },
  ];
}
