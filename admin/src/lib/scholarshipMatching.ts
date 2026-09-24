/**
 * Matches an approved, Zakat-consented scholarship application to the
 * course purchase it funded, so the Scholarships module can report a dollar
 * amount covered by Zakat. Pure logic only — no firebase imports — so it's
 * safe to unit test and to bundle into the client component.
 *
 * There is no explicit link between a scholarships/{id} doc and the order it
 * funded (the discount-code workflow in api/ + emailer/ never writes that
 * link back to Firestore — see admin's scholarships module notes). This
 * reconstructs the link from what *is* available: the applicant's email,
 * the program they applied to, and purchase timing — and says so plainly
 * (`"ambiguous"` / `"none"`) rather than guessing when more than one course
 * purchase could match.
 */
import { courseGroupName } from "./coursePrograms";

/** Scholarships approved before this are legacy and out of scope for this module. */
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

/**
 * coursePrograms.ts groups by the *purchased* product's own name/prefix, so
 * it has no entry for a scholarship form's program label that shares no
 * text with any product ("Youth Program" applicants buy "Taqwa for Teens").
 * Curated the same way as PROGRAM_BY_COURSE there — update when a form's
 * program label changes.
 */
const SCHOLARSHIP_COURSE_TO_PROGRAM_GROUP: Record<string, string> = {
  "Youth Program": "Taqwa for Teens",
};

export function scholarshipProgramGroup(course: string | null | undefined): string | null {
  const trimmed = (course ?? "").trim();
  if (!trimmed) return null;
  return SCHOLARSHIP_COURSE_TO_PROGRAM_GROUP[trimmed] ?? courseGroupName(trimmed);
}

export interface CoursePurchaseCandidate {
  id: string;
  productName: string;
  pricePaidValue: number;
  purchasedOnMillis: number | null;
}

export type ScholarshipMatch =
  | { kind: "no-purchase-found" }
  | { kind: "matched"; course: CoursePurchaseCandidate }
  | { kind: "ambiguous"; courses: CoursePurchaseCandidate[] };

/**
 * Narrows a student's course purchases down to the one a given scholarship
 * award most likely funded: same program group, and (when the award has a
 * review date) purchased on or after it — an award can't fund a purchase
 * that predates it. One survivor is a match; zero means the recipient
 * hasn't registered yet; more than one is genuinely ambiguous (e.g. one
 * account covering siblings in the same program) and is left for manual
 * review rather than guessed at.
 */
export function matchScholarshipPurchase(
  programGroup: string | null,
  reviewMillis: number | null,
  studentCourses: CoursePurchaseCandidate[]
): ScholarshipMatch {
  if (!programGroup) return { kind: "no-purchase-found" };

  const sameProgram = studentCourses.filter((c) => courseGroupName(c.productName) === programGroup);
  if (sameProgram.length === 0) return { kind: "no-purchase-found" };
  if (sameProgram.length === 1) return { kind: "matched", course: sameProgram[0] };

  const afterReview = reviewMillis === null ? sameProgram : sameProgram.filter((c) => c.purchasedOnMillis === null || c.purchasedOnMillis >= reviewMillis);

  if (afterReview.length === 1) return { kind: "matched", course: afterReview[0] };
  if (afterReview.length === 0) return { kind: "ambiguous", courses: sameProgram };
  return { kind: "ambiguous", courses: afterReview };
}

/**
 * List-price baseline per exact product name: the highest price anyone paid
 * for it system-wide. Assumes at least one full-price payer exists per
 * product — true for every program that isn't 100% scholarship-funded.
 * Keyed by exact productName (not the rolled-up group), since different
 * years/terms of the same program can be priced differently.
 */
export function computeListPrices(allCourses: { productName: string; pricePaidValue: number }[]): Map<string, number> {
  const prices = new Map<string, number>();
  for (const c of allCourses) {
    const current = prices.get(c.productName);
    if (current === undefined || c.pricePaidValue > current) {
      prices.set(c.productName, c.pricePaidValue);
    }
  }
  return prices;
}

export function formatMoney(value: number): string {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
