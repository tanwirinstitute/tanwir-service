"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { getClientAuth, getClientDb } from "@/lib/firebaseClient";
import SignOutButton from "../SignOutButton";
import { downloadBlob } from "../dashboard/exportAttendance";
import type { EventRegistrationRecord } from "@/types/event";

type RegistrationWithId = EventRegistrationRecord & { id: string };

interface EventGroup {
  key: string;
  productName: string;
  year: string;
  firstRegisteredOn: string;
  registrations: RegistrationWithId[];
}

/**
 * Recurring events (e.g. the Annual Arafat Program) reuse the same name
 * every year — sometimes across more than one productId within a single
 * year — so an event is grouped by name + the year people registered, not
 * by productId.
 */
function eventKey(registration: EventRegistrationRecord): string {
  return `${registration.productName.trim()}::${registration.registeredOn.slice(0, 4)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function initials(registration: { name: string | null; email: string }): string {
  const parts = (registration.name ?? "").trim().split(/\s+/).filter(Boolean);
  const combined = [parts[0]?.[0], parts.length > 1 ? parts[parts.length - 1][0] : undefined].filter(Boolean).join("");
  return (combined || registration.email[0] || "?").toUpperCase();
}

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/* --- Icons: hand-rolled inline SVGs, matching the rest of the admin app --- */

type IconProps = { className?: string };

function IconSearch({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.2" y2="16.2" />
    </svg>
  );
}

function IconUsers({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 19c0-3 2.5-5.25 5.5-5.25S14.5 16 14.5 19" />
      <circle cx="17.25" cy="9.5" r="2.4" />
      <path d="M15.6 14.3c2.1.5 3.9 2.2 3.9 4.7" />
    </svg>
  );
}

function IconTicket({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16v3a2 2 0 000 4v3H4v-3a2 2 0 000-4z" />
      <line x1="14" y1="7" x2="14" y2="17" strokeDasharray="1.5 2" />
    </svg>
  );
}

function IconCalendar({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <line x1="3.5" y1="10" x2="20.5" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </svg>
  );
}

function IconInbox({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12h4l2 3h4l2-3h4" />
      <path d="M5.5 5h13L21 12v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6z" />
    </svg>
  );
}

function IconAlertTriangle({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4.5l9 15.5H3z" />
      <line x1="12" y1="10" x2="12" y2="14.5" />
      <circle cx="12" cy="17.2" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <span className="stat-icon">{icon}</span>
      <span className="stat-body">
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
      </span>
    </div>
  );
}

function EventsSkeleton() {
  return (
    <main className="dashboard-shell">
      <Image src="/logo.webp" alt="Tanwir Institute" width={37} height={40} className="brand-logo skel-logo" priority />
      <div className="skel skel-title" />
      <div className="skel skel-subtitle" />
      <div className="stat-grid">
        {Array.from({ length: 3 }).map((_, i) => (
          <div className="skel skel-stat" key={i} />
        ))}
      </div>
      <div className="skel skel-filterbar" />
      <div className="table-wrap">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="skel-row" key={i}>
            <div className="skel skel-avatar" />
            <div className="skel-row-lines">
              <div className="skel skel-line-short" />
              <div className="skel skel-line-long" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

export default function EventsClient() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [registrations, setRegistrations] = useState<Map<string, EventRegistrationRecord>>(new Map());
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const signOutAndRedirect = useCallback(async () => {
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    return onAuthStateChanged(getClientAuth(), (user) => {
      if (user) {
        setSignedIn(true);
      } else {
        router.replace("/login?next=/events");
      }
    });
  }, [router]);

  useEffect(() => {
    if (!signedIn) return;
    const db = getClientDb();

    // A permission-denied here means the user was removed from
    // authorizedUsers after signing in — force a fresh login.
    const unsub = onSnapshot(
      collection(db, "eventRegistrations"),
      (snapshot) => {
        const next = new Map<string, EventRegistrationRecord>();
        snapshot.forEach((docSnap) => next.set(docSnap.id, docSnap.data() as EventRegistrationRecord));
        setRegistrations(next);
        setLoaded(true);
      },
      (error) => {
        if (error.code === "permission-denied") {
          void signOutAndRedirect();
        } else {
          setAuthError(error.message);
        }
      }
    );

    return unsub;
  }, [signedIn, signOutAndRedirect]);

  // Most recent event first.
  const events = useMemo(() => {
    const groups = new Map<string, EventGroup>();
    registrations.forEach((registration, id) => {
      const key = eventKey(registration);
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          productName: registration.productName.trim(),
          year: registration.registeredOn.slice(0, 4),
          firstRegisteredOn: registration.registeredOn,
          registrations: [],
        };
        groups.set(key, group);
      }
      group.registrations.push({ id, ...registration });
      if (registration.registeredOn < group.firstRegisteredOn) {
        group.firstRegisteredOn = registration.registeredOn;
      }
    });
    return Array.from(groups.values()).sort((a, b) => b.firstRegisteredOn.localeCompare(a.firstRegisteredOn));
  }, [registrations]);

  const activeEvent = events.find((event) => event.key === selectedEvent) ?? events[0] ?? null;

  const rows = useMemo(() => {
    if (!activeEvent) return [];
    const q = query.trim().toLowerCase();
    return activeEvent.registrations
      .filter((registration) => {
        if (!q) return true;
        return [registration.name, registration.email, registration.phone, registration.orderNumber]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => a.registeredOn.localeCompare(b.registeredOn));
  }, [activeEvent, query]);

  const totalAttending = activeEvent?.registrations.reduce((sum, registration) => sum + registration.attending, 0) ?? 0;

  const handleExport = useCallback(() => {
    if (!activeEvent) return;
    const header = ["Name", "Email", "Phone", "Attending", "Registered", "Order #"];
    const lines = rows.map((registration) =>
      [
        registration.name,
        registration.email,
        registration.phone,
        registration.attending,
        formatDate(registration.registeredOn),
        registration.orderNumber,
      ]
        .map(csvCell)
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const slug = `${activeEvent.productName}-${activeEvent.year}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${slug}-registrants.csv`);
  }, [activeEvent, rows]);

  if (authError) {
    return (
      <main className="dashboard-shell">
        <Image src="/logo.webp" alt="Tanwir Institute" width={37} height={40} className="brand-logo skel-logo" priority />
        <div className="state-card state-card-error">
          <IconAlertTriangle className="state-icon" />
          <h2>Couldn&apos;t load event registrations</h2>
          <p>{authError}</p>
          <button type="button" className="login-btn" style={{ marginTop: "1rem" }} onClick={signOutAndRedirect}>
            Back to sign in
          </button>
        </div>
      </main>
    );
  }

  if (!signedIn || !loaded) {
    return <EventsSkeleton />;
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Link href="/" className="brand brand-link">
          <Image src="/logo.webp" alt="Tanwir Institute" width={37} height={40} className="brand-logo" priority />
          <div>
            <h1>Event Registration</h1>
            <p className="dashboard-subtitle">Registrants for Tanwir events</p>
          </div>
        </Link>
        <div className="dashboard-header-actions">
          <button
            type="button"
            className="ec-btn"
            onClick={handleExport}
            disabled={rows.length === 0}
            title="Exports the registrants currently shown below as a CSV"
          >
            Export CSV
          </button>
          <SignOutButton />
        </div>
      </header>

      {activeEvent && (
        <div className="stat-grid">
          <StatCard icon={<IconTicket className="stat-icon-svg" />} label="Registrations" value={activeEvent.registrations.length} />
          <StatCard icon={<IconUsers className="stat-icon-svg" />} label="Total attending" value={totalAttending} />
          <StatCard
            icon={<IconCalendar className="stat-icon-svg" />}
            label="Registration opened"
            value={formatDate(activeEvent.firstRegisteredOn)}
          />
        </div>
      )}

      <div className="filter-bar">
        <div className="search-field">
          <IconSearch className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, email, phone, or order #…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select value={activeEvent?.key ?? ""} onChange={(event) => setSelectedEvent(event.target.value)} disabled={events.length === 0}>
          {events.map((event) => (
            <option key={event.key} value={event.key}>
              {event.productName} ({event.year}) — {event.registrations.length}
            </option>
          ))}
        </select>
      </div>

      <div className="table-wrap">
        {rows.length > 0 && (
          <div className="table-scroll">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Registrant</th>
                  <th>Phone</th>
                  <th>Attending</th>
                  <th>Registered</th>
                  <th>Order #</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((registration) => (
                  <tr key={registration.id} className="student-tr">
                    <td className="col-student">
                      <div className="student-identity">
                        <span className="avatar" aria-hidden="true">
                          {initials(registration)}
                        </span>
                        <div>
                          <div className="student-name">{registration.name || registration.email}</div>
                          <div className="student-email">{registration.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="col-phone" data-label="Phone">
                      {registration.phone || "—"}
                    </td>
                    <td data-label="Attending">{registration.attending}</td>
                    <td data-label="Registered">{formatDate(registration.registeredOn)}</td>
                    <td data-label="Order #">{registration.orderNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.length === 0 && (
          <div className="empty-state">
            <IconInbox className="empty-icon" />
            <h2>{events.length === 0 ? "No event registrations yet" : "No registrants match"}</h2>
            <p>
              {events.length === 0
                ? "Registrations appear here once the Squarespace sync picks up orders for products tagged “events”."
                : "Try adjusting your search."}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
