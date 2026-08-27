import { timingSafeEqual } from "crypto";

/**
 * The dashboard is gated by a single shared secret set as ADMIN_TOKEN, passed
 * as a query param (matches consent/admin's pattern). If ADMIN_TOKEN is unset
 * the dashboard stays locked (fails closed) rather than open to everyone.
 */
export function isValidAdminToken(token: string | null | undefined): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || !token) {
    return false;
  }

  const provided = Buffer.from(token);
  const secret = Buffer.from(expected);

  if (provided.length !== secret.length) {
    return false;
  }

  return timingSafeEqual(provided, secret);
}
