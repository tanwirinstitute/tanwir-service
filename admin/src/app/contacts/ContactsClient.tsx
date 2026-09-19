"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, Timestamp } from "firebase/firestore";
import { getClientAuth, getClientDb } from "@/lib/firebaseClient";
import SignOutButton from "../SignOutButton";
import type { ContactRecord, ContactSource } from "@/types/contact";

type ContactWithId = ContactRecord & { id: string };
type SourceFilter = "all" | ContactSource;

const SOURCE_LABELS: Record<ContactSource, string> = {
  student: "Student",
  student_legacy: "Student (legacy)",
  mailchimp: "Mailchimp",
  event: "Event",
  donor: "Donor",
};

const SOURCE_ORDER: ContactSource[] = ["student", "student_legacy", "mailchimp", "event", "donor"];

function initials(contact: { firstName: string | null; lastName: string | null; email: string }): string {
  const first = contact.firstName?.trim()?.[0];
  const last = contact.lastName?.trim()?.[0];
  const combined = [first, last].filter(Boolean).join("");
  return (combined || contact.email[0] || "?").toUpperCase();
}

function lastSyncedAt(contact: ContactRecord): string | null {
  const dates = contact.sources
    .map((entry) => (entry.syncedAt instanceof Timestamp ? entry.syncedAt.toDate() : null))
    .filter((date): date is Date => date !== null);
  if (dates.length === 0) return null;
  const latest = new Date(Math.max(...dates.map((date) => date.getTime())));
  return latest.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/* --- Icons: hand-rolled inline SVGs, matching the dashboard's set --- */

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

function StatCard({
  icon,
  label,
  value,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onClick?: () => void;
  active?: boolean;
}) {
  const className = ["stat-card", onClick ? "stat-card-actionable" : "", active ? "stat-card-active" : ""]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <span className="stat-icon">{icon}</span>
      <span className="stat-body">
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
      </span>
    </>
  );

  if (!onClick) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button type="button" className={className} onClick={onClick} aria-pressed={active}>
      {content}
    </button>
  );
}

function ContactsSkeleton() {
  return (
    <main className="dashboard-shell">
      <Image src="/logo.webp" alt="Tanwir Institute" width={37} height={40} className="brand-logo skel-logo" priority />
      <div className="skel skel-title" />
      <div className="skel skel-subtitle" />
      <div className="stat-grid">
        {Array.from({ length: 4 }).map((_, i) => (
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

export default function ContactsClient() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Map<string, ContactRecord>>(new Map());
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const signOutAndRedirect = useCallback(async () => {
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    return onAuthStateChanged(getClientAuth(), (user) => {
      if (user) {
        setSignedIn(true);
      } else {
        router.replace("/login?next=/contacts");
      }
    });
  }, [router]);

  useEffect(() => {
    if (!signedIn) return;
    const db = getClientDb();

    // A permission-denied here means the user was removed from
    // authorizedUsers after signing in — force a fresh login.
    const unsub = onSnapshot(
      collection(db, "contacts"),
      (snapshot) => {
        const next = new Map<string, ContactRecord>();
        snapshot.forEach((docSnap) => next.set(docSnap.id, docSnap.data() as ContactRecord));
        setContacts(next);
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

  const sourceCounts = useMemo(() => {
    const counts = new Map<ContactSource, number>();
    contacts.forEach((contact) => {
      const seen = new Set(contact.sources.map((entry) => entry.source));
      seen.forEach((source) => counts.set(source, (counts.get(source) ?? 0) + 1));
    });
    return counts;
  }, [contacts]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    const all: ContactWithId[] = Array.from(contacts.entries()).map(([id, contact]) => ({ id, ...contact }));

    return all
      .filter((contact) => sourceFilter === "all" || contact.sources.some((entry) => entry.source === sourceFilter))
      .filter((contact) => {
        if (!q) return true;
        return [contact.email, contact.firstName, contact.lastName, contact.phone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => a.email.localeCompare(b.email));
  }, [contacts, query, sourceFilter]);

  if (authError) {
    return (
      <main className="dashboard-shell">
        <Image src="/logo.webp" alt="Tanwir Institute" width={37} height={40} className="brand-logo skel-logo" priority />
        <div className="state-card state-card-error">
          <IconAlertTriangle className="state-icon" />
          <h2>Couldn&apos;t load contacts</h2>
          <p>{authError}</p>
          <button type="button" className="login-btn" style={{ marginTop: "1rem" }} onClick={signOutAndRedirect}>
            Back to sign in
          </button>
        </div>
      </main>
    );
  }

  if (!signedIn) {
    return <ContactsSkeleton />;
  }

  const filtersActive = query.trim() !== "" || sourceFilter !== "all";

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Link href="/" className="brand brand-link">
          <Image src="/logo.webp" alt="Tanwir Institute" width={37} height={40} className="brand-logo" priority />
          <div>
            <h1>Contacts</h1>
            <p className="dashboard-subtitle">Consolidated contact warehouse across every source system</p>
          </div>
        </Link>
        <div className="dashboard-header-actions">
          <SignOutButton />
        </div>
      </header>

      <div className="stat-grid">
        <StatCard
          icon={<IconUsers className="stat-icon-svg" />}
          label="All contacts"
          value={contacts.size}
          onClick={() => setSourceFilter("all")}
          active={sourceFilter === "all"}
        />
        {SOURCE_ORDER.map((source) => (
          <StatCard
            key={source}
            icon={<IconUsers className="stat-icon-svg" />}
            label={SOURCE_LABELS[source]}
            value={sourceCounts.get(source) ?? 0}
            onClick={() => setSourceFilter(sourceFilter === source ? "all" : source)}
            active={sourceFilter === source}
          />
        ))}
      </div>

      <div className="filter-bar">
        <div className="search-field">
          <IconSearch className="search-icon" />
          <input
            autoFocus
            type="text"
            className="search-input"
            placeholder="Search by name, email, or phone…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="table-wrap">
        {rows.length > 0 && (
          <div className="table-scroll">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Sources</th>
                  <th>Last synced</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((contact) => (
                  <tr key={contact.id} className="student-tr">
                    <td className="col-student">
                      <div className="student-identity">
                        <span className="avatar" aria-hidden="true">
                          {initials(contact)}
                        </span>
                        <div>
                          <div className="student-name">
                            {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email}
                          </div>
                          <div className="student-email">{contact.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="col-phone" data-label="Phone">
                      {contact.phone || "—"}
                    </td>
                    <td data-label="Sources">
                      <div className="source-chip-list">
                        {contact.sources.map((entry) => (
                          <span key={entry.source} className="source-chip">
                            {SOURCE_LABELS[entry.source]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td data-label="Last synced">{lastSyncedAt(contact) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.length === 0 && (
          <div className="empty-state">
            <IconInbox className="empty-icon" />
            <h2>No contacts match</h2>
            <p>{filtersActive ? "Try adjusting your search or filters." : "No contacts have been synced yet."}</p>
          </div>
        )}
      </div>
    </main>
  );
}
