import { notFound } from "next/navigation";
import { getScholarshipSnapshot } from "@/server/consent";
import type { ScholarshipDocument } from "@/types/scholarship";
import Letterhead from "@/components/Letterhead";
import ConfirmButton from "./confirm-button";

export default async function ConsentPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const { docId } = await params;
  const snapshot = await getScholarshipSnapshot(docId);

  if (!snapshot.exists) {
    notFound();
  }

  const data = snapshot.data() as ScholarshipDocument;
  const firstName = data.firstName || "there";

  if (data.consented === true) {
    return (
      <main className="page-shell">
        <div className="document">
          <div className="document-card">
            <Letterhead title="Consent Already Recorded" />
            <div className="message-body">
              <p>
                Thank you, {firstName} — we already have your confirmed consent on file for the{" "}
                {data.course}. No further action is needed.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="document">
        <div className="document-card">
          <Letterhead
            title="Zakat Scholarship Consent Agreement"
            subtitle={`Prepared for ${firstName} — ${data.course}`}
          />

          <p className="preamble">
            Please read the following agreement carefully. It explains how your Zakat-funded
            scholarship will be administered and what happens once you consent.
          </p>

          <ol className="clauses">
            <li>
              <h2 className="clause-title">Purpose of This Agreement</h2>
              <p className="clause-body">
                This agreement confirms your participation in the Tanwir Institute Zakat-funded
                scholarship for the <strong>{data.course}</strong>. By consenting below, you
                authorize Tanwir Institute to receive Zakat funds on your behalf and apply them
                toward your tuition.
              </p>
            </li>

            <li>
              <h2 className="clause-title">Appointment of Zakat Custodian</h2>
              <p className="clause-body">
                You authorize <strong>Salim Ajmeri</strong>, acting as the designated Zakat
                custodian for Tanwir Institute, to accept Zakat funds on your behalf and to
                facilitate their disbursement toward your enrollment. This appointment is limited
                to administering your scholarship and does not extend to any other matter.
              </p>
            </li>

            <li>
              <h2 className="clause-title">What Happens After You Consent</h2>
              <p className="clause-body">
                Once you confirm below, you will automatically receive a follow-up email
                containing a partial or full tuition credit code. Use this code to complete your
                registration online.
              </p>
            </li>

            <li>
              <h2 className="clause-title">A Shared Responsibility</h2>
              <p className="clause-body">
                In Islam, assisting those in need is regarded as a communal duty and an act of
                worship — a trust, or <strong>amanah</strong>, that ultimately rests between each
                of us and Allah.
              </p>
            </li>
          </ol>

          <blockquote className="hadith">
            <p>
              &ldquo;Whoever relieves a believer&rsquo;s hardship in this world, Allah will
              relieve his hardship on the Day of Judgment.&rdquo;
            </p>
            <cite>— Prophet Muhammad ﷺ, Sahih Muslim</cite>
          </blockquote>

          <div className="consent-action">
            <ConfirmButton docId={docId} />
          </div>
        </div>
      </div>
    </main>
  );
}
