import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import { findLapsedPaymentPlans, type LapsedPlansReport } from "@/server/lapsedPlans";
import LapsedPlansClient from "./LapsedPlansClient";

// Reads the session cookie, so it can never be statically cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tanwir Institute - Lapsed Payment Plans",
  description: "Students whose payment plan stopped before the course was paid off",
};

/**
 * Rendered on the server rather than from Firestore like the other modules:
 * courseSync only stores an enrollment's first installment, so the full
 * payment history has to come live from the Squarespace Orders API.
 */
export default async function LapsedPlansPage() {
  const session = await verifySession();
  if (!session) {
    redirect("/login?next=/lapsed-plans");
  }

  let report: LapsedPlansReport | null = null;
  let error: string | null = null;
  try {
    report = await findLapsedPaymentPlans();
  } catch (err) {
    console.error("Failed to build lapsed payment plans report:", err);
    error = (err as Error).message;
  }

  return <LapsedPlansClient report={report} error={error} />;
}
