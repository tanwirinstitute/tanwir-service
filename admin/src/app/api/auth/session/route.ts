import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminAuth, getDb } from "@/lib/firebase";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from "@/lib/session";

/**
 * POST { idToken } — called by the login page right after a Google popup
 * sign-in. Verifies the ID token, confirms the uid is in authorizedUsers/,
 * then mints a Firebase session cookie and sets it httpOnly. DELETE clears it
 * (sign out). The dashboard's actual data access is enforced by
 * firestore.rules; this cookie only gates the server-rendered /dashboard page.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const idToken = body?.idToken;
  if (typeof idToken !== "string" || !idToken) {
    return NextResponse.json({ error: "missing_id_token" }, { status: 400 });
  }

  let uid: string;
  try {
    // Session-cookie minting already requires a token minted in the last 5
    // minutes; checkRevoked catches a token revoked in that window too.
    ({ uid } = await getAdminAuth().verifyIdToken(idToken, true));
  } catch {
    return NextResponse.json({ error: "invalid_id_token" }, { status: 401 });
  }

  const authorized = await getDb().collection("authorizedUsers").doc(uid).get();
  if (!authorized.exists) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  let sessionCookie: string;
  try {
    sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    });
  } catch {
    return NextResponse.json({ error: "session_failed" }, { status: 401 });
  }

  (await cookies()).set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  (await cookies()).delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
