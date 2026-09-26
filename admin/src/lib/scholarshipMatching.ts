/**
 * Matches an approved, Zakat-consented scholarship application to the
 * discount actually redeemed for it, so the Scholarships module can report
 * a dollar amount covered by Zakat. Pure logic only — no firebase imports —
 * so it's safe to unit test and to bundle into the client component.
 *
 * Financial-aid awards are issued as Squarespace promo codes named
 * `FAID-<programCode>-<percentage>-<year>-<suffix>` (api/src/lib/discountCode.ts)
 * and redeemed at checkout. courseSync.ts copies a redeemed order's
 * discountLines onto the course doc it produced, so a course purchase whose
 * discountLines contain a FAID code is direct evidence — with the exact
 * dollar amount Squarespace discounted — that this specific purchase is
 * (or is one candidate for) the one a given award funded. There's still no
 * field linking a scholarships/{id} doc to a specific order, so an applicant
 * with more than one FAID redemption (one Firestore account can cover
 * several family members, or several years of the same program) is narrowed
 * down by, in order: the enrolled student's own name (from the "Enter Names
 * Below" checkout question some programs use — @/lib/enrolleeNames, same
 * source the Registrations dashboard reads for attendance) matching the
 * award's applicant; the specific product a multi-level scholarship course
 * label is known to correspond to (SCHOLARSHIP_COURSE_TO_PRODUCT_NAME below
 * — e.g. "Prophetic Guidance - Post Grad" always redeems against "The
 * Journey"); the code's embedded year matching the award's review year; the
 * redeemed course's program family (reusing coursePrograms.ts) matching the
 * award's program; then the award's requested percentage matching the
 * code's embedded percentage. Whatever's still tied after all five is left
 * "ambiguous" rather than guessed at — confirmed against real cases (Sep
 * 2026) that's siblings in the same program/level/year/percentage sharing
 * one account, with no enrollee name on file to tell them apart.
 *
 * The redeemed discount's own `amount` is NOT the right number for "how
 * much did this award cost in Zakat funds" — when the recipient chose a
 * payment plan, courseSync.ts only ever captures the first installment's
 * order (confirmed against live order data, Sep 2026: the same course
 * recurs across a new order roughly every 30 days, and the sync's
 * dedupe-by-lineItemId permanently skips every one after the first), so
 * `amount` reflects one installment, not the full plan. The full committed
 * amount is the course's real price (coursePricing.ts, hand-entered — nothing
 * in Squarespace's Orders API or this project's Firestore data exposes it)
 * times the redeemed code's own percentage.
 */
import { courseGroupName, normalizeCourseName } from "./coursePrograms";
import { getCourseListPrice } from "./coursePricing";

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export const SCHOLARSHIP_CUTOFF_ISO = "2026-08-20T00:00:00.000Z";
const SCHOLARSHIP_CUTOFF_MS = Date.parse(SCHOLARSHIP_CUTOFF_ISO);

export function isOnOrAfterCutoff(millis: number | null): boolean {
  return millis !== null && millis >= SCHOLARSHIP_CUTOFF_MS;
}

export function normalizeZakat(value: string | null | undefined): "yes" | "no" | "unknown" {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "yes") return "yes";
  if (v === "no") return "no";
  return "unknown";
}

export function normalizeStatus(value: string | null | undefined): "approved" | "denied" | "unknown" {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "approved") return "approved";
  if (v === "denied") return "denied";
  return "unknown";
}

/** The first number in a free-text award field like "75%" — null if there isn't one. */
export function parseAwardPercentage(need: string | null | undefined): number | null {
  const m = /(\d+(?:\.\d+)?)/.exec(need ?? "");
  return m ? Number(m[1]) : null;
}

/**
 * coursePrograms.ts groups by the *purchased* product's own name/prefix, so
 * it has no entry for a scholarship form's program label that shares no
 * text with any product ("Youth Program" applicants buy "Taqwa for Teens").
 * Curated the same way as that file's own PROGRAM_BY_COURSE table — update
 * when a form's program label changes.
 */
const SCHOLARSHIP_COURSE_TO_PROGRAM_GROUP: Record<string, string> = {
  "Youth Program": "Taqwa for Teens",
};

export function scholarshipProgramGroup(course: string | null | undefined): string | null {
  const trimmed = (course ?? "").trim();
  if (!trimmed) return null;
  return SCHOLARSHIP_COURSE_TO_PROGRAM_GROUP[trimmed] ?? courseGroupName(trimmed);
}

/**
 * Finer than scholarshipProgramGroup: some scholarship course labels name
 * one specific level within a multi-year program, not just the program as a
 * whole ("Prophetic Guidance - Year 2" and "- Post Grad" both roll up to the
 * same "Prophetic Guidance" group as each other and as "- Year 1") — this
 * resolves that level to the one purchased product it actually corresponds
 * to, curated the same way as coursePrograms.ts's own PROGRAM_BY_COURSE
 * table (e.g. "The Journey" is confirmed there as PG's Post Grad course).
 * Matched against normalizeCourseName, not the raw productName, so it
 * doesn't care which term/session variant was purchased.
 */
const SCHOLARSHIP_COURSE_TO_PRODUCT_NAME: Record<string, string> = {
  "Prophetic Guidance - Year 1": "Foundations Year 1",
  "Prophetic Guidance - Year 2": "Foundations Year 2",
  "Prophetic Guidance - Post Grad": "The Journey",
};

export function scholarshipExpectedProductName(course: string | null | undefined): string | null {
  const trimmed = (course ?? "").trim();
  return trimmed ? SCHOLARSHIP_COURSE_TO_PRODUCT_NAME[trimmed] ?? null : null;
}

/** Two-digit year matching the FAID code's own `-YY-` segment (api/src/lib/discountCode.ts). */
export function twoDigitYear(millis: number | null): string | null {
  if (millis === null) return null;
  return String(new Date(millis).getUTCFullYear()).slice(-2);
}

export interface FaidCode {
  type: string;
  programCode: string;
  percentage: number;
  year: string;
}

const FAID_CODE_PATTERN = /^([A-Z0-9]{2,6})-([A-Z0-9]{2,6})-(\d{1,3})-(\d{2})-[A-Z0-9]+$/;

/** Parses a promo code as generated by api/src/lib/discountCode.ts; null if it isn't one of ours, or isn't FAID. */
export function parseFaidPromoCode(promoCode: string): FaidCode | null {
  const match = FAID_CODE_PATTERN.exec(promoCode.trim().toUpperCase());
  if (!match) return null;
  const [, type, programCode, percentage, year] = match;
  if (type !== "FAID") return null;
  return { type, programCode, percentage: Number(percentage), year };
}

export interface CourseDiscountLine {
  promoCode: string;
  amountValue: number;
}

export interface CoursePurchase {
  id: string;
  productName: string;
  pricePaidValue: number;
  discountLines: CourseDiscountLine[];
  /** From @/lib/enrolleeNames(formResponses) — [] when the order predates that checkout question. */
  enrolleeNames: string[];
}

export interface FaidRedemption {
  courseId: string;
  productName: string;
  promoCode: string;
  faid: FaidCode;
  amountValue: number;
  enrolleeNames: string[];
}

/** Every FAID-code redemption across a student's course purchases. */
export function extractFaidRedemptions(courses: CoursePurchase[]): FaidRedemption[] {
  const out: FaidRedemption[] = [];
  for (const course of courses) {
    for (const line of course.discountLines) {
      const faid = parseFaidPromoCode(line.promoCode);
      if (!faid) continue;
      out.push({
        courseId: course.id,
        productName: course.productName,
        promoCode: line.promoCode,
        faid,
        amountValue: line.amountValue,
        enrolleeNames: course.enrolleeNames,
      });
    }
  }
  return out;
}

export type ScholarshipMatch =
  | { kind: "no-discount-found" }
  | { kind: "matched"; redemption: FaidRedemption }
  | { kind: "ambiguous"; redemptions: FaidRedemption[] };

/**
 * Picks the FAID redemption a scholarship award most likely funded out of
 * every redemption found for that applicant, narrowing by code year, then
 * program family, then requested percentage (see module docblock) — each
 * step only applied when it doesn't eliminate every remaining candidate.
 * Whatever's left when a step gets down to exactly one is the match.
 */
export function matchScholarshipToDiscount(
  applicantFullName: string | null,
  needPercent: number | null,
  reviewYear: string | null,
  programGroup: string | null,
  expectedProductName: string | null,
  redemptions: FaidRedemption[]
): ScholarshipMatch {
  if (redemptions.length === 0) return { kind: "no-discount-found" };

  let pool = redemptions;

  if (applicantFullName) {
    const normalizedApplicant = normalizeName(applicantFullName);
    const byName = pool.filter((r) => r.enrolleeNames.some((n) => normalizeName(n) === normalizedApplicant));
    if (byName.length > 0) pool = byName;
  }
  if (pool.length === 1) return { kind: "matched", redemption: pool[0] };

  if (expectedProductName !== null) {
    const byProduct = pool.filter((r) => normalizeCourseName(r.productName) === expectedProductName);
    if (byProduct.length > 0) pool = byProduct;
  }
  if (pool.length === 1) return { kind: "matched", redemption: pool[0] };

  if (reviewYear !== null) {
    const byYear = pool.filter((r) => r.faid.year === reviewYear);
    if (byYear.length > 0) pool = byYear;
  }
  if (pool.length === 1) return { kind: "matched", redemption: pool[0] };

  if (programGroup !== null) {
    const byGroup = pool.filter((r) => courseGroupName(r.productName) === programGroup);
    if (byGroup.length > 0) pool = byGroup;
  }
  if (pool.length === 1) return { kind: "matched", redemption: pool[0] };

  if (needPercent !== null) {
    const byPercent = pool.filter((r) => r.faid.percentage === needPercent);
    if (byPercent.length > 0) pool = byPercent;
  }
  if (pool.length === 1) return { kind: "matched", redemption: pool[0] };

  return { kind: "ambiguous", redemptions: pool };
}

/**
 * The full amount a matched award actually costs in Zakat funds: the
 * course's real price times the redeemed code's own percentage — not
 * `redemption.amountValue`, which can be just one payment-plan installment
 * (see module docblock). Null when the course isn't in coursePricing.ts yet.
 */
export function committedAmount(redemption: FaidRedemption): number | null {
  const listPrice = getCourseListPrice(redemption.productName);
  if (listPrice === null) return null;
  return (listPrice * redemption.faid.percentage) / 100;
}

export function formatMoney(value: number): string {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
