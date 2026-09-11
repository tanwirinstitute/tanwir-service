import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { trace } from "@opentelemetry/api";
import { getAdminAuth, getDb } from "@/lib/firebase";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from "@/lib/session";
import { loginCounter } from "@/lib/telemetry";

function tagSpanWithUser(uid: string, email: string | undefined) {
  const span = trace.getActiveSpan();
  span?.setAttribute("enduser.id", uid);
  if (email) span?.setAttribute("enduser.email", email);
}

/**
 * POST { idToken } — called by the login page right after a Google popup
 * sign-in. Verifies the ID token, confirms the uid is in authorizedUsers/,
 * then mints a Firebase session cookie and sets it httpOnly. DELETE clears it
 * (sign out). The dashboard's actual data access is enforced by
 * firestore.rules; this cookie only gates the server-rendered /dashboard page.
 *
 * Every attempt is recorded on `admin.login` (outcome-tagged, so it stays a
 * dashboard-friendly counter) and, on success, `enduser.id`/`enduser.email`
 * are set on the request span so "who logged in and when" is answerable from
 * Grafana traces for this route.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const idToken = body?.idToken;
  if (typeof idToken !== "string" || !idToken) {
    loginCounter.add(1, { outcome: "missing_id_token" });
    return NextResponse.json({ error: "missing_id_token" }, { status: 400 });
  }

  let uid: string;
  let email: string | undefined;
  try {
    // Session-cookie minting already requires a token minted in the last 5
    // minutes; checkRevoked catches a token revoked in that window too.
    ({ uid, email } = await getAdminAuth().verifyIdToken(idToken, true));
  } catch {
    loginCounter.add(1, { outcome: "invalid_id_token" });
    return NextResponse.json({ error: "invalid_id_token" }, { status: 401 });
  }

  const authorized = await getDb().collection("authorizedUsers").doc(uid).get();
  if (!authorized.exists) {
    loginCounter.add(1, { outcome: "not_authorized" });
    tagSpanWithUser(uid, email);
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  let sessionCookie: string;
  try {
    sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    });
  } catch {
    loginCounter.add(1, { outcome: "session_failed" });
    return NextResponse.json({ error: "session_failed" }, { status: 401 });
  }

  (await cookies()).set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  });

  loginCounter.add(1, { outcome: "success" });
  tagSpanWithUser(uid, email);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (session) {
    try {
      const { uid } = await getAdminAuth().verifySessionCookie(session);
      trace.getActiveSpan()?.setAttribute("enduser.id", uid);
    } catch {
      // Cookie already invalid/expired — nothing to attribute, just clear it below.
    }
  }
  (await cookies()).delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
