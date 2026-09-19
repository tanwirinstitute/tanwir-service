import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import ContactsClient from "./ContactsClient";

// Reads the session cookie, so it can never be statically cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tanwir Institute - Contacts",
  description: "Consolidated contact warehouse across every source system",
};

export default async function ContactsPage() {
  const session = await verifySession();
  if (!session) {
    redirect("/login?next=/contacts");
  }

  return <ContactsClient />;
}
