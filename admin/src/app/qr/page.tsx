import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import QrConsoleClient from "./QrConsoleClient";

// Reads the session cookie, so it can never be statically cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tanwir Institute - QR Codes",
  description: "Generate branded QR codes with editable destinations",
};

export default async function QrConsolePage() {
  const session = await verifySession();
  if (!session) {
    redirect("/login?next=/qr");
  }

  return <QrConsoleClient />;
}
