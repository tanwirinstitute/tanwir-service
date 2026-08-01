"use client";

import { useId, useState } from "react";

type State = "idle" | "loading" | "confirmed" | "error";

export default function ConfirmButton({ docId }: { docId: string }) {
  const [state, setState] = useState<State>("idle");
  const [acknowledged, setAcknowledged] = useState(false);
  const checkboxId = useId();

  async function handleConfirm() {
    setState("loading");
    try {
      const res = await fetch(`/api/consent/${docId}`, { method: "POST" });
      if (!res.ok) {
        throw new Error(`request failed with status ${res.status}`);
      }
      setState("confirmed");
    } catch {
      setState("error");
    }
  }

  if (state === "confirmed") {
    return <p className="status-message success">Thank you — your consent is recorded.</p>;
  }

  return (
    <div>
      <div className="consent-check">
        <input
          id={checkboxId}
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        <label htmlFor={checkboxId}>
          I have read and understood this Consent Agreement, and I authorize Salim Ajmeri to
          accept and facilitate Zakat on my behalf as described above.
        </label>
      </div>

      <button
        type="button"
        className="confirm-btn"
        onClick={handleConfirm}
        disabled={!acknowledged || state === "loading"}
      >
        {state === "loading" ? "Confirming…" : "Confirm My Consent"}
      </button>

      {state === "error" && (
        <p className="status-message error">
          Something went wrong. Please try again or contact us.
        </p>
      )}
    </div>
  );
}
