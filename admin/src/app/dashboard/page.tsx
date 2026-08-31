import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import DashboardClient from "./DashboardClient";

// Reads the session cookie, so it can never be statically cached.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await verifySession();
  if (!session) {
    redirect("/login?next=/dashboard");
  }

  return <DashboardClient />;
}
