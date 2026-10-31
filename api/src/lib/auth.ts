import { NextRequest } from "next/server";
import { requireBearerToken } from "@tanwir/shared/auth";

/**
 * Every endpoint is gated by the same shared secret as admin's
 * POST /api/sync-courses (SYNC_API_TOKEN) rather than a token of its own —
 * this is an internal ops action, not end-user-facing. The value must match
 * SYNC_API_TOKEN in admin/.env. Callers authenticate with an
 * `Authorization: Bearer <token>` header.
 */
export function requireAuth(request: NextRequest) {
  return requireBearerToken(request, process.env.SYNC_API_TOKEN);
}
