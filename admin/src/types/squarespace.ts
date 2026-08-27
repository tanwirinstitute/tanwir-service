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
