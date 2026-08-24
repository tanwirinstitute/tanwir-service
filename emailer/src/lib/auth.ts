import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Every send-* endpoint is gated by a single shared secret (MAIL_API_TOKEN) so
 * that anyone who can reach this service can't spend Gmail send volume or
 * impersonate Tanwir Institute. Callers (e.g. the consent app) authenticate
 * with an `Authorization: Bearer <token>` header.
 */
export function requireAuth(request: NextRequest): NextResponse | null {
  const expected = process.env.MAIL_API_TOKEN;
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
