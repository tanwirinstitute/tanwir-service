/**
 * Scholarship document shape isn't formally documented elsewhere, so this is
 * kept loose (unknown extra fields allowed) beyond the fields this service
 * actually reads/writes.
 */
export interface ScholarshipDocument {
  firstName: string;
  email: string;
  zakat: string;
  course: string;
  consented?: boolean;
  consentedAt?: unknown;
  consentEmailSentAt?: unknown;
  [key: string]: unknown;
}
