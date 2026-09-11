import { normalizeCourseName, programForCourse } from "./coursePrograms";
import type { CourseRecord } from "@/types/student";

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

/** Fall < Spring < Summer < Full Year < anything else (alphabetical) — a
 * stable display/tab order shared by the dashboard's course-detail table
 * and the attendance export. */
const SEMESTER_ORDER = ["Fall", "Spring", "Summer", "Full Year"];
export function semesterRank(semester: string): number {
  const i = SEMESTER_ORDER.indexOf(semester);
  return i === -1 ? SEMESTER_ORDER.length : i;
}

export interface SessionPickupState {
  pickedUp: boolean;
  pickedUpAt: unknown;
}

type PickupFields = Pick<CourseRecord, "materialsPickup" | "materialsPickedUp" | "materialsPickedUpAt">;

/**
 * A course's pickup state for one specific session, honoring the legacy
 * flat materialsPickedUp/At fields for a course that predates the
 * per-session materialsPickup map (see types/student.ts). The legacy flag
 * only ever carries over to a course's *first* session (`isFirstSession`) —
 * for an ordinary single-session course that's the only session there is,
 * so nothing changes; for a Full Year split course it means only Fall
 * inherits an old "picked up" mark, and Spring starts unmarked rather than
 * silently showing as already done for a session nobody's handed out yet.
 */
export function getSessionPickup(course: PickupFields, semester: string, isFirstSession: boolean): SessionPickupState {
  const fromMap = course.materialsPickup?.[semester];
  if (fromMap) return fromMap;
  if (isFirstSession && course.materialsPickedUp) {
    return { pickedUp: true, pickedUpAt: course.materialsPickedUpAt ?? null };
  }
  return { pickedUp: false, pickedUpAt: null };
}

export interface CourseSessionEntry<TCourse> {
  course: TCourse;
  semester: string;
  derived: boolean;
  pickedUp: boolean;
  pickedUpAt: unknown;
}

/**
 * The full session-entry expansion of one course record — courseSessions
 * plus each session's resolved pickup state. This is the unit everything
 * that isn't "one raw course doc" (the dashboard's course-detail rows and
 * status filter/stats, the attendance export) should actually work with,
 * since a Full Year split course is really two independent things: two
 * sessions, two pickup states, two attendance rosters, one purchase.
 */
export function courseSessionEntries<TCourse extends { productName: string; semester: string } & PickupFields>(
  course: TCourse
): CourseSessionEntry<TCourse>[] {
  return courseSessions(course.productName, course.semester).map((session, index) => ({
    course,
    semester: session.semester,
    derived: session.derived,
    ...getSessionPickup(course, session.semester, index === 0),
  }));
}
