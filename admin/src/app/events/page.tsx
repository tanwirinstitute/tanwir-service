import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import EventsClient from "./EventsClient";

// Reads the session cookie, so it can never be statically cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tanwir Institute - Event Registration",
  description: "Registrants for Tanwir events",
};

export default async function EventsPage() {
  const session = await verifySession();
  if (!session) {
    redirect("/login?next=/events");
  }

  return <EventsClient />;
}
