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
  /**
   * Whether the applicant is Zakat-*eligible* — NOT consent to actually fund
   * their award with Zakat money, despite the name (Sep 2026 correction).
   * "Yes" / "No".
   */
  zakat: string | null;
  /**
   * Whether the applicant has actually consented to their award being
   * funded from Zakat-eligible donations — separate from `zakat` above.
   * Only ever written when true (no record has been seen with a negative
   * value — absence means "not yet asked/recorded," not "no"). Three
   * formats seen in production (Sep 2026 audit): `true` (boolean, paired
   * with `consentedAt`), `"Yes, I consent"` (the current standard — going
   * forward, records should be normalized to this string), and a legacy
   * bare `"Yes"`. Always go through normalizeConsented, never compare
   * directly.
   */
  consented?: string | boolean | null;
  consentedAt?: unknown;
  /**
   * Unrelated to consent despite the name collision — free text on the
   * `employment` question (e.g. "Self-employed - real estate (commercial)").
   */
  details?: string | null;
  reason: string | null;
  interest: string | null;
  comments: string | null;
  submittedAt: unknown;
  reviewDate: unknown;
  reviewedBy: string | null;
  consentEmailSentAt: unknown;
}
