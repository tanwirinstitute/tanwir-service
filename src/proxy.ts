import { NextRequest, NextResponse } from "next/server";

/**
 * Each subdomain of tanwir.institute is served by its own independently
 * deployed Next.js app. This gateway is the only thing bound to the wildcard
 * domain; it rewrites each request to the origin for the subdomain it saw,
 * per the multi-zones pattern (docs: app/guides/multi-zones). Requests to
 * the apex domain, or to a subdomain with no configured origin, fall through
 * to this app's own pages.
 */
const ZONE_ORIGINS: Record<string, string | undefined> = {
  consent: process.env.CONSENT_ORIGIN,
  email: process.env.EMAIL_ORIGIN,
  admin: process.env.ADMIN_ORIGIN,
  tlp: process.env.TLP_ORIGIN,
};

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const subdomain = host.split(".")[0];
  const target = ZONE_ORIGINS[subdomain];

  if (!target) {
    return NextResponse.next();
  }

  const url = new URL(request.nextUrl.pathname + request.nextUrl.search, target);
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
