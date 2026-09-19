/**
 * Every system that has ever collected contact info and now feeds the
 * warehouse. "student_legacy" is the pre-electronic-courses era, tracked by
 * hand in spreadsheets before students were synced from Squarespace.
 * "donor" is a one-off CSV export from the donation platform (Donorloop).
 */
export type ContactSource = "student" | "student_legacy" | "mailchimp" | "event" | "donor";

export interface ContactSourceEntry {
  source: ContactSource;
  /**
   * This contact's identifier within that source system — the students
   * collection doc id, a Mailchimp subscriber hash, a spreadsheet row key,
   * etc. Lets a re-import recognize "already recorded this contribution"
   * instead of appending a duplicate entry on every sync run.
   */
  sourceId: string;
  syncedAt: unknown;
}

/**
 * One record per real person, deduplicated by email across every source
 * system. Deliberately narrow — only the fields every source can agree on —
 * since the point of the warehouse is a single trustworthy contact card, not
 * a copy of each system's full export.
 */
export interface ContactRecord {
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  sources: ContactSourceEntry[];
  createdAt: unknown;
  updatedAt: unknown;
}
