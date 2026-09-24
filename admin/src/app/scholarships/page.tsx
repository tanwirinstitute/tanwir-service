import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import ScholarshipsClient from "./ScholarshipsClient";

// Reads the session cookie, so it can never be statically cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tanwir Institute - Scholarships",
  description: "Financial aid applications and Zakat-funded award tracking",
};

export default async function ScholarshipsPage() {
  const session = await verifySession();
  if (!session) {
    redirect("/login?next=/scholarships");
  }

  return <ScholarshipsClient />;
}
