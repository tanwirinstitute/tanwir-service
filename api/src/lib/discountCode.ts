import { randomInt } from "crypto";

const SUFFIX_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SUFFIX_LENGTH = 4;

function randomSuffix(): string {
  let suffix = "";
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += SUFFIX_CHARS[randomInt(SUFFIX_CHARS.length)];
  }
  return suffix;
}

/**
 * Builds a code like FAID-YP-75-26-2B3E: award type, program code, discount
 * percentage, 2-digit year, and a random suffix. The suffix exists because
 * Squarespace rejects a promo code that's already in use — without it,
 * every 75%-off code for the same program in the same year would collide.
 */
export function generateDiscountCode(params: { type: string; programCode: string; discountPercentage: number }): string {
  const { type, programCode, discountPercentage } = params;
  const year = new Date().getFullYear().toString().slice(-2);
  return `${type}-${programCode}-${discountPercentage}-${year}-${randomSuffix()}`;
}
