"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import SignOutButton from "../SignOutButton";
import { buildTanwirQrSvg, tanwirQrPng } from "./tanwirQr";
import type { QrLinkRecord } from "@/server/qrLinks";

/* --- Icons: hand-rolled inline SVGs (no icon-font/emoji, no extra dependency) --- */

type IconProps = { className?: string };

function IconCopy({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1.5 1.5 0 01-1.5-1.5v-9A1.5 1.5 0 014 3h9A1.5 1.5 0 0114.5 4.5V5" />
    </svg>
  );
}

function IconCheck({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="5 13 10 18 19 7" />
    </svg>
  );
}

function IconDownload({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11" />
      <polyline points="7 10.5 12 15.5 17 10.5" />
      <path d="M4.5 19.5h15" />
    </svg>
  );
}

function IconPencil({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 5.5l4 4L8 20l-4.7.7L4 16z" />
      <path d="M12.5 7.5l4 4" />
    </svg>
  );
}

function IconTrash({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 6.5h15" />
      <path d="M9 6.5V4.75A.75.75 0 019.75 4h4.5a.75.75 0 01.75.75V6.5" />
      <path d="M6.5 6.5l.8 12.3a1.5 1.5 0 001.5 1.4h6.4a1.5 1.5 0 001.5-1.4l.8-12.3" />
      <line x1="10" y1="10.5" x2="10" y2="16.5" />
      <line x1="14" y1="10.5" x2="14" y2="16.5" />
    </svg>
  );
}

function IconScan({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8V5.5A1.5 1.5 0 015.5 4H8" />
      <path d="M16 4h2.5A1.5 1.5 0 0120 5.5V8" />
      <path d="M20 16v2.5a1.5 1.5 0 01-1.5 1.5H16" />
      <path d="M8 20H5.5A1.5 1.5 0 014 18.5V16" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  );
}

function IconLoader({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3a9 9 0 106.36 2.64" />
    </svg>
  );
}

/* --- Data helpers --- */

interface ApiResponse {
  success: boolean;
  message?: string;
  links?: QrLinkRecord[];
  link?: QrLinkRecord;
}

async function callApi(path: string, init?: RequestInit): Promise<ApiResponse> {
  const response = await fetch(path, init);
  let body: ApiResponse;
  try {
    body = (await response.json()) as ApiResponse;
  } catch {
    throw new Error(`Request failed (${response.status})`);
  }
  if (!response.ok || !body.success) {
    throw new Error(body.message || `Request failed (${response.status})`);
  }
  return body;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** The public URL a code redirects through. Defaults to wherever the console
 * is being browsed (admin.tanwir.institute in production); override with
 * NEXT_PUBLIC_QR_ORIGIN if the printed codes should use another host. */
function shortUrl(slug: string): string {
  const origin = process.env.NEXT_PUBLIC_QR_ORIGIN || window.location.origin;
  return `${origin.replace(/\/$/, "")}/qr/${slug}`;
}

/* --- QR preview + per-link card --- */

function QrPreview({ url, logoDataUri, className }: { url: string; logoDataUri: string | null; className?: string }) {
  const svg = useMemo(() => buildTanwirQrSvg(url, { logoDataUri }), [url, logoDataUri]);
  // Safe: markup is generated entirely by our own renderer from geometry —
  // no user-provided string ever lands in it verbatim.
  return <div className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function QrLinkCard({
  link,
  logoDataUri,
  onUpdated,
  onDeleted,
}: {
  link: QrLinkRecord;
  logoDataUri: string | null;
  onUpdated: (link: QrLinkRecord) => void;
  onDeleted: (slug: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(link.label);
  const [targetUrl, setTargetUrl] = useState(link.targetUrl);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const url = shortUrl(link.slug);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Couldn't copy — copy the link manually");
    }
  }, [url]);

  const download = useCallback(
    async (format: "svg" | "png") => {
      setError(null);
      try {
        const svg = buildTanwirQrSvg(url, { logoDataUri });
        const blob =
          format === "svg" ? new Blob([svg], { type: "image/svg+xml" }) : await tanwirQrPng(svg);
        triggerDownload(blob, `tanwir-qr-${link.slug}.${format}`);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [url, logoDataUri, link.slug]
  );

  async function saveEdits() {
    setBusy(true);
    setError(null);
    try {
      const body = await callApi(`/api/qr-codes/${encodeURIComponent(link.slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, targetUrl }),
      });
      if (body.link) onUpdated(body.link);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      await callApi(`/api/qr-codes/${encodeURIComponent(link.slug)}`, { method: "DELETE" });
      onDeleted(link.slug);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <article className="ec-panel qr-card">
      <QrPreview url={url} logoDataUri={logoDataUri} className="qr-card-preview" />

      <div className="qr-card-body">
        {editing ? (
          <>
            <label className="ec-field qr-field-tight">
              <span className="ec-label">Label</span>
              <input className="qr-input" value={label} onChange={(e) => setLabel(e.target.value)} disabled={busy} />
            </label>
            <label className="ec-field qr-field-tight">
              <span className="ec-label">Destination URL</span>
              <input
                className="qr-input"
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                disabled={busy}
                placeholder="https://…"
              />
            </label>
            <p className="ec-hint">The printed code keeps working — scans will follow the new destination.</p>
            {error && <p className="ec-error">{error}</p>}
            <div className="qr-card-actions">
              <button type="button" className="ec-btn ec-btn-primary ec-btn-sm" onClick={saveEdits} disabled={busy}>
                {busy ? <IconLoader className="btn-icon spin" /> : <IconCheck className="btn-icon" />}
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="ec-btn ec-btn-sm"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setLabel(link.label);
                  setTargetUrl(link.targetUrl);
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="qr-card-title">{link.label}</h2>

            <div className="qr-card-url">
              <code>{url}</code>
              <button type="button" className="qr-icon-btn" onClick={copyLink} title="Copy QR link" aria-label="Copy QR link">
                {copied ? <IconCheck className="qr-icon ok" /> : <IconCopy className="qr-icon" />}
              </button>
            </div>

            <p className="qr-card-target">
              Redirects to{" "}
              <a href={link.targetUrl} target="_blank" rel="noopener noreferrer">
                {link.targetUrl}
              </a>
            </p>

            <p className="qr-card-meta">
              <IconScan className="qr-meta-icon" />
              {link.scanCount} scan{link.scanCount === 1 ? "" : "s"}
              {link.lastScannedAt ? ` · last ${formatDate(link.lastScannedAt)}` : ""}
              {` · created ${formatDate(link.createdAt)}`}
            </p>

            {error && <p className="ec-error">{error}</p>}

            {confirmingDelete ? (
              <div className="qr-card-actions">
                <span className="qr-confirm-text">Delete? Printed codes will stop working.</span>
                <button type="button" className="ec-btn ec-btn-sm qr-btn-danger" onClick={confirmDelete} disabled={busy}>
                  {busy ? "Deleting…" : "Delete"}
                </button>
                <button type="button" className="ec-btn ec-btn-sm" onClick={() => setConfirmingDelete(false)} disabled={busy}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="qr-card-actions">
                <button type="button" className="ec-btn ec-btn-sm" onClick={() => download("png")}>
                  <IconDownload className="btn-icon" /> PNG
                </button>
                <button type="button" className="ec-btn ec-btn-sm" onClick={() => download("svg")}>
                  <IconDownload className="btn-icon" /> SVG
                </button>
                <button type="button" className="ec-btn ec-btn-sm" onClick={() => setEditing(true)}>
                  <IconPencil className="btn-icon" /> Edit
                </button>
                <button
                  type="button"
                  className="qr-icon-btn qr-icon-btn-danger"
                  onClick={() => setConfirmingDelete(true)}
                  title="Delete QR link"
                  aria-label="Delete QR link"
                >
                  <IconTrash className="qr-icon" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

/* --- Console --- */

export default function QrConsoleClient() {
  const [links, setLinks] = useState<QrLinkRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [logoDataUri, setLogoDataUri] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    callApi("/api/qr-codes")
      .then((body) => setLinks(body.links ?? []))
      .catch((err) => setLoadError((err as Error).message));
  }, []);

  useEffect(() => {
    // Inline the logo as a data URI so downloaded SVG/PNG files are
    // self-contained instead of referencing /logo.webp.
    let cancelled = false;
    fetch("/logo.webp")
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error("logo fetch failed"))))
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error("logo read failed"));
            reader.readAsDataURL(blob);
          })
      )
      .then((uri) => {
        if (!cancelled) setLogoDataUri(uri);
      })
      // Codes still render (and scan) without the center logo.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function createLink(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const body = await callApi("/api/qr-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          targetUrl,
          slug: customSlug.trim() || undefined,
        }),
      });
      if (body.link) setLinks((prev) => [body.link!, ...(prev ?? [])]);
      setLabel("");
      setTargetUrl("");
      setCustomSlug("");
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Link href="/" className="brand brand-link">
          <Image src="/logo.webp" alt="Tanwir Institute" width={37} height={40} className="brand-logo" priority />
          <div>
            <h1>QR Codes</h1>
            <p className="dashboard-subtitle">Branded QR codes with editable destinations</p>
          </div>
        </Link>
        <SignOutButton />
      </header>

      <div className="qr-layout">
        <section className="ec-panel qr-create-panel">
          <h2 className="qr-panel-title">New QR code</h2>
          <form onSubmit={createLink}>
            <label className="ec-field">
              <span className="ec-label">Label</span>
              <input
                className="qr-input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Fall Open House flyer"
                required
                disabled={creating}
              />
            </label>
            <label className="ec-field">
              <span className="ec-label">Destination URL</span>
              <input
                className="qr-input"
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://tanwir.institute/…"
                required
                disabled={creating}
              />
            </label>
            <label className="ec-field">
              <span className="ec-label">Custom slug (optional)</span>
              <input
                className="qr-input"
                value={customSlug}
                onChange={(e) => setCustomSlug(e.target.value)}
                placeholder="auto-generated if empty"
                pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
                title="Lowercase letters, numbers and hyphens"
                disabled={creating}
              />
            </label>
            <p className="ec-hint">
              The code encodes a permanent tanwir link — change its destination any time without reprinting.
            </p>
            {createError && <p className="ec-error">{createError}</p>}
            <button type="submit" className="ec-btn ec-btn-primary qr-create-btn" disabled={creating}>
              {creating && <IconLoader className="btn-icon spin" />}
              {creating ? "Generating…" : "Generate QR code"}
            </button>
          </form>
        </section>

        <section className="qr-list">
          {loadError && <p className="ec-error">{loadError}</p>}

          {!links && !loadError && (
            <div className="qr-list-loading">
              <IconLoader className="btn-icon spin" /> Loading QR codes…
            </div>
          )}

          {links && links.length === 0 && (
            <div className="empty-state">
              <IconScan className="empty-icon" />
              <h2>No QR codes yet</h2>
              <p>Generate your first code with the form — it&apos;ll appear here ready to download.</p>
            </div>
          )}

          {links &&
            links.map((link) => (
              <QrLinkCard
                key={link.slug}
                link={link}
                logoDataUri={logoDataUri}
                onUpdated={(updated) => setLinks((prev) => (prev ?? []).map((l) => (l.slug === updated.slug ? updated : l)))}
                onDeleted={(slug) => setLinks((prev) => (prev ?? []).filter((l) => l.slug !== slug))}
              />
            ))}
        </section>
      </div>
    </main>
  );
}
