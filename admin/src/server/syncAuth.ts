import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

/**
 * The sync endpoint is gated by a single shared secret (SYNC_API_TOKEN) so
 * that only the external cron trigger (or an operator) can spend Squarespace
 * API calls and write to Firestore. Callers authenticate with an
 * `Authorization: Bearer <token>` header.
 */
export function hasValidSyncToken(request: NextRequest): boolean {
  const expected = process.env.SYNC_API_TOKEN;
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
