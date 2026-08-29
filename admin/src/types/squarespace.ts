/**
 * Squarespace order payload shapes aren't formally documented; these are
 * inferred from actual API responses and kept loose (unknown extra fields
 * allowed) rather than fully strict. Confirmed against live data in Aug 2026:
 * course line items now come through as both SERVICE and PAYWALL_PRODUCT, and
 * PAYWALL_PRODUCT items carry null lineItem customizations/variantOptions —
 * checkout answers for those live in the order-level formSubmission instead.
 */

export interface SquarespaceFormSubmissionField {
  label: string;
  value: string;
}

export interface SquarespaceVariantOption {
  optionName: string;
  value: string;
}

export interface SquarespaceLineItem {
  id: string;
  lineItemType: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPricePaid: { currency: string; value: string };
  variantOptions: SquarespaceVariantOption[] | null;
  customizations: SquarespaceFormSubmissionField[] | null;
  [key: string]: unknown;
}

export interface SquarespaceBillingAddress {
  firstName?: string;
  lastName?: string;
  phone?: string;
  [key: string]: unknown;
}

export interface SquarespaceOrder {
  id: string;
  orderNumber: string;
  createdOn: string;
  modifiedOn: string;
  customerEmail: string;
  billingAddress?: SquarespaceBillingAddress | null;
  formSubmission?: SquarespaceFormSubmissionField[] | null;
  lineItems: SquarespaceLineItem[];
  [key: string]: unknown;
}

export interface SquarespacePagination {
  nextPageUrl?: string | null;
  hasNextPage?: boolean;
}

export interface SquarespaceOrdersResponse {
  result?: SquarespaceOrder[];
  pagination?: SquarespacePagination;
}

/**
 * Customer Profiles API shape (inferred from live responses, Aug 2026). This
 * is the Squarespace *account* holder — the person who logs in to reach the
 * paywalled course — as opposed to whatever name/phone was typed into an
 * order's billing form. `hasAccount` is false for guest checkouts that never
 * created a login; in that case there's no account name to trust and callers
 * fall back to the order's billing address.
 */
export interface SquarespaceProfile {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  hasAccount?: boolean;
  address?: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

export interface SquarespaceProfilesResponse {
  profiles?: SquarespaceProfile[];
  pagination?: SquarespacePagination;
}
