/**
 * Shapes for Squarespace's Commerce Discounts API
 * (POST/GET/PUT/DELETE {SQUARESPACE_API_URL}/v1/commerce/discounts), as
 * confirmed against the live OpenAPI spec published at
 * https://developers.squarespace.com/commerce-apis/latest/schema-processor-version-version-latest.json
 * (checked Sep 2026). Only the request/response shapes this app actually
 * sends are modeled: an "any order" criteria, a flat percentage-off
 * template, and a shopper-entered promo code trigger. The spec's own
 * examples never show a filled-in "type" discriminator value for these —
 * ANY_ORDER / PERCENTAGE / CODE are inferred from the spec's list-endpoint
 * filter enums, which are the only other place those three schemas are
 * named by string rather than $ref.
 */

export interface SquarespaceAnyOrderCriteria {
  type: "ANY_ORDER";
}

export interface SquarespacePercentageTemplate {
  type: "PERCENTAGE";
  /**
   * (0, 100]. Sent as a string — confirmed against the live API (Sep 2026):
   * the published schema types this as `number`, but a numeric JSON value
   * gets rejected with "value at JSON path 'template.percentage' did not
   * match the required type"; only a string value is accepted. The response
   * still returns it as a JSON number.
   */
  percentage: string;
}

export interface SquarespacePromoCodeTrigger {
  type: "CODE";
  /** 1-50 chars: letters, digits, underscore, hyphen. */
  promoCode: string;
}

export interface SquarespacePaymentPlanOptions {
  /** Defaults to NONE when omitted from a create/update request. */
  type: "NONE" | "ALL_PAYMENTS";
}

export interface SquarespaceSubscriptionOptions {
  /** Defaults to EXCLUDED when omitted from a create/update request. */
  type: "EXCLUDED" | "ALL_PAYMENTS" | "LIMITED_PAYMENTS";
}

export interface SquarespaceCreateDiscountRequest {
  name: string;
  criteria: SquarespaceAnyOrderCriteria;
  template: SquarespacePercentageTemplate;
  trigger: SquarespacePromoCodeTrigger;
  validFrom: string;
  validTo?: string;
  isLimitedUses?: boolean;
  maxUsesAllowed?: number;
  isOncePerCustomer?: boolean;
  paymentPlanOptions?: SquarespacePaymentPlanOptions;
  subscriptionOptions?: SquarespaceSubscriptionOptions;
}

export interface SquarespaceDiscount {
  id: string;
  name: string;
  status: "ACTIVE" | "SCHEDULED" | "EXPIRED";
  numberOfUses: number;
  validFrom: string;
  validTo?: string | null;
  websiteId: string;
  [key: string]: unknown;
}

export interface SquarespaceDiscountResponse {
  discount: SquarespaceDiscount;
}

export interface SquarespaceErrorPayload {
  type?: string;
  subtype?: string;
  message?: string;
  contextId?: string;
  details?: unknown;
}
