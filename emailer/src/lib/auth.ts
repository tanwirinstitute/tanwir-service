import { NextRequest } from "next/server";
import { requireBearerToken } from "@tanwir/shared/auth";

/**
 * Every send-* endpoint is gated by a single shared secret (MAIL_API_TOKEN) so
 * that anyone who can reach this service can't spend Gmail send volume or
 * impersonate Tanwir Institute. Callers (e.g. the admin app) authenticate
 * with an `Authorization: Bearer <token>` header.
 */
export function requireAuth(request: NextRequest) {
  return requireBearerToken(request, process.env.MAIL_API_TOKEN);
}
