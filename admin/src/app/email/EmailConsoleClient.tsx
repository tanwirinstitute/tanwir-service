"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import SignOutButton from "../SignOutButton";
import RichTextEditor from "./RichTextEditor";
import type { CourseCatalogEntry, SectionCatalogEntry } from "@/server/recipients";

interface Recipient {
  email: string;
  name: string | null;
}

interface RecipientResult {
  email: string;
  success: boolean;
  error?: string;
}

type AudienceType = "all" | "course" | "section";
type SendPhase = "idle" | "confirming" | "sending" | "done";
type TestStatus = "idle" | "sending" | "sent" | "error";

interface Progress {
  total: number;
  sent: number;
  failed: number;
  failures: RecipientResult[];
}

const BATCH_SIZE = 25;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

interface Props {
  adminEmail: string | null;
  courses: CourseCatalogEntry[];
  sections: SectionCatalogEntry[];
}

export default function EmailConsoleClient({ adminEmail, courses, sections }: Props) {
  const [audienceType, setAudienceType] = useState<AudienceType>("all");
  const [courseId, setCourseId] = useState(courses[0]?.productId ?? "");
  const [sectionKey, setSectionKey] = useState(sections[0] ? `${sections[0].academicYear}__${sections[0].semester}` : "");

  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");

  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState<string | null>(null);

  const [sendPhase, setSendPhase] = useState<SendPhase>("idle");
  const [pendingRecipients, setPendingRecipients] = useState<Recipient[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audienceLabel = useMemo(() => {
    if (audienceType === "all") return "All students";
    if (audienceType === "course") {
      return courses.find((c) => c.productId === courseId)?.productName ?? "(select a course)";
    }
    const [academicYear, semester] = sectionKey.split("__");
    return semester && academicYear ? `${semester} ${academicYear}` : "(select a section)";
  }, [audienceType, courseId, courses, sectionKey]);

  const canCompose = subject.trim().length > 0 && bodyHtml.trim().length > 0;

  const buildAudience = useCallback(() => {
    if (audienceType === "all") return { type: "all" as const };
    if (audienceType === "course") return { type: "course" as const, productId: courseId };
    const [academicYear, semester] = sectionKey.split("__");
    return { type: "section" as const, academicYear, semester };
  }, [audienceType, courseId, sectionKey]);

  const sendTest = useCallback(async () => {
    setTestStatus("sending");
    setTestError(null);
    try {
      const res = await fetch("/api/email/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, bodyHtml }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || `Request failed (${res.status})`);
      }
      setTestStatus("sent");
    } catch (err) {
      setTestStatus("error");
      setTestError((err as Error).message);
    }
  }, [subject, bodyHtml]);

  const startBlast = useCallback(async () => {
    setError(null);
    setSendPhase("sending");
    try {
      const res = await fetch("/api/email/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience: buildAudience() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || `Request failed (${res.status})`);
      }
      const recipients = data.recipients as Recipient[];
      if (recipients.length === 0) {
        throw new Error("No students match this audience — nothing to send.");
      }
      setPendingRecipients(recipients);
      setSendPhase("confirming");
    } catch (err) {
      setError((err as Error).message);
      setSendPhase("idle");
    }
  }, [buildAudience]);

  const confirmBlast = useCallback(async () => {
    setSendPhase("sending");
    const batches = chunk(pendingRecipients, BATCH_SIZE);
    const runningProgress: Progress = { total: pendingRecipients.length, sent: 0, failed: 0, failures: [] };
    setProgress({ ...runningProgress });

    for (const batch of batches) {
      try {
        const res = await fetch("/api/email/send-blast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject, bodyHtml, recipients: batch }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || `Request failed (${res.status})`);
        }
        runningProgress.sent += data.sent;
        runningProgress.failed += data.failed;
        runningProgress.failures.push(...(data.results as RecipientResult[]).filter((r) => !r.success));
      } catch (err) {
        // The whole batch failed before per-recipient results came back
        // (e.g. the request itself errored) — count every recipient in it
        // as failed so the total always adds up.
        runningProgress.failed += batch.length;
        runningProgress.failures.push(...batch.map((r) => ({ email: r.email, success: false, error: (err as Error).message })));
      }
      setProgress({ ...runningProgress });
    }

    setSendPhase("done");
  }, [pendingRecipients, subject, bodyHtml]);

  const startOver = useCallback(() => {
    setSendPhase("idle");
    setPendingRecipients([]);
    setProgress(null);
    setSubject("");
    setBodyHtml("");
    setTestStatus("idle");
    setTestError(null);
  }, []);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Link href="/" className="brand brand-link">
          <Image src="/logo.webp" alt="Tanwir Institute" width={37} height={40} className="brand-logo" priority />
          <div>
            <h1>Email Console</h1>
            <p className="dashboard-subtitle">Compose and send email to students</p>
          </div>
        </Link>
        <SignOutButton />
      </header>

      {sendPhase === "done" && progress ? (
        <div className="ec-panel ec-summary">
          <h2>Send complete</h2>
          <p>
            {progress.sent} of {progress.total} sent successfully
            {progress.failed > 0 ? `, ${progress.failed} failed` : ""}.
          </p>
          {progress.failures.length > 0 && (
            <div className="ec-failures">
              <p className="ec-failures-title">Failed:</p>
              <ul>
                {progress.failures.map((f) => (
                  <li key={f.email}>
                    {f.email}
                    {f.error ? ` — ${f.error}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" className="ec-btn ec-btn-primary" onClick={startOver}>
            Compose another email
          </button>
        </div>
      ) : (
        <div className="ec-layout">
          <div className="ec-panel">
            <div className="ec-field">
              <label className="ec-label">Audience</label>
              <div className="segmented">
                <button type="button" className={audienceType === "all" ? "segmented-btn active" : "segmented-btn"} onClick={() => setAudienceType("all")}>
                  All students
                </button>
                <button type="button" className={audienceType === "course" ? "segmented-btn active" : "segmented-btn"} onClick={() => setAudienceType("course")}>
                  Course
                </button>
                <button type="button" className={audienceType === "section" ? "segmented-btn active" : "segmented-btn"} onClick={() => setAudienceType("section")}>
                  Section
                </button>
              </div>
            </div>

            {audienceType === "course" && (
              <div className="ec-field">
                <label className="ec-label" htmlFor="ec-course">
                  Course
                </label>
                <select id="ec-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                  {courses.length === 0 && <option value="">No courses found</option>}
                  {courses.map((c) => (
                    <option key={c.productId} value={c.productId}>
                      {c.productName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {audienceType === "section" && (
              <div className="ec-field">
                <label className="ec-label" htmlFor="ec-section">
                  Section (semester + academic year)
                </label>
                <select id="ec-section" value={sectionKey} onChange={(e) => setSectionKey(e.target.value)}>
                  {sections.length === 0 && <option value="">No sections found</option>}
                  {sections.map((s) => {
                    const key = `${s.academicYear}__${s.semester}`;
                    return (
                      <option key={key} value={key}>
                        {s.semester} {s.academicYear}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            <div className="ec-field">
              <label className="ec-label" htmlFor="ec-subject">
                Subject
              </label>
              <input
                id="ec-subject"
                className="search-input ec-subject-input"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject line"
              />
            </div>

            <div className="ec-field">
              <label className="ec-label">Message</label>
              <RichTextEditor onChange={setBodyHtml} />
              <p className="ec-hint">Use the name tag to insert each recipient&apos;s first/last name where you want a personalized greeting.</p>
            </div>

            {error && <p className="ec-error">{error}</p>}

            <div className="ec-actions">
              <div className="ec-test-action">
                <button type="button" className="ec-btn" disabled={!canCompose || testStatus === "sending"} onClick={sendTest}>
                  {testStatus === "sending" ? "Sending test…" : "Send test to myself"}
                </button>
                {testStatus === "sent" && <span className="ec-test-status ec-test-ok">Sent to {adminEmail}</span>}
                {testStatus === "error" && <span className="ec-test-status ec-test-fail">{testError}</span>}
              </div>

              <button
                type="button"
                className="ec-btn ec-btn-primary"
                disabled={!canCompose || sendPhase === "sending" || (audienceType === "course" && !courseId) || (audienceType === "section" && !sectionKey)}
                onClick={startBlast}
              >
                {sendPhase === "sending" && !progress ? "Resolving recipients…" : `Send to ${audienceLabel}`}
              </button>
            </div>
          </div>

          <div className="ec-panel ec-preview">
            <p className="ec-label">Preview</p>
            <div className="ec-preview-card">
              <p className="ec-preview-subject">{subject || "(no subject)"}</p>
              <div className="ec-preview-logo">
                <Image src="/logo.webp" alt="Tanwir Institute" width={37} height={40} />
              </div>
              <div className="ec-preview-body" dangerouslySetInnerHTML={{ __html: bodyHtml || "<p><em>Start writing to see a preview…</em></p>" }} />
            </div>
          </div>
        </div>
      )}

      {sendPhase === "confirming" && (
        <div className="ec-modal-backdrop">
          <div className="ec-modal">
            <h2>Send to {pendingRecipients.length} students?</h2>
            <p>
              Audience: <strong>{audienceLabel}</strong>. This sends a real email to every recipient and can&apos;t be undone.
            </p>
            <div className="ec-modal-actions">
              <button type="button" className="ec-btn" onClick={() => setSendPhase("idle")}>
                Cancel
              </button>
              <button type="button" className="ec-btn ec-btn-primary" onClick={confirmBlast}>
                Send now
              </button>
            </div>
          </div>
        </div>
      )}

      {sendPhase === "sending" && progress && (
        <div className="ec-modal-backdrop">
          <div className="ec-modal">
            <h2>Sending…</h2>
            <div className="ec-progress-bar">
              <div className="ec-progress-fill" style={{ width: `${((progress.sent + progress.failed) / progress.total) * 100}%` }} />
            </div>
            <p>
              {progress.sent + progress.failed} of {progress.total} processed ({progress.sent} sent
              {progress.failed > 0 ? `, ${progress.failed} failed` : ""})
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
