import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Every endpoint is gated by the same shared secret as admin's
 * POST /api/sync-courses (SYNC_API_TOKEN) rather than a token of its own —
 * this is an internal ops action, not end-user-facing. The value must match
 * SYNC_API_TOKEN in admin/.env. Callers authenticate with an
 * `Authorization: Bearer <token>` header.
 */
export function requireAuth(request: NextRequest): NextResponse | null {
  const expected = process.env.SYNC_API_TOKEN;
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const provided = match ? match[1] : null;

  if (!expected || !provided) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);

  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  return null;
}
