"use client";

import { useCallback, useEffect, useState } from "react";

interface HistoryRecipient {
  email: string;
  name: string | null;
  status: "sent" | "failed";
  error?: string;
}

interface SendSummary {
  id: string;
  createdAt: string | null;
  createdBy: { uid: string; email: string | null; name: string | null };
  subject: string;
  audienceLabel: string;
  totalRecipients: number;
  sent: number;
  failed: number;
  status: "completed" | "partial" | "failed";
  retryOf: string | null;
  failedRecipients: HistoryRecipient[];
  recipientsTruncated: boolean;
}

interface RetryResult {
  sendId: string;
  sent: number;
  failed: number;
  attempted: number;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SendHistory({ refreshKey }: { refreshKey: number }) {
  const [sends, setSends] = useState<SendSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [retryTarget, setRetryTarget] = useState<SendSummary | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryResult, setRetryResult] = useState<RetryResult | null>(null);

  // State-free fetch; callers own the loading/error state around it.
  const fetchSends = useCallback(async (): Promise<SendSummary[]> => {
    const res = await fetch("/api/email/history");
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || `Request failed (${res.status})`);
    return data.sends as SendSummary[];
  }, []);

  // Manual refresh / post-retry refetch — a normal event handler, so
  // updating loading state up front is fine here.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSends(await fetchSends());
    } catch (err) {
      setError((err as Error).message);
      setSends(null);
    } finally {
      setLoading(false);
    }
  }, [fetchSends]);

  // Initial load and refetch when refreshKey changes. All state updates land
  // in async callbacks (never synchronously in the effect body) so a refetch
  // swaps the list in place without a flash of the loading state.
  useEffect(() => {
    let cancelled = false;
    fetchSends()
      .then((rows) => {
        if (cancelled) return;
        setSends(rows);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchSends, refreshKey]);

  const runRetry = useCallback(async () => {
    if (!retryTarget) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch("/api/email/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendId: retryTarget.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || `Request failed (${res.status})`);
      setRetryResult({ sendId: data.sendId, sent: data.sent, failed: data.failed, attempted: data.attempted });
      await load();
    } catch (err) {
      setRetryError((err as Error).message);
    } finally {
      setRetrying(false);
    }
  }, [retryTarget, load]);

  const closeRetry = useCallback(() => {
    setRetryTarget(null);
    setRetryError(null);
    setRetryResult(null);
    setRetrying(false);
  }, []);

  return (
    <div className="ec-panel ec-history">
      <div className="ec-history-head">
        <p className="ec-label">Recent sends</p>
        <button type="button" className="ec-btn ec-btn-sm" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loading && !sends && <p className="ec-hint">Loading history…</p>}
      {error && <p className="ec-error">{error}</p>}
      {!loading && !error && sends && sends.length === 0 && (
        <p className="ec-hint">No sends yet. Blasts you send from the Compose tab will show up here.</p>
      )}

      {sends && sends.length > 0 && (
        <ul className="ec-history-list">
          {sends.map((s) => {
            const isOpen = expanded === s.id;
            return (
              <li key={s.id} className="ec-history-item">
                <button
                  type="button"
                  className="ec-history-row"
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                  aria-expanded={isOpen}
                >
                  <span className="ec-history-main">
                    <span className="ec-history-subject">{s.subject || "(no subject)"}</span>
                    <span className="ec-history-meta">
                      {formatWhen(s.createdAt)} · {s.audienceLabel}
                      {s.retryOf ? " · retry" : ""}
                      {s.createdBy.email ? ` · ${s.createdBy.email}` : ""}
                    </span>
                  </span>
                  <span className="ec-history-counts">
                    <span className="ec-badge ec-badge-ok">{s.sent} sent</span>
                    {s.failed > 0 && <span className="ec-badge ec-badge-fail">{s.failed} failed</span>}
                  </span>
                </button>

                {isOpen && (
                  <div className="ec-history-detail">
                    <p className="ec-hint">
                      {s.sent} of {s.totalRecipients} delivered
                      {s.recipientsTruncated ? " · recipient list was truncated when stored" : ""}.
                    </p>

                    {s.failed > 0 ? (
                      <>
                        <p className="ec-failures-title">Failed recipients</p>
                        <ul className="ec-history-failures">
                          {s.failedRecipients.map((r) => (
                            <li key={r.email}>
                              <span className="ec-recipient-email">{r.email}</span>
                              {r.error ? <span className="ec-history-err"> — {r.error}</span> : null}
                            </li>
                          ))}
                          {s.failedRecipients.length < s.failed && (
                            <li className="ec-hint">
                              …and {s.failed - s.failedRecipients.length} more not stored individually
                            </li>
                          )}
                        </ul>
                        <button
                          type="button"
                          className="ec-btn ec-btn-primary ec-btn-sm"
                          onClick={() => {
                            setRetryResult(null);
                            setRetryError(null);
                            setRetryTarget(s);
                          }}
                          disabled={s.failedRecipients.length === 0}
                        >
                          Retry {s.failedRecipients.length} failed
                        </button>
                        {s.failedRecipients.length === 0 && (
                          <p className="ec-hint">No stored recipient rows to retry for this send.</p>
                        )}
                      </>
                    ) : (
                      <p className="ec-hint">Every recipient was delivered.</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {retryTarget && (
        <div className="ec-modal-backdrop">
          <div className="ec-modal">
            {retryResult ? (
              <>
                <h2>Retry complete</h2>
                <p>
                  {retryResult.sent} of {retryResult.attempted} delivered
                  {retryResult.failed > 0 ? `, ${retryResult.failed} still failed` : ""}.
                </p>
                {retryResult.failed > 0 && (
                  <p className="ec-hint">
                    The remaining failures were logged as a new history entry — you can retry those again once Gmail
                    settles.
                  </p>
                )}
                <div className="ec-modal-actions">
                  <button type="button" className="ec-btn ec-btn-primary" onClick={closeRetry}>
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Retry {retryTarget.failedRecipients.length} failed recipients?</h2>
                <p>
                  Re-sends &ldquo;<strong>{retryTarget.subject || "(no subject)"}</strong>&rdquo; — same content — to only
                  the {retryTarget.failedRecipients.length} recipient
                  {retryTarget.failedRecipients.length === 1 ? "" : "s"} this send failed on.
                </p>
                {retryError && <p className="ec-error">{retryError}</p>}
                <div className="ec-modal-actions">
                  <button type="button" className="ec-btn" onClick={closeRetry} disabled={retrying}>
                    Cancel
                  </button>
                  <button type="button" className="ec-btn ec-btn-primary" onClick={runRetry} disabled={retrying}>
                    {retrying ? "Retrying…" : "Retry now"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
