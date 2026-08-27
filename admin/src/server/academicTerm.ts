export type Semester = "Fall" | "Spring" | "Summer" | "Full Year";

export interface Term {
  semester: Semester;
  academicYear: string;
}

/**
 * Many products already state their term in the name ("... Fall Session",
 * "(Spring)", "2026 | Summer | ..."); trust that over the purchase date when
 * present. Some products (e.g. "Associates Program", "Prophetic Guidance")
 * don't state a term in the name at all — the customer picks it via a
 * "Plan" variant option instead ("Full Year", "Fall Semester", ...), checked
 * next. Only products with neither fall back to the purchase date.
 * "full year" is checked first since e.g. "Foundations Year 1 | Full Year"
 * would otherwise never match a bare "year" pattern we don't use, but does
 * no harm to check first regardless.
 */
const NAME_PATTERNS: Array<{ pattern: RegExp; semester: Semester }> = [
  { pattern: /full\s*year/i, semester: "Full Year" },
  { pattern: /\bfall\b/i, semester: "Fall" },
  { pattern: /\bspring\b/i, semester: "Spring" },
  { pattern: /\bsummer\b/i, semester: "Summer" },
];

/**
 * Registration cycle, confirmed against real purchase-date/product-name
 * pairs, Aug 2026: Fall = Jul-Sep, Spring = Oct-Feb, Summer = Mar-Jun. The
 * whole Jul(Y)-Jun(Y+1) cycle shares one academic-year label "Y-(Y+1)" —
 * Fall starting the year, unlike a first attempt at this that treated
 * Spring/Summer as starting a new label at each Jan.
 */
function cycleStartYearForMonth(month: number, year: number): number {
  return month >= 7 ? year : year - 1;
}

function semesterFromMonth(month: number): Semester {
  if (month >= 7 && month <= 9) return "Fall";
  if (month >= 10 || month <= 2) return "Spring";
  return "Summer"; // 3-6
}

function deriveTermFromDate(purchasedOn: string): Term {
  const date = new Date(purchasedOn);
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const cycleStartYear = cycleStartYearForMonth(month, year);
  return { semester: semesterFromMonth(month), academicYear: `${cycleStartYear}-${cycleStartYear + 1}` };
}

type NamedSemester = Exclude<Semester, "Full Year">;

/**
 * Each of Fall/Spring/Summer's "home" point within the Jul(Y)-Jun(Y+1)
 * cycle, used to figure out which cycle a *named* semester belongs to (see
 * below) — e.g. Spring's home is mid-December of the cycle's start year,
 * since Spring runs Oct(Y)-Feb(Y+1) and Dec sits in the middle of that.
 * "Full Year" isn't here: unlike Fall/Spring/Summer, which have realistic
 * "early bird" purchases weeks or months ahead of a narrow window, a Full
 * Year enrollment can legitimately be paid off (e.g. via a payment plan)
 * anywhere across the *entire* cycle — confirmed against a real 8-month
 * installment plan running Sep(Y) through Apr(Y+1), all one enrollment.
 * Snapping to a single "home" date would misfile its later installments
 * into the *next* cycle, so it uses the same plain month math as the
 * unnamed-product date fallback instead (see deriveTerm below).
 */
const SEMESTER_HOME: Record<NamedSemester, { month: number; yearOffset: number }> = {
  Fall: { month: 8, yearOffset: 0 }, // mid Jul-Sep(Y)
  Spring: { month: 12, yearOffset: 0 }, // mid Oct(Y)-Feb(Y+1)
  Summer: { month: 4, yearOffset: 1 }, // mid Mar-Jun(Y+1)
};

function homeDate(semester: NamedSemester, cycleStartYear: number): Date {
  const { month, yearOffset } = SEMESTER_HOME[semester];
  return new Date(Date.UTC(cycleStartYear + yearOffset, month - 1, 15));
}

/**
 * When the product name/plan already states the semester, the purchase
 * month alone can't be trusted to pick the academic year — registration
 * opens well before a term starts, so e.g. a "Fall" course bought in the
 * preceding Summer is still *next* Fall, not "whatever cycle Summer
 * belongs to". Instead, pick whichever cycle's home date (see above) is
 * closest to the actual purchase date.
 */
function nearestCycleStartYear(semester: NamedSemester, purchasedOn: string): number {
  const purchaseDate = new Date(purchasedOn);
  const purchaseYear = purchaseDate.getUTCFullYear();

  let best = purchaseYear;
  let bestDiffMs = Infinity;
  for (const candidate of [purchaseYear - 1, purchaseYear, purchaseYear + 1]) {
    const diff = Math.abs(homeDate(semester, candidate).getTime() - purchaseDate.getTime());
    if (diff < bestDiffMs) {
      bestDiffMs = diff;
      best = candidate;
    }
  }
  return best;
}

function matchName(text: string): Semester | null {
  for (const { pattern, semester } of NAME_PATTERNS) {
    if (pattern.test(text)) return semester;
  }
  return null;
}

/** Semester + academic year for a course, computed together (see nearestCycleStartYear). */
export function deriveTerm(productName: string, plan: string | undefined, purchasedOn: string): Term {
  const semester = matchName(productName) ?? (plan ? matchName(plan) : null);

  if (semester === "Full Year") {
    const date = new Date(purchasedOn);
    const cycleStartYear = cycleStartYearForMonth(date.getUTCMonth() + 1, date.getUTCFullYear());
    return { semester, academicYear: `${cycleStartYear}-${cycleStartYear + 1}` };
  }

  if (semester) {
    const cycleStartYear = nearestCycleStartYear(semester, purchasedOn);
    return { semester, academicYear: `${cycleStartYear}-${cycleStartYear + 1}` };
  }

  return deriveTermFromDate(purchasedOn);
}

/**
 * Which academic year registration is currently open for isn't a calendar
 * computation — it's set by whoever runs registration each cycle, and opens
 * well before that year's Fall term actually starts. As of Aug 2026,
 * registration is only active for Fall 2026 (2026-2027) and later —
 * 2025-2026 counts as closed even though its Summer sessions are still
 * finishing. Update this string when the next registration cycle opens.
 */
export const ACTIVE_REGISTRATION_ACADEMIC_YEAR = "2026-2027";

function academicYearStart(academicYear: string): number {
  return parseInt(academicYear.slice(0, 4), 10);
}

/** Compares two "YYYY-YYYY" academic year strings by their start year. */
export function isAcademicYearAtOrAfter(academicYear: string, referenceYear: string): boolean {
  return academicYearStart(academicYear) >= academicYearStart(referenceYear);
}
