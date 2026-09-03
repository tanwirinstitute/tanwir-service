import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import { getCourseCatalog, getSectionCatalog } from "@/server/recipients";
import EmailConsoleClient from "./EmailConsoleClient";

// Reads the session cookie, so it can never be statically cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tanwir Institute - Email Console",
  description: "Compose and send email to students",
};

export default async function EmailConsolePage() {
  const session = await verifySession();
  if (!session) {
    redirect("/login?next=/email");
  }

  const [courses, sections] = await Promise.all([getCourseCatalog(), getSectionCatalog()]);

  return <EmailConsoleClient adminEmail={session.email} courses={courses} sections={sections} />;
}
