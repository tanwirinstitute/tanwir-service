/**
 * Financial-aid applications, submitted through per-program Squarespace
 * forms (Associates/PG/Youth/Book Club) and reviewed by the Financial Aid
 * Committee. Written entirely outside this codebase (no sync job here
 * touches this collection) — the fields below are reverse-engineered from
 * production data, not a schema this app defines. `status` and `zakat` are
 * free-text from the review workflow, not enums, and `zakat` has been seen
 * with inconsistent casing ("Yes" and "yes") — always compare case-insensitively.
 */
export interface ScholarshipRecord {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  age: string | null;
  gender: string | null;
  employment: string | null;
  /** Program applied to, e.g. "Associates Program - Year 2". Free text. */
  course: string | null;
  /** Which per-program application form this came from, e.g. "PG Form". */
  form: string | null;
  /** Review outcome. Seen values: "approved", "denied"; sometimes absent. */
  status: string | null;
  /** Requested/awarded aid, e.g. "75%". Free text, not guaranteed numeric. */
  need: string | null;
  /** Consent to fund this award from Zakat-eligible donations. "Yes" / "No". */
  zakat: string | null;
  reason: string | null;
  interest: string | null;
  comments: string | null;
  submittedAt: unknown;
  reviewDate: unknown;
  reviewedBy: string | null;
  consentEmailSentAt: unknown;
}
