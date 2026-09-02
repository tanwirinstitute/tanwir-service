import type {
  SquarespaceCreateDiscountRequest,
  SquarespaceDiscount,
  SquarespaceDiscountResponse,
  SquarespaceErrorPayload,
} from "@/types/squarespace";

const SQUARESPACE_API_URL = process.env.SQUARESPACE_API_URL || "https://api.squarespace.com";

export class SquarespaceApiError extends Error {
  status: number;
  payload: SquarespaceErrorPayload | null;

  constructor(status: number, payload: SquarespaceErrorPayload | null, message: string) {
    super(message);
    this.name = "SquarespaceApiError";
    this.status = status;
    this.payload = payload;
  }
}

export interface CreateDiscountParams {
  name: string;
  promoCode: string;
  percentage: number;
  validFrom: Date;
  validTo?: Date;
  isOncePerCustomer?: boolean;
  maxUsesAllowed?: number;
}

/**
 * Creates a site-wide, percentage-off, promo-code-triggered discount via
 * Squarespace's Commerce Discounts API. Requires SQUARESPACE_API_KEY to
 * carry the "Discounts" write scope.
 */
export async function createDiscount(params: CreateDiscountParams): Promise<SquarespaceDiscount> {
  const apiKey = process.env.SQUARESPACE_API_KEY;
  if (!apiKey) {
    throw new Error("SQUARESPACE_API_KEY is not set");
  }

  const body: SquarespaceCreateDiscountRequest = {
    name: params.name,
    criteria: { type: "ANY_ORDER" },
    template: { type: "PERCENTAGE", percentage: String(params.percentage) },
    trigger: { type: "CODE", promoCode: params.promoCode },
    validFrom: params.validFrom.toISOString(),
    isOncePerCustomer: params.isOncePerCustomer ?? true,
  };

  if (params.validTo) {
    body.validTo = params.validTo.toISOString();
  }
  if (params.maxUsesAllowed !== undefined) {
    body.isLimitedUses = true;
    body.maxUsesAllowed = params.maxUsesAllowed;
  }

  const response = await fetch(`${SQUARESPACE_API_URL}/v1/commerce/discounts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": process.env.SQUARESPACE_USER_AGENT || "tanwir-api",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as SquarespaceErrorPayload | null;
    throw new SquarespaceApiError(response.status, payload, payload?.message || `Squarespace API responded ${response.status}`);
  }

  const data = (await response.json()) as SquarespaceDiscountResponse;
  return data.discount;
}
