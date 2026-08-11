"use client";

import { useState } from "react";
import type { PendingApplicant } from "@/server/zakat";

type RowState = "idle" | "sending" | "sent" | "error";

const STATUS_LABEL: Record<Exclude<RowState, "idle">, string> = {
  sending: "Sending…",
  sent: "Sent",
  error: "Failed — retry",
};

export default function PendingApplicants({
  applicants,
  token,
}: {
  applicants: PendingApplicant[];
  token: string;
}) {
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [sendingAll, setSendingAll] = useState(false);

  async function send(id: string): Promise<boolean> {
    setStates((prev) => ({ ...prev, [id]: "sending" }));
    try {
      const res = await fetch(`/api/admin/send/${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`request failed with status ${res.status}`);
      }
      setStates((prev) => ({ ...prev, [id]: "sent" }));
      return true;
    } catch {
      setStates((prev) => ({ ...prev, [id]: "error" }));
      return false;
    }
  }

  async function sendAll() {
    setSendingAll(true);
    // Sequential so a shared mail API isn't hit with a burst, and so each row's
    // status updates in order.
    for (const applicant of applicants) {
      if (states[applicant.id] === "sent") continue;
      await send(applicant.id);
    }
    setSendingAll(false);
  }

  if (applicants.length === 0) {
    return (
      <div className="message-body">
        <p>No pending applicants — everyone eligible has already been emailed.</p>
      </div>
    );
  }

  const remaining = applicants.filter((a) => states[a.id] !== "sent").length;

  return (
    <div className="admin-content">
      <div className="admin-toolbar">
        <span className="admin-count">
          {remaining} of {applicants.length} awaiting an email
        </span>
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          onClick={sendAll}
          disabled={sendingAll || remaining === 0}
        >
          {sendingAll ? "Sending…" : "Send all pending"}
        </button>
      </div>

      <ul className="admin-list">
        {applicants.map((applicant) => {
          const state = states[applicant.id] ?? "idle";
          return (
            <li key={applicant.id} className="admin-row">
              <div className="admin-row-info">
                <span className="admin-name">{applicant.firstName || "(no name)"}</span>
                <span className="admin-meta">{applicant.email}</span>
                <span className="admin-meta">{applicant.course}</span>
              </div>

              <div className="admin-row-action">
                {state !== "idle" && (
                  <span className={`admin-status admin-status-${state}`}>
                    {STATUS_LABEL[state]}
                  </span>
                )}
                {state !== "sent" && (
                  <button
                    type="button"
                    className="admin-btn"
                    onClick={() => send(applicant.id)}
                    disabled={state === "sending" || sendingAll}
                  >
                    {state === "error" ? "Retry" : "Send consent email"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
