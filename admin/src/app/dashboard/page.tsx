import { notFound } from "next/navigation";
import { isValidAdminToken } from "@/server/adminAuth";
import { mintAdminCustomToken } from "@/server/customToken";
import DashboardClient from "./DashboardClient";

// The student/course list is live via Firestore listeners client-side, but
// the page itself must never be statically cached — a cached page would
// serve a stale (or previously revoked) custom token.
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // Fail closed and indistinguishably from a missing route, matching
  // consent/admin: a wrong or missing token gets the same 404 as any
  // unknown path, revealing nothing.
  if (!isValidAdminToken(token)) {
    notFound();
  }

  const customToken = await mintAdminCustomToken();

  return <DashboardClient customToken={customToken} />;
}
