/**
 * One event registration — a single event line item on a Squarespace
 * order, stored at eventRegistrations/{lineItemId}. Written only by the
 * server-side sync (see @/server/courseSync).
 *
 * Event checkouts so far (Badr, Arafat 2026) are free RSVPs that collect
 * Name / Email / Phone / "How Many Attending?" as line-item
 * customizations, so the registrant fields below come from those answers
 * first and fall back to the order's billing details — the person who
 * typed into the RSVP form is the registrant, not necessarily whoever owns
 * the Squarespace account.
 */
export interface EventRegistrationRecord {
  orderId: string;
  orderNumber: string;
  lineItemId: string;
  productId: string;
  productName: string;
  lineItemType: string;
  quantity: number;
  pricePaid: { currency: string; value: string };
  registeredOn: string;
  name: string | null;
  email: string;
  phone: string | null;
  /** Headcount from the "How Many (Are) Attending?" answer, else the line item quantity. */
  attending: number;
  /** "tag" = carries the events product tag; "legacy" = predates tagging, matched by name. */
  matchedBy: "tag" | "legacy";
  formResponses: Record<string, string>;
  syncedAt: unknown;
}
