import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateDiscountCode } from "@/lib/discountCode";
import { createDiscount, SquarespaceApiError } from "@/lib/squarespace";

interface CreateDiscountCodeRequest {
  type?: string;
  programCode: string;
  discountPercentage: number;
  name?: string;
  validDays?: number;
  maxUsesAllowed?: number;
}

// Matches the discounts already issued via emailer's send-financial-aid-email.
const VALID_DISCOUNTS = [25, 50, 75, 100];
const CODE_SEGMENT_PATTERN = /^[A-Z0-9]{2,6}$/;
const DEFAULT_TYPE = "FAID";
// Matches the "expire in 14 days" copy in emailer's financial aid email.
const DEFAULT_VALID_DAYS = 14;
const MAX_PROMO_CODE_ATTEMPTS = 3;

export async function POST(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  let body: CreateDiscountCodeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const type = (body.type || DEFAULT_TYPE).toUpperCase();
  const programCode = (body.programCode || "").toUpperCase();
  const discountPercentage = body.discountPercentage;
  const validDays = body.validDays ?? DEFAULT_VALID_DAYS;

  if (!CODE_SEGMENT_PATTERN.test(type)) {
    return NextResponse.json({ success: false, message: "type must be 2-6 uppercase letters/digits" }, { status: 400 });
  }
  if (!CODE_SEGMENT_PATTERN.test(programCode)) {
    return NextResponse.json({ success: false, message: "programCode must be 2-6 uppercase letters/digits" }, { status: 400 });
  }
  if (typeof discountPercentage !== "number" || !VALID_DISCOUNTS.includes(discountPercentage)) {
    return NextResponse.json(
      { success: false, message: `discountPercentage must be one of ${VALID_DISCOUNTS.join(", ")}` },
      { status: 400 }
    );
  }
  if (!Number.isInteger(validDays) || validDays <= 0) {
    return NextResponse.json({ success: false, message: "validDays must be a positive integer" }, { status: 400 });
  }

  const validFrom = new Date();
  const validTo = new Date(validFrom.getTime() + validDays * 24 * 60 * 60 * 1000);
  const name = body.name || `${type} ${discountPercentage}% - ${programCode}`;

  for (let attempt = 1; attempt <= MAX_PROMO_CODE_ATTEMPTS; attempt++) {
    const code = generateDiscountCode({ type, programCode, discountPercentage });

    try {
      const discount = await createDiscount({
        name,
        promoCode: code,
        percentage: discountPercentage,
        validFrom,
        validTo,
        isOncePerCustomer: true,
        maxUsesAllowed: body.maxUsesAllowed,
      });

      return NextResponse.json({ success: true, code, discount });
    } catch (error) {
      // Random 4-char suffix collided with an existing code for the same
      // type/program/percentage/year combo — vanishingly unlikely, but
      // retry with a fresh suffix rather than fail outright.
      const isCodeConflict = error instanceof SquarespaceApiError && error.payload?.subtype === "PROMO_CODE_CONFLICT";
      if (isCodeConflict && attempt < MAX_PROMO_CODE_ATTEMPTS) {
        continue;
      }

      console.error("Failed to create Squarespace discount:", error);
      if (error instanceof SquarespaceApiError) {
        return NextResponse.json(
          { success: false, message: "Squarespace API rejected the discount", error: error.payload ?? error.message },
          { status: error.status }
        );
      }
      return NextResponse.json(
        { success: false, message: "Failed to create discount", error: (error as Error).message },
        { status: 500 }
      );
    }
  }

  // Unreachable: the loop above always returns or throws.
  return NextResponse.json({ success: false, message: "Failed to create discount" }, { status: 500 });
}
