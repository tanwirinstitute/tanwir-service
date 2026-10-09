import { FieldValue } from "firebase-admin/firestore";
import { fetchProductsByIds } from "@/lib/squarespace";
import type { SquarespaceFormSubmissionField, SquarespaceLineItem, SquarespaceOrder } from "@/types/squarespace";
import type { EventRegistrationRecord } from "@/types/event";

export const EVENT_REGISTRATIONS_COLLECTION = "eventRegistrations";

/**
 * Event products are filed under the "Events" store category in Squarespace
 * for the storefront, but no Squarespace API exposes categories — so every
 * event product must *also* carry this tag, which the Products API does
 * return. Compared case-insensitively.
 */
const EVENT_PRODUCT_TAG = "events";

/**
 * Events sold before the events tag existed (Oct 2026). Matched by name
 * rather than productId: "Annual Arafat Program" is recreated as a new
 * Squarespace product every year (two different productIds already seen),
 * so the name is the only stable key. Don't add new events here — tag them.
 */
const LEGACY_EVENT_PRODUCT_NAMES = new Set(["Commemoration of the Battle of Badr", "Annual Arafat Program"]);

/**
 * Paywall products (the online courses) have no Products API counterpart,
 * so they can never carry the events tag — skip looking them up.
 */
const UNTAGGABLE_LINE_ITEM_TYPES = new Set(["PAYWALL_PRODUCT"]);

export type EventMatch = EventRegistrationRecord["matchedBy"] | null;

/**
 * Resolves which line items are events for one sync run. Call `prime` once
 * with every order in the run so product tags are fetched in a few batched
 * requests, then `match` per line item.
 */
export function createEventClassifier() {
  const taggedProductIds = new Set<string>();

  return {
    async prime(orders: SquarespaceOrder[]): Promise<void> {
      const ids = new Set<string>();
      for (const order of orders) {
        for (const li of order.lineItems ?? []) {
          if (li.productId && !UNTAGGABLE_LINE_ITEM_TYPES.has(li.lineItemType)) {
            ids.add(li.productId);
          }
        }
      }
      if (ids.size === 0) return;

      const products = await fetchProductsByIds([...ids]);
      for (const product of products) {
        if ((product.tags ?? []).some((tag) => tag.trim().toLowerCase() === EVENT_PRODUCT_TAG)) {
          taggedProductIds.add(product.id);
        }
      }
    },

    match(lineItem: SquarespaceLineItem): EventMatch {
      if (taggedProductIds.has(lineItem.productId)) return "tag";
      if (LEGACY_EVENT_PRODUCT_NAMES.has(lineItem.productName?.trim())) return "legacy";
      return null;
    },
  };
}

function findField(fields: SquarespaceFormSubmissionField[], pattern: RegExp): string | null {
  return fields.find((f) => pattern.test(f.label ?? ""))?.value?.trim() || null;
}

/**
 * RSVP answers can sit on the line item (customizations — every event so
 * far) or the order (formSubmission — how the newer course checkouts work),
 * so check both, line item first.
 */
export function buildEventRegistration(
  order: SquarespaceOrder,
  lineItem: SquarespaceLineItem,
  matchedBy: NonNullable<EventMatch>
): EventRegistrationRecord {
  const fields = [...(lineItem.customizations ?? []), ...(order.formSubmission ?? [])];

  const billingName = [order.billingAddress?.firstName, order.billingAddress?.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  // Arafat 2026 asked "How Many Attending?" on some orders and "How Many
  // Are Attending?" on others — match the shared shape, not one wording.
  const attendingAnswer = findField(fields, /how many.*attending/i);
  const attendingParsed = attendingAnswer ? parseInt(attendingAnswer.match(/\d+/)?.[0] ?? "", 10) : NaN;

  const formResponses: Record<string, string> = {};
  fields.forEach((field, index) => {
    const key = field.label || `Response ${index + 1}`;
    if (!(key in formResponses)) formResponses[key] = field.value;
  });

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    lineItemId: lineItem.id,
    productId: lineItem.productId,
    productName: lineItem.productName,
    lineItemType: lineItem.lineItemType,
    quantity: lineItem.quantity,
    pricePaid: lineItem.unitPricePaid,
    registeredOn: order.createdOn,
    name: findField(fields, /^(full )?name$/i) || billingName || null,
    email: (findField(fields, /^e-?mail( address)?$/i) || order.customerEmail || "").trim(),
    phone: findField(fields, /^phone( number)?$/i) || order.billingAddress?.phone?.trim() || null,
    attending: Number.isFinite(attendingParsed) && attendingParsed > 0 ? attendingParsed : lineItem.quantity,
    matchedBy,
    formResponses,
    syncedAt: FieldValue.serverTimestamp(),
  };
}
