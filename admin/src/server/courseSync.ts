import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase";
import { fetchOrders, fetchProfileByEmail } from "@/lib/squarespace";
import { deriveTerm } from "./academicTerm";
import type {
  SquarespaceFormSubmissionField,
  SquarespaceLineItem,
  SquarespaceOrder,
  SquarespaceVariantOption,
} from "@/types/squarespace";
import type { CourseRecord } from "@/types/student";

const STUDENTS_COLLECTION = process.env.STUDENTS_COLLECTION || "students";
const SYNC_STATE_COLLECTION = "syncState";
const SYNC_STATE_DOC = "squarespaceOrders";

/**
 * Both of these have carried real course purchases in production (confirmed
 * against live order data, Aug 2026): SERVICE (e.g. "Taqwa for Teens") and
 * PAYWALL_PRODUCT (e.g. Associates Program, Foundations, The Journey).
 * Everything else (PHYSICAL_PRODUCT/merch, etc.) is non-course noise to skip.
 */
const COURSE_LINE_ITEM_TYPES = new Set(["SERVICE", "PAYWALL_PRODUCT"]);

/**
 * One-off events sold the same way as courses (SERVICE line items), so
 * lineItemType alone can't tell them apart — confirmed against live order
 * data, Aug 2026. Matched by name rather than productId: "Annual Arafat
 * Program" is recreated as a new Squarespace product every year (two
 * different productIds already seen), so the name is the only stable key.
 */
const EXCLUDED_EVENT_PRODUCT_NAMES = new Set(["Commemoration of the Battle of Badr", "Annual Arafat Program"]);

/**
 * A payment-plan installment bumps an order's modifiedOn without changing
 * what was purchased, so the same order resurfaces on a later poll. The
 * overlap buffer covers clock skew / boundary misses between runs.
 */
const OVERLAP_BUFFER_MS = 5 * 60 * 1000;
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export interface SyncSummary {
  ordersFetched: number;
  coursesSynced: number;
  coursesAlreadySynced: number;
  lineItemsSkippedNonCourse: number;
  lineItemsSkippedEvent: number;
  ordersSkippedNoEmail: number;
  studentsNamedFromProfile: number;
  studentsNamedFromBilling: number;
  errors: number;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

interface ResolvedName {
  firstName: string | null;
  lastName: string | null;
  source: "profile" | "billing";
}

/**
 * The student's name should come from their Squarespace *account* (the person
 * who logs in to reach the course), not the order's billing form — that form
 * is frequently filled in by a parent or whoever's card was used. Falls back
 * to the billing address only when there's no account profile or the profile
 * carries no name (guest checkout). `profileCache` dedupes the Profiles API
 * call across a student's multiple orders within one run.
 */
async function resolveStudentName(
  order: SquarespaceOrder,
  profileCache: Map<string, Awaited<ReturnType<typeof fetchProfileByEmail>>>
): Promise<ResolvedName> {
  const cacheKey = normalizeEmail(order.customerEmail);
  if (!profileCache.has(cacheKey)) {
    profileCache.set(cacheKey, await fetchProfileByEmail(order.customerEmail));
  }
  const profile = profileCache.get(cacheKey) ?? null;

  const profileFirst = profile?.firstName?.trim() || null;
  const profileLast = profile?.lastName?.trim() || null;
  if (profileFirst || profileLast) {
    return { firstName: profileFirst, lastName: profileLast, source: "profile" };
  }

  return {
    firstName: order.billingAddress?.firstName?.trim() || null,
    lastName: order.billingAddress?.lastName?.trim() || null,
    source: "billing",
  };
}

/**
 * Squarespace's newer checkout forms include a "New or returning student"
 * question with NO label at all (confirmed against live order data, Aug
 * 2026 — every recent order's formSubmission is exactly [{label:"Gender",
 * value:...}, {label:"", value:"Returning Student"|""}]). A naive
 * `if (field.label)` check treats that empty string as falsy and silently
 * drops the field, so fall back to a positional key instead of skipping it.
 */
function flattenFormFields(
  fields: SquarespaceFormSubmissionField[] | null | undefined,
  fallbackPrefix = "Response"
): Record<string, string> {
  const result: Record<string, string> = {};
  (fields ?? []).forEach((field, index) => {
    result[field.label || `${fallbackPrefix} ${index + 1}`] = field.value;
  });
  return result;
}

const STUDENT_TYPE_VALUE_PATTERN = /new student|returning student/i;

/**
 * Gender and new/returning status are asked on every checkout, but the
 * question label varies by product/form era: proper labels ("Gender",
 * "I am a") on older SERVICE-type customizations, vs. "Gender" + an
 * unlabeled field on the newer order-level formSubmission. Checks both
 * locations and both label conventions rather than assuming one shape.
 */
function extractGender(order: SquarespaceOrder, lineItem: SquarespaceLineItem): string | null {
  const allFields = [...(order.formSubmission ?? []), ...(lineItem.customizations ?? [])];
  return allFields.find((f) => /^gender$/i.test(f.label ?? ""))?.value || null;
}

function extractStudentType(order: SquarespaceOrder, lineItem: SquarespaceLineItem): string | null {
  const allFields = [...(order.formSubmission ?? []), ...(lineItem.customizations ?? [])];
  const labeled = allFields.find((f) => /^i am a$/i.test(f.label ?? ""));
  if (labeled) return labeled.value || null;

  const unlabeled = allFields.find((f) => !f.label && STUDENT_TYPE_VALUE_PATTERN.test(f.value ?? ""));
  return unlabeled?.value || null;
}

function flattenVariantOptions(options: SquarespaceVariantOption[] | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const option of options ?? []) {
    if (option.optionName) {
      result[option.optionName] = option.value;
    }
  }
  return result;
}

function buildCourseRecord(order: SquarespaceOrder, lineItem: SquarespaceLineItem): CourseRecord {
  const purchasedOn = order.createdOn;
  const variantOptions = flattenVariantOptions(lineItem.variantOptions);
  const { semester, academicYear } = deriveTerm(lineItem.productName, variantOptions.Plan, purchasedOn);

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    lineItemId: lineItem.id,
    productId: lineItem.productId,
    productName: lineItem.productName,
    lineItemType: lineItem.lineItemType,
    quantity: lineItem.quantity,
    pricePaid: lineItem.unitPricePaid,
    purchasedOn,
    semester,
    academicYear,
    gender: extractGender(order, lineItem),
    studentType: extractStudentType(order, lineItem),
    variantOptions,
    // Checkout answers can live at either the order level (formSubmission) or
    // the line-item level (customizations) depending on which product type
    // and checkout form was used — merge both generically rather than
    // assuming a fixed per-course field layout, since that layout has
    // already changed once as the course catalog evolved.
    formResponses: { ...flattenFormFields(order.formSubmission), ...flattenFormFields(lineItem.customizations) },
    syncedAt: FieldValue.serverTimestamp(),
  };
}

async function getSyncWindow(): Promise<{ modifiedAfter: string; modifiedBefore: string }> {
  const db = getDb();
  const stateDoc = await db.collection(SYNC_STATE_COLLECTION).doc(SYNC_STATE_DOC).get();
  const lastCursor = stateDoc.get("lastModifiedBefore") as string | undefined;

  const modifiedBefore = new Date().toISOString();
  const modifiedAfter = lastCursor
    ? new Date(new Date(lastCursor).getTime() - OVERLAP_BUFFER_MS).toISOString()
    : new Date(Date.now() - DEFAULT_LOOKBACK_MS).toISOString();

  return { modifiedAfter, modifiedBefore };
}

async function advanceSyncCursor(modifiedBefore: string): Promise<void> {
  const db = getDb();
  await db
    .collection(SYNC_STATE_COLLECTION)
    .doc(SYNC_STATE_DOC)
    .set({ lastModifiedBefore: modifiedBefore, lastRunAt: FieldValue.serverTimestamp() }, { merge: true });
}

export interface RunCourseSyncOptions {
  /**
   * Backfill mode: process everything modified since this ISO timestamp
   * instead of the persisted cursor. The cursor still advances to now on
   * success, so incremental syncs pick up seamlessly from here afterward.
   */
  since?: string;
}

/**
 * Fetches orders since the last successful sync (or `options.since` for a
 * one-off backfill), records one course doc per course-type line item under
 * students/{email}/courses/{lineItemId}, and advances the sync cursor.
 * Squarespace accounts now handle login, so this only tracks enrollment (no
 * password/account creation).
 */
export async function runCourseSync(options?: RunCourseSyncOptions): Promise<SyncSummary> {
  const db = getDb();
  const { modifiedAfter, modifiedBefore } = options?.since
    ? { modifiedAfter: options.since, modifiedBefore: new Date().toISOString() }
    : await getSyncWindow();

  const orders = await fetchOrders(modifiedAfter, modifiedBefore);

  // A payment-plan installment is a brand new order sharing the *same*
  // lineItemId as the original purchase (confirmed against live data, Aug
  // 2026: 8 monthly orders, one lineItemId) — Squarespace bills each
  // installment as its own order, not a modification of the first one.
  // courseDocId below dedupes on lineItemId alone so only one course record
  // exists per enrollment; processing oldest-first means that record's
  // purchasedOn/orderNumber reflect the original enrollment, not whichever
  // installment happened to sync first.
  orders.sort((a, b) => a.createdOn.localeCompare(b.createdOn));

  const summary: SyncSummary = {
    ordersFetched: orders.length,
    coursesSynced: 0,
    coursesAlreadySynced: 0,
    lineItemsSkippedNonCourse: 0,
    lineItemsSkippedEvent: 0,
    ordersSkippedNoEmail: 0,
    studentsNamedFromProfile: 0,
    studentsNamedFromBilling: 0,
    errors: 0,
  };

  const profileCache = new Map<string, Awaited<ReturnType<typeof fetchProfileByEmail>>>();

  for (const order of orders) {
    const courseTypeLineItems = (order.lineItems ?? []).filter((li) => COURSE_LINE_ITEM_TYPES.has(li.lineItemType));
    summary.lineItemsSkippedNonCourse += (order.lineItems?.length ?? 0) - courseTypeLineItems.length;

    const courseLineItems = courseTypeLineItems.filter(
      (li) => !EXCLUDED_EVENT_PRODUCT_NAMES.has(li.productName?.trim())
    );
    summary.lineItemsSkippedEvent += courseTypeLineItems.length - courseLineItems.length;

    if (courseLineItems.length === 0) {
      continue;
    }

    if (!order.customerEmail) {
      summary.ordersSkippedNoEmail++;
      continue;
    }

    try {
      const studentId = normalizeEmail(order.customerEmail);
      const studentRef = db.collection(STUDENTS_COLLECTION).doc(studentId);
      const studentSnapshot = await studentRef.get();

      const name = await resolveStudentName(order, profileCache);
      if (name.source === "profile") {
        summary.studentsNamedFromProfile++;
      } else {
        summary.studentsNamedFromBilling++;
      }

      await studentRef.set(
        {
          email: order.customerEmail,
          firstName: name.firstName,
          lastName: name.lastName,
          phone: order.billingAddress?.phone || null,
          updatedAt: FieldValue.serverTimestamp(),
          ...(studentSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true }
      );

      for (const lineItem of courseLineItems) {
        const courseRef = studentRef.collection("courses").doc(lineItem.id);

        const existing = await courseRef.get();
        if (existing.exists) {
          // Either the same order resurfaced (e.g. modifiedOn bumped by
          // something unrelated) or this is a later payment-plan
          // installment of an enrollment already recorded — either way,
          // nothing new to do.
          summary.coursesAlreadySynced++;
          continue;
        }

        await courseRef.set(buildCourseRecord(order, lineItem));
        summary.coursesSynced++;
      }
    } catch (error) {
      console.error(`Failed to sync order ${order.id} for ${order.customerEmail}:`, error);
      summary.errors++;
    }
  }

  if (summary.errors === 0) {
    await advanceSyncCursor(modifiedBefore);
  }

  return summary;
}
