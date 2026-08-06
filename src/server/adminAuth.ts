import { timingSafeEqual } from "crypto";

/**
 * The admin UI is gated by a single shared secret set as ADMIN_TOKEN. The token
 * is passed to /admin as a query param and threaded through to the trigger API.
 * If ADMIN_TOKEN is unset the admin surface stays locked (fails closed) rather
 * than open to everyone.
 */
export function isValidAdminToken(token: string | null | undefined): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || !token) {
    return false;
  }

  const provided = Buffer.from(token);
  const secret = Buffer.from(expected);

  // timingSafeEqual throws on length mismatch, so guard first. Comparing lengths
  // isn't itself constant-time, but the secret's length is not sensitive.
  if (provided.length !== secret.length) {
    return false;
  }

  return timingSafeEqual(provided, secret);
}
