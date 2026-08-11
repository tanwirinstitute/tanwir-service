import { notFound } from "next/navigation";
import Letterhead from "@/components/Letterhead";
import { isValidAdminToken } from "@/server/adminAuth";
import { getPendingZakatApplicants } from "@/server/zakat";
import PendingApplicants from "./pending-applicants";

// Applicant data is live in Firestore, so never cache this page.
export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // Fail closed and indistinguishably from a missing route: a wrong or missing
  // token gets the same 404 as any unknown path, revealing nothing.
  if (!isValidAdminToken(token)) {
    notFound();
  }

  const applicants = await getPendingZakatApplicants();

  return (
    <main className="page-shell admin-shell">
      <div className="admin-panel">
        <div className="document-card">
          <Letterhead
            title="Pending Zakat Applicants"
            subtitle="Applicants who opted into Zakat funding but haven't been sent a consent email yet"
          />

          <PendingApplicants applicants={applicants} token={token!} />
        </div>
      </div>
    </main>
  );
}
