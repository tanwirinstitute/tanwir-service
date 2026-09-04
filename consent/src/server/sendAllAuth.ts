import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

/**
 * The bulk send-all endpoint is gated by its own shared secret
 * (ZAKAT_SEND_API_TOKEN) rather than ADMIN_TOKEN, so the cron job's
 * credential is scoped separately from the human admin UI's and can be
 * rotated independently — same reasoning as admin's SYNC_API_TOKEN being
 * distinct from its ADMIN_TOKEN. Callers authenticate with an
 * `Authorization: Bearer <token>` header.
 */
export function hasValidSendAllToken(request: NextRequest): boolean {
  const expected = process.env.ZAKAT_SEND_API_TOKEN;
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const provided = match ? match[1] : null;

  if (!expected || !provided) {
    return false;
  }

  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);

  return providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);
}
