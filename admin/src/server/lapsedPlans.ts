import { getDb } from "@/lib/firebase";
import { getCourseListPrice } from "@/lib/coursePricing";
import { fetchOrders } from "@/lib/squarespace";
import { ACTIVE_REGISTRATION_ACADEMIC_YEAR, deriveTerm } from "./academicTerm";
import type { SquarespaceLineItem, SquarespaceOrder } from "@/types/squarespace";

const STUDENTS_COLLECTION = process.env.STUDENTS_COLLECTION || "students";
const COURSE_LINE_ITEM_TYPES = new Set(["SERVICE", "PAYWALL_PRODUCT"]);

/**
 * Squarespace bills payment-plan installments roughly every 30 days
 * (confirmed against live order data, Nov 2026). No installment for 35 days
 * means the plan stopped: the member cancelled, or the card kept failing.
 * The Orders API has no subscription/cancellation field to read instead.
 */
const LAPSED_AFTER_DAYS = 35;

/** Rounding slack when comparing what was paid to the discounted list price. */
const PAID_IN_FULL_TOLERANCE = 1;

export interface LapsedPlan {
  lineItemId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  productName: string;
  semester: string;
  installmentsPaid: number;
  installmentAmount: number;
  amountPaid: number;
  expectedTotal: number;
  lastPaymentOn: string;
  daysSinceLastPayment: number;
}

export interface LapsedPlansReport {
  academicYear: string;
  plans: LapsedPlan[];
  /** Products with installments this year but no entry in coursePricing.ts, so completion can't be judged. */
  productsMissingListPrice: string[];
}

interface Enrollment {
  lineItem: SquarespaceLineItem;
  orders: SquarespaceOrder[];
}

/** What one order actually charged for this line item, after the order-level discount. */
function lineItemNet(order: SquarespaceOrder, lineItem: SquarespaceLineItem): number {
  const gross = Number(lineItem.unitPricePaid.value) * lineItem.quantity;
  const subtotal = Number(order.subtotal?.value ?? gross);
  const discount = Number(order.discountTotal?.value ?? 0);
  return subtotal > 0 ? gross * (1 - discount / subtotal) : 0;
}

/**
 * A payment-plan installment is a new order carrying the *same* lineItemId
 * as the original purchase (see courseSync.ts), so grouping by lineItemId
 * reassembles each enrollment's full payment history. Fully refunded orders
 * are dropped: a refunded enrollment was withdrawn, not left unpaid.
 */
function groupEnrollments(orders: SquarespaceOrder[]): Enrollment[] {
  const byLineItem = new Map<string, Enrollment>();
  for (const order of orders) {
    if (order.paymentState === "REFUNDED" || !order.customerEmail) continue;
    for (const lineItem of order.lineItems ?? []) {
      if (!COURSE_LINE_ITEM_TYPES.has(lineItem.lineItemType)) continue;
      const enrollment = byLineItem.get(lineItem.id) ?? { lineItem, orders: [] };
      enrollment.orders.push(order);
      byLineItem.set(lineItem.id, enrollment);
    }
  }
  for (const enrollment of byLineItem.values()) {
    enrollment.orders.sort((a, b) => a.createdOn.localeCompare(b.createdOn));
  }
  return [...byLineItem.values()];
}

/** Earliest fetch date: registration for a Fall term opens months ahead, so start in March. */
function fetchWindowStart(academicYear: string): string {
  return `${academicYear.slice(0, 4)}-03-01T00:00:00.000Z`;
}

/**
 * Enrollments in the active academic year whose installments stopped before
 * the course was paid off. "Paid off" means the discounted list price:
 * coursePricing.ts's price, times quantity, reduced by the same discount
 * fraction Squarespace applied to the first order (financial-aid codes
 * discount every installment equally, so one ratio covers the whole plan).
 */
export async function findLapsedPaymentPlans(now = new Date()): Promise<LapsedPlansReport> {
  const academicYear = ACTIVE_REGISTRATION_ACADEMIC_YEAR;
  const orders = await fetchOrders(fetchWindowStart(academicYear), now.toISOString());

  const lapsed: Omit<LapsedPlan, "firstName" | "lastName" | "phone">[] = [];
  const missingPrice = new Set<string>();

  for (const { lineItem, orders: installments } of groupEnrollments(orders)) {
    const first = installments[0];
    const plan = lineItem.variantOptions?.find((o) => o.optionName === "Plan")?.value;
    const term = deriveTerm(lineItem.productName, plan, first.createdOn);
    if (term.academicYear !== academicYear) continue;

    const listPrice = getCourseListPrice(lineItem.productName);
    if (listPrice === null) {
      if (installments.length > 1) missingPrice.add(lineItem.productName);
      continue;
    }

    const firstGross = Number(lineItem.unitPricePaid.value) * lineItem.quantity;
    const discountRatio = firstGross > 0 ? lineItemNet(first, lineItem) / firstGross : 0;
    const expectedTotal = listPrice * lineItem.quantity * discountRatio;
    const amountPaid = installments.reduce((sum, order) => sum + lineItemNet(order, lineItem), 0);
    if (amountPaid >= expectedTotal - PAID_IN_FULL_TOLERANCE) continue;

    // Orders carry no "payment plan" flag. A single payment of most of the
    // price is a one-time purchase at an early-bird or otherwise lower price
    // (live data, Nov 2026: $450 of $500, $360 of $400), not an abandoned
    // plan, so only count it as a plan below half the price.
    const installmentAmount = lineItemNet(first, lineItem);
    if (installments.length === 1 && installmentAmount >= expectedTotal / 2 - PAID_IN_FULL_TOLERANCE) continue;

    const lastPaymentOn = installments[installments.length - 1].createdOn;
    const daysSinceLastPayment = Math.floor((now.getTime() - new Date(lastPaymentOn).getTime()) / 86_400_000);
    if (daysSinceLastPayment < LAPSED_AFTER_DAYS) continue;

    lapsed.push({
      lineItemId: lineItem.id,
      email: first.customerEmail.trim().toLowerCase(),
      productName: lineItem.productName,
      semester: term.semester,
      installmentsPaid: installments.length,
      installmentAmount,
      amountPaid,
      expectedTotal,
      lastPaymentOn,
      daysSinceLastPayment,
    });
  }

  // Names come from the student docs courseSync already resolved (account
  // profile over billing name), rather than a Profiles API call per row.
  const db = getDb();
  const emails = [...new Set(lapsed.map((p) => p.email))];
  const students = emails.length
    ? await db.getAll(...emails.map((email) => db.collection(STUDENTS_COLLECTION).doc(email)))
    : [];
  const studentByEmail = new Map(students.map((snap) => [snap.id, snap.data()]));

  const plans = lapsed
    .map((p) => {
      const student = studentByEmail.get(p.email);
      return {
        ...p,
        firstName: (student?.firstName as string | null) ?? null,
        lastName: (student?.lastName as string | null) ?? null,
        phone: (student?.phone as string | null) ?? null,
      };
    })
    .sort((a, b) => b.expectedTotal - b.amountPaid - (a.expectedTotal - a.amountPaid));

  return { academicYear, plans, productsMissingListPrice: [...missingPrice].sort() };
}
