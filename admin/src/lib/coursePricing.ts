/**
 * Full (list) price per course offering, by exact Squarespace productName.
 * Not derivable from Firestore or the Squarespace Orders API — an order's
 * own subtotal only reflects one payment-plan installment when the
 * purchaser chose to pay over time (confirmed against live order data, Sep
 * 2026: the same lineItemId recurs across a new order roughly every 30
 * days, one installment each), not the course's real price. There's no
 * Products/Inventory API access configured to pull this authoritatively
 * either, so these are hand-entered from the Financial Aid Committee
 * (Sep 2026) — update this table when a program's pricing changes.
 */
export const COURSE_LIST_PRICES: Record<string, number> = {
  "Associates Program": 1000,
  "Associates Program - Year 1": 1000,
  "Associates Program - Year 2": 1000,
  "Associates Program - Year 3": 1000,
  "Associates Post Grad | Fall Session": 175,
  "Associates Post Grad | Full Year": 350,
  "Prophetic Guidance": 400,
  "Foundations Year 1 | Full Year": 400,
  "Foundations Year 1 | Fall Session": 250,
  "Foundations Year 2 | Full Year": 400,
  "Foundations Year 2 | Fall Session": 250,
  "The Journey | Full Year": 400,
  "The Journey | Fall Session": 250,
  "Advanced Studies | Full Year": 500,
  "Advanced Studies | Fall Session": 250,
  "Taqwa for Teens": 500,
  "Taqwa for Teens (Spring Semester)": 250,
};

export function getCourseListPrice(productName: string): number | null {
  return COURSE_LIST_PRICES[productName] ?? null;
}
