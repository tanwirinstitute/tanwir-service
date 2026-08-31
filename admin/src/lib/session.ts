import { cache } from "react";
import { cookies } from "next/headers";
import { getAdminAuth, getDb } from "@/lib/firebase";

/**
 * Name of the httpOnly session cookie. `__session` is the one cookie name
 * every common Next.js host (Netlify included) forwards to SSR / route
 * handlers by default, so it's the safe choice for a Firebase session cookie.
 */
export const SESSION_COOKIE_NAME = "__session";

/** 5 days — well under Firebase's 14-day session-cookie ceiling. */
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

export interface AdminSession {
  uid: string;
  email: string | null;
  name: string | null;
}

/**
 * Verifies the request's Firebase session cookie and confirms the user is
 * still listed in `authorizedUsers/{uid}`. Returns null (never throws) when
 * there's no cookie, it's invalid/expired/revoked, or the user isn't
 * authorized. Wrapped in React `cache` so a single request that checks the
 * session in both the page and a nested component only does the work once.
 */
export const verifySession = cache(async (): Promise<AdminSession | null> => {
  const cookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return null;

  try {
    // checkRevoked: true also rejects the cookie right after a sign-out /
    // token revocation, not just on expiry.
    const decoded = await getAdminAuth().verifySessionCookie(cookie, true);
    const authorized = await getDb().collection("authorizedUsers").doc(decoded.uid).get();
    if (!authorized.exists) return null;

    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: (decoded.name as string | undefined) ?? null,
    };
  } catch {
    return null;
  }
});
