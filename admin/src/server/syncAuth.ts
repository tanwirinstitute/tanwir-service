import { NextRequest } from "next/server";
import { hasValidBearerToken } from "@tanwir/shared/auth";

/**
 * The sync endpoint is gated by a single shared secret (SYNC_API_TOKEN) so
 * that only the external cron trigger (or an operator) can spend Squarespace
 * API calls and write to Firestore. Callers authenticate with an
 * `Authorization: Bearer <token>` header.
 */
export function hasValidSyncToken(request: NextRequest): boolean {
  return hasValidBearerToken(request, process.env.SYNC_API_TOKEN);
}
