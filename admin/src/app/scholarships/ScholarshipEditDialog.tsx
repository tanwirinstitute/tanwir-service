"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteField, doc, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { getClientDb } from "@/lib/firebaseClient";
import {
  isOnOrAfterCutoff,
  normalizeConsented,
  normalizeStatus,
  normalizeZakat,
  CONSENTED_CANONICAL_VALUE,
  SCHOLARSHIP_CUTOFF_ISO,
} from "@/lib/scholarshipMatching";
import type { ScholarshipRecord } from "@/types/scholarship";

type ScholarshipWithId = ScholarshipRecord & { id: string };

/**
 * The free-text fields the committee can edit, all handled identically: the
 * input holds a string, and an emptied input is written back as `null` to
 * match how absent values already look on these records.
 *
 * Deliberately excluded: `form` and `submittedAt` (provenance from the
 * Squarespace form — shown read-only in the header instead), `consentedAt`
 * (follows the consent control below), and `consentEmailSentAt` (written by
 * the mailer, not a human).
 */
const TEXT_KEYS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "age",
  "gender",
  "employment",
  "details",
  "course",
  "need",
  "reviewedBy",
  "reason",
  "interest",
  "comments",
] as const;

type TextKey = (typeof TEXT_KEYS)[number];

interface FormState {
  text: Record<TextKey, string>;
  status: "" | "approved" | "denied";
  zakat: "" | "Yes" | "No";
  consent: "recorded" | "not-recorded";
  /** `yyyy-mm-dd`, or "" for no review date on file. */
  reviewDate: string;
}

function dateInputValue(value: unknown): string {
  if (!(value instanceof Timestamp)) return "";
  const date = value.toDate();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Reads the date input back as *local* midnight — the same frame the table
 * renders it in, so a saved day never shows back a day off for anyone west
 * of UTC.
 */
function dateInputToTimestamp(value: string): Timestamp | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return Timestamp.fromDate(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatDate(value: unknown): string | null {
  if (!(value instanceof Timestamp)) return null;
  return value.toDate().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function initialForm(record: ScholarshipWithId): FormState {
  const text = {} as Record<TextKey, string>;
  for (const key of TEXT_KEYS) {
    text[key] = record[key] ?? "";
  }

  const status = normalizeStatus(record.status);
  const zakat = normalizeZakat(record.zakat);

  return {
    text,
    // Seeded from the normalized reading, not the raw string, since that's
    // the only thing a fixed set of options can represent. The save below
    // diffs against these same normalized values, so a record already
    // storing "Approved" isn't rewritten to "approved" just by being opened.
    status: status === "unknown" ? "" : status,
    zakat: zakat === "unknown" ? "" : zakat === "yes" ? "Yes" : "No",
    consent: normalizeConsented(record.consented) === "yes" ? "recorded" : "not-recorded",
    reviewDate: dateInputValue(record.reviewDate),
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ScholarshipEditDialog({
  record,
  onClose,
}: {
  record: ScholarshipWithId;
  onClose: () => void;
}) {
  const initial = useMemo(() => initialForm(record), [record]);
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  // Escape and backdrop clicks discard, so when there's something to lose
  // they ask first rather than throwing away a half-written comment.
  const requestClose = useCallback(() => {
    if (saving) return;
    if (dirty) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  }, [dirty, onClose, saving]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        requestClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  const setText = (key: TextKey, value: string) =>
    setForm((prev) => ({ ...prev, text: { ...prev.text, [key]: value } }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    const email = form.text.email.trim();
    if (email !== initial.text.email.trim() && email !== "" && !EMAIL_PATTERN.test(email)) {
      setError("That doesn't look like an email address. Fix it or clear the field.");
      return;
    }
    if (form.reviewDate !== "" && dateInputToTimestamp(form.reviewDate) === null) {
      setError("Enter the review date as a full date, or clear it.");
      return;
    }

    // Only changed fields go in the write. This collection is maintained
    // outside this codebase, so a save touches exactly what was edited and
    // leaves every other field — including ones this form doesn't show — as
    // whoever wrote them left them.
    const payload: Record<string, unknown> = {};

    for (const key of TEXT_KEYS) {
      const next = form.text[key].trim();
      if (next === initial.text[key].trim()) continue;
      payload[key] = next === "" ? null : next;
    }

    if (form.status !== initial.status) {
      payload.status = form.status === "" ? null : form.status;
    }
    if (form.zakat !== initial.zakat) {
      payload.zakat = form.zakat === "" ? null : form.zakat;
    }
    if (form.reviewDate !== initial.reviewDate) {
      payload.reviewDate = form.reviewDate === "" ? null : dateInputToTimestamp(form.reviewDate);
    }
    if (form.consent !== initial.consent) {
      if (form.consent === "recorded") {
        payload.consented = CONSENTED_CANONICAL_VALUE;
        // Don't overwrite a consent time that's already on the record — only
        // stamp one when consent is being recorded here for the first time.
        if (record.consentedAt == null) {
          payload.consentedAt = serverTimestamp();
        }
      } else {
        // `consented` is only ever written when consent was actually given —
        // "not recorded" is the *absence* of the field, not a negative value
        // (see @/types/scholarship) — so withdrawing it removes both fields
        // rather than writing a "No" no other record carries.
        payload.consented = deleteField();
        payload.consentedAt = deleteField();
      }
    }

    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateDoc(doc(getClientDb(), "scholarships", record.id), payload);
      // The page's onSnapshot listener pushes the new values into the table.
      onClose();
    } catch (cause) {
      console.error(`Failed to save scholarship ${record.id}:`, cause);
      const code = (cause as { code?: string })?.code;
      setError(
        code === "permission-denied"
          ? "Your account isn't allowed to edit scholarship records."
          : cause instanceof Error
            ? cause.message
            : "Couldn't save those changes."
      );
      setSaving(false);
    }
  }

  const renderText = (
    key: TextKey,
    label: string,
    options: { hint?: string; wide?: boolean; type?: string; autoFocus?: boolean } = {}
  ) => (
    <div className={options.wide ? "sch-field sch-field-wide" : "sch-field"}>
      <label className="ec-label" htmlFor={`sch-${key}`}>
        {label}
      </label>
      <input
        id={`sch-${key}`}
        className="sch-input"
        type={options.type ?? "text"}
        value={form.text[key]}
        autoFocus={options.autoFocus}
        onChange={(event) => setText(key, event.target.value)}
      />
      {options.hint && <p className="ec-hint">{options.hint}</p>}
    </div>
  );

  const renderTextarea = (key: TextKey, label: string) => (
    <div className="sch-field sch-field-wide">
      <label className="ec-label" htmlFor={`sch-${key}`}>
        {label}
      </label>
      <textarea
        id={`sch-${key}`}
        className="sch-input sch-textarea"
        rows={3}
        value={form.text[key]}
        onChange={(event) => setText(key, event.target.value)}
      />
    </div>
  );

  const submitted = formatDate(record.submittedAt);
  // Names the record from how it looked when it was opened, so the heading
  // doesn't shift around while the name fields themselves are being edited.
  const openedAs = [record.firstName, record.lastName].filter(Boolean).join(" ") || record.email;
  const provenance = [openedAs, record.form, submitted && `submitted ${submitted}`].filter(Boolean).join(" · ");
  const reviewOutOfScope =
    form.reviewDate !== "" && !isOnOrAfterCutoff(dateInputToTimestamp(form.reviewDate)?.toMillis() ?? null);
  const cutoffLabel = new Date(Date.parse(SCHOLARSHIP_CUTOFF_ISO)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      className="ec-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className="sch-dialog" role="dialog" aria-modal="true" aria-labelledby="sch-dialog-title">
        {/* Validated in handleSubmit instead: the input types are here for the
            right mobile keyboard, not to have the browser refuse a save over
            data that arrived malformed from the form feed. */}
        <form onSubmit={handleSubmit} noValidate>
          <header className="sch-dialog-head">
            <div>
              <h2 id="sch-dialog-title">Edit application</h2>
              {provenance && <p className="sch-dialog-meta">{provenance}</p>}
            </div>
            <button type="button" className="sch-dialog-close" onClick={requestClose} aria-label="Close">
              ×
            </button>
          </header>

          <div className="sch-dialog-body">
            {error && <p className="ec-error">{error}</p>}

            <p className="ec-label sch-section-label">Applicant</p>
            <div className="sch-grid">
              {renderText("firstName", "First name", { autoFocus: true })}
              {renderText("lastName", "Last name")}
              {renderText("email", "Email", {
                type: "email",
                wide: true,
                hint: "Also the key the redeemed FAID discount is matched on — a typo here empties the award columns.",
              })}
              {renderText("phone", "Phone", { type: "tel" })}
              {renderText("age", "Age")}
              {renderText("gender", "Gender")}
              {renderText("employment", "Employment")}
              {renderText("details", "Employment details", {
                wide: true,
                hint: "Free text on the employment question — unrelated to Zakat consent, despite the field name.",
              })}
            </div>

            <p className="ec-label sch-section-label">Review</p>
            <div className="sch-grid">
              {renderText("course", "Program", {
                wide: true,
                hint: 'The program applied to, e.g. "Associates Program - Year 2" — also what the purchased product is matched against.',
              })}

              <div className="sch-field">
                <label className="ec-label" htmlFor="sch-status">
                  Status
                </label>
                <select
                  id="sch-status"
                  className="sch-input"
                  value={form.status}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as FormState["status"] }))}
                >
                  <option value="">Unset</option>
                  <option value="approved">Approved</option>
                  <option value="denied">Denied</option>
                </select>
              </div>

              {renderText("need", "Award", { hint: 'e.g. "75%" — the first number in it is read as the award percentage.' })}

              <div className="sch-field">
                <label className="ec-label" htmlFor="sch-zakat">
                  Zakat-eligible
                </label>
                <select
                  id="sch-zakat"
                  className="sch-input"
                  value={form.zakat}
                  onChange={(event) => setForm((prev) => ({ ...prev, zakat: event.target.value as FormState["zakat"] }))}
                >
                  <option value="">Unset</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
                <p className="ec-hint">Whether they qualify for Zakat funding — not their consent to it.</p>
              </div>

              <div className="sch-field">
                <label className="ec-label" htmlFor="sch-consent">
                  Zakat consent
                </label>
                <select
                  id="sch-consent"
                  className="sch-input"
                  value={form.consent}
                  onChange={(event) => setForm((prev) => ({ ...prev, consent: event.target.value as FormState["consent"] }))}
                >
                  <option value="not-recorded">Not recorded</option>
                  <option value="recorded">Recorded</option>
                </select>
                <p className="ec-hint">
                  Only record this once the applicant has actually agreed. Setting it back to &quot;not recorded&quot;
                  clears their consent and its timestamp.
                </p>
              </div>

              <div className="sch-field">
                <label className="ec-label" htmlFor="sch-reviewDate">
                  Reviewed on
                </label>
                <input
                  id="sch-reviewDate"
                  className="sch-input"
                  type="date"
                  value={form.reviewDate}
                  onChange={(event) => setForm((prev) => ({ ...prev, reviewDate: event.target.value }))}
                />
                {reviewOutOfScope ? (
                  <p className="ec-hint sch-hint-warn">
                    Before the {cutoffLabel} cutoff — saving this drops the application off the list.
                  </p>
                ) : (
                  <p className="ec-hint">Left blank, the list falls back to the submitted date.</p>
                )}
              </div>

              {renderText("reviewedBy", "Reviewed by")}
            </div>

            <p className="ec-label sch-section-label">Notes</p>
            <div className="sch-grid">
              {renderTextarea("reason", "Reason")}
              {renderTextarea("interest", "Interest")}
              {renderTextarea("comments", "Comments")}
            </div>
          </div>

          <footer className="sch-dialog-foot">
            {confirmingDiscard ? (
              <>
                <p className="sch-discard-prompt">Discard your changes?</p>
                <button type="button" className="ec-btn" onClick={() => setConfirmingDiscard(false)}>
                  Keep editing
                </button>
                <button type="button" className="ec-btn sch-btn-danger" onClick={onClose}>
                  Discard
                </button>
              </>
            ) : (
              <>
                {dirty && <p className="sch-dirty-note">Unsaved changes</p>}
                <button type="button" className="ec-btn" onClick={requestClose} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="ec-btn ec-btn-primary" disabled={saving || !dirty}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </>
            )}
          </footer>
        </form>
      </div>
    </div>
  );
}
