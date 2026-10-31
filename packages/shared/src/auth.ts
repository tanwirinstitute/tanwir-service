import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Constant-time check of an `Authorization: Bearer <token>` header against
 * `expected` (an env var the caller picks). An unset `expected` always fails,
 * so a missing secret locks the endpoint rather than opening it.
 */
export function hasValidBearerToken(request: NextRequest, expected: string | undefined): boolean {
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

/** Route-handler form: returns a 401 response to send, or null when authorized. */
export function requireBearerToken(request: NextRequest, expected: string | undefined): NextResponse | null {
  return hasValidBearerToken(request, expected)
    ? null
    : NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
}
