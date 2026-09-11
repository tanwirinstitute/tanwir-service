"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { faro } from "@grafana/faro-web-sdk";
import { getClientAuth } from "@/lib/firebaseClient";

export default function SignOutButton({ className = "signout-btn" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(async () => {
    setBusy(true);
    // Best-effort clear of the httpOnly cookie, then the client session.
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    await signOut(getClientAuth()).catch(() => {});
    try {
      faro?.api?.resetUser();
    } catch {
      // faro not initialized (no collector URL) — nothing to clear.
    }
    router.replace("/login");
  }, [router]);

  return (
    <button type="button" className={className} onClick={onClick} disabled={busy}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
