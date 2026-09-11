import { NextResponse } from "next/server";
import { resolveQrLink } from "@/server/qrLinks";

/**
 * Public scan endpoint for dynamic QR codes — the URL printed inside every
 * generated code. Deliberately unauthenticated (anyone scanning a flyer hits
 * it) and read-only: it resolves the slug to wherever the QR Codes console
 * currently points it and redirects.
 *
 * Must be resolved fresh on every scan, and never cached by browsers or CDNs
 * (302 + no-store): retargeting a printed code has to take effect
 * immediately, which is the entire point of the feature.
 */
export const dynamic = "force-dynamic";

/** Where scans of unknown/deleted slugs land instead of an error page. */
const FALLBACK_URL = "https://tanwir.institute";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let targetUrl: string | null = null;
  try {
    targetUrl = await resolveQrLink(slug.toLowerCase());
  } catch (error) {
    // On a Firestore outage still send the scanner somewhere useful.
    console.error(`Failed to resolve QR link "${slug}":`, error);
  }

  return NextResponse.redirect(targetUrl ?? FALLBACK_URL, {
    status: 302,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
