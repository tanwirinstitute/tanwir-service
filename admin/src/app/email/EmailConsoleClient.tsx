"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type AudienceType = "all" | "course";
type SendPhase = "idle" | "confirming" | "sending" | "done";
type TestStatus = "idle" | "sending" | "sent" | "error";

interface Progress {
  total: number;
  sent: number;
  failed: number;
  failures: RecipientResult[];
}

interface Audience {
  type: AudienceType;
  productNames?: string[];
  academicYear?: string;
  semester?: string;
}

const BATCH_SIZE = 25;
const PREVIEW_DEBOUNCE_MS = 350;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Courses are grouped by (term-stripped name, academic year) — see
 * recipients.ts's normalizeCourseName — so "Foo - Fall Session" and "Foo -
 * Full Year" collapse into one "Foo — 2026-2027" entry instead of showing
 * as separate, confusingly similar options.
 */
function courseLabel(course: CourseCatalogEntry): string {
  return `${course.displayName} — ${course.academicYear}`;
}

interface Props {
  adminEmail: string | null;
  courses: CourseCatalogEntry[];
  sections: SectionCatalogEntry[];
}

export default function EmailConsoleClient({ adminEmail, courses, sections }: Props) {
  const [audienceType, setAudienceType] = useState<AudienceType>("all");
  const [courseId, setCourseId] = useState("");
  const [sectionKey, setSectionKey] = useState("");

  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");

  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState<string | null>(null);

  const [sendPhase, setSendPhase] = useState<SendPhase>("idle");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [previewRecipients, setPreviewRecipients] = useState<Recipient[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const hasAudienceSelection = audienceType === "all" || Boolean(courseId) || Boolean(sectionKey);

  // Course and term are mutually exclusive, not composed: a course selection
  // already pins a specific (name, year) group on its own (see
  // recipients.ts), so layering an independently-picked term on top could
  // silently contradict it (e.g. a course's own 2026-2027 vs a term select
  // still showing 2025-2026) and resolve to nothing. Picking one clears the
  // other — see the onChange handlers below.
  const buildAudience = useCallback((): Audience => {
    if (audienceType === "all") return { type: "all" };
    if (courseId) {
      const course = courses.find((c) => c.key === courseId);
      return { type: "course", productNames: course?.productNames, academicYear: course?.academicYear };
    }
    const [academicYear, semester] = sectionKey ? sectionKey.split("__") : [undefined, undefined];
    return { type: "course", academicYear, semester };
  }, [audienceType, courseId, courses, sectionKey]);

  const audienceLabel = useMemo(() => {
    if (audienceType === "all") return "All students";
    const course = courses.find((c) => c.key === courseId);
    if (course) return `${course.displayName} — ${course.academicYear}`;
    const [academicYear, semester] = sectionKey ? sectionKey.split("__") : [undefined, undefined];
    return academicYear && semester ? `${semester} ${academicYear}` : "(choose a course or term)";
  }, [audienceType, courseId, courses, sectionKey]);

  const canCompose = subject.trim().length > 0 && bodyHtml.trim().length > 0;

  // Live recipients "peek" — refetches (debounced) whenever the audience
  // selection changes, so you can see exactly who a send would reach before
  // touching the send button.
  useEffect(() => {
    if (!hasAudienceSelection) {
      setPreviewRecipients(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);

    const timeout = setTimeout(async () => {
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
        if (!cancelled) setPreviewRecipients(data.recipients as Recipient[]);
      } catch (err) {
        if (!cancelled) {
          setPreviewError((err as Error).message);
          setPreviewRecipients(null);
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [hasAudienceSelection, buildAudience]);

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

  const startBlast = useCallback(() => {
    setError(null);
    if (!previewRecipients || previewRecipients.length === 0) {
      setError("No students match this audience — nothing to send.");
      return;
    }
    setSendPhase("confirming");
  }, [previewRecipients]);

  const confirmBlast = useCallback(async () => {
    const recipients = previewRecipients ?? [];
    setSendPhase("sending");
    const batches = chunk(recipients, BATCH_SIZE);
    const runningProgress: Progress = { total: recipients.length, sent: 0, failed: 0, failures: [] };
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
  }, [previewRecipients, subject, bodyHtml]);

  const startOver = useCallback(() => {
    setSendPhase("idle");
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
                <button
                  type="button"
                  className={audienceType === "all" ? "segmented-btn active" : "segmented-btn"}
                  onClick={() => setAudienceType("all")}
                >
                  All students
                </button>
                <button
                  type="button"
                  className={audienceType === "course" ? "segmented-btn active" : "segmented-btn"}
                  onClick={() => setAudienceType("course")}
                >
                  Course / term
                </button>
              </div>
            </div>

            {audienceType === "course" && (
              <>
                <div className="ec-field">
                  <label className="ec-label" htmlFor="ec-course">
                    Course
                  </label>
                  <select
                    id="ec-course"
                    value={courseId}
                    onChange={(e) => {
                      setCourseId(e.target.value);
                      if (e.target.value) setSectionKey("");
                    }}
                  >
                    <option value="">All courses</option>
                    {courses.map((c) => (
                      <option key={c.key} value={c.key}>
                        {courseLabel(c)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="ec-field">
                  <label className="ec-label" htmlFor="ec-section">
                    Term
                  </label>
                  <select
                    id="ec-section"
                    value={sectionKey}
                    disabled={Boolean(courseId)}
                    onChange={(e) => {
                      setSectionKey(e.target.value);
                      if (e.target.value) setCourseId("");
                    }}
                  >
                    <option value="">All terms</option>
                    {sections.map((s) => {
                      const key = `${s.academicYear}__${s.semester}`;
                      return (
                        <option key={key} value={key}>
                          {s.semester} {s.academicYear}
                        </option>
                      );
                    })}
                  </select>
                  <p className="ec-hint">Pick a course (a specific year) or a term (any course, that semester) — picking one clears the other.</p>
                </div>
              </>
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
                disabled={!canCompose || !hasAudienceSelection || previewLoading || !previewRecipients || previewRecipients.length === 0}
                onClick={startBlast}
              >
                {previewLoading ? "Resolving recipients…" : `Send to ${audienceLabel}`}
              </button>
            </div>
          </div>

          <div className="ec-side">
            <div className="ec-panel ec-recipients">
              <p className="ec-label">Recipients</p>
              {!hasAudienceSelection && <p className="ec-hint">Choose a course or term to see who this would reach.</p>}
              {hasAudienceSelection && previewLoading && <p className="ec-hint">Resolving recipients…</p>}
              {hasAudienceSelection && previewError && <p className="ec-error">{previewError}</p>}
              {hasAudienceSelection && !previewLoading && !previewError && previewRecipients && (
                <>
                  <p className="ec-recipients-count">
                    {previewRecipients.length} recipient{previewRecipients.length === 1 ? "" : "s"}
                  </p>
                  {previewRecipients.length > 0 && (
                    <ul className="ec-recipients-list">
                      {previewRecipients
                        .slice()
                        .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
                        .map((r) => (
                          <li key={r.email}>
                            {r.name ? <span className="ec-recipient-name">{r.name}</span> : null}
                            <span className="ec-recipient-email">{r.email}</span>
                          </li>
                        ))}
                    </ul>
                  )}
                </>
              )}
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
        </div>
      )}

      {sendPhase === "confirming" && (
        <div className="ec-modal-backdrop">
          <div className="ec-modal">
            <h2>Send to {previewRecipients?.length ?? 0} students?</h2>
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
