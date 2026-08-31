"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getClientAuth } from "@/lib/firebaseClient";

/** Only allow same-origin relative paths as a post-login destination. */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      const cred = await signInWithPopup(getClientAuth(), provider);
      const idToken = await cred.user.getIdToken();

      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        await signOut(getClientAuth());
        setError(
          body.error === "not_authorized"
            ? "That account isn't authorized for the admin dashboard."
            : "Sign-in failed. Please try again."
        );
        return;
      }

      router.replace(next);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        // User dismissed the popup — not an error worth showing.
        return;
      }
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <div className="login-card">
        <Image src="/logo.webp" alt="Tanwir Institute" width={46} height={50} className="brand-logo" priority />
        <h1>Tanwir Admin</h1>
        <p>Sign in with your authorized Google account.</p>

        <button type="button" className="login-btn" onClick={signIn} disabled={busy}>
          {busy ? "Signing in…" : "Sign in with Google"}
        </button>

        {error && <p className="login-error">{error}</p>}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="login-shell" />}>
      <LoginForm />
    </Suspense>
  );
}
