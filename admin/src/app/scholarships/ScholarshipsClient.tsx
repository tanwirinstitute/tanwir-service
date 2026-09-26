"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, collectionGroup, onSnapshot, Timestamp } from "firebase/firestore";
import { getClientAuth, getClientDb } from "@/lib/firebaseClient";
import { enrolleeNames } from "@/lib/enrolleeNames";
import SignOutButton from "../SignOutButton";
import type { ScholarshipRecord } from "@/types/scholarship";
import type { CourseRecord } from "@/types/student";
import {
  committedAmount,
  extractFaidRedemptions,
  formatMoney,
  isOnOrAfterCutoff,
  matchScholarshipToDiscount,
  normalizeConsented,
  normalizeStatus,
  normalizeZakat,
  parseAwardPercentage,
  scholarshipExpectedProductName,
  scholarshipProgramGroup,
  twoDigitYear,
  SCHOLARSHIP_CUTOFF_ISO,
  type CoursePurchase,
  type ScholarshipMatch,
} from "@/lib/scholarshipMatching";

type ScholarshipWithId = ScholarshipRecord & { id: string };
type ZakatFilter = "all" | "yes" | "no";
type ConsentFilter = "all" | "yes";
type StatusFilter = "all" | "approved" | "denied";

function toMillis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toDate().getTime() : null;
}

function formatDate(millis: number | null): string {
  if (millis === null) return "—";
  return new Date(millis).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function initials(record: { firstName: string | null; lastName: string | null; email: string | null }): string {
  const first = record.firstName?.trim()?.[0];
  const last = record.lastName?.trim()?.[0];
  const combined = [first, last].filter(Boolean).join("");
  return (combined || record.email?.[0] || "?").toUpperCase();
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

function IconHeart({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20.5s-7.5-4.6-9.7-9.2C.9 8 2.3 4.8 5.5 4c2-.5 4 .3 5.2 2 .1.1.2.3.3.4.1-.1.2-.3.3-.4 1.2-1.7 3.2-2.5 5.2-2 3.2.8 4.6 4 3.2 7.3-2.2 4.6-9.7 9.2-9.7 9.2z" />
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
  value: string | number;
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

function ScholarshipsSkeleton() {
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

interface Row {
  scholarship: ScholarshipWithId;
  status: "approved" | "denied" | "unknown";
  /** Zakat-*eligible* — not consent; see @/lib/scholarshipMatching docblock. */
  zakat: "yes" | "no" | "unknown";
  /** Actually consented to their award being funded from Zakat — separate from `zakat` above. */
  consented: "yes" | "unknown";
  reviewMillis: number | null;
  match: ScholarshipMatch | null; // null unless approved+eligible+consented
  amountCovered: number | null;
}

function computeMatch(s: ScholarshipRecord, reviewMillis: number | null, courses: Map<string, CoursePurchase[]>): ScholarshipMatch {
  const studentId = (s.email ?? "").trim().toLowerCase();
  const redemptions = extractFaidRedemptions(courses.get(studentId) ?? []);
  const applicantFullName = [s.firstName, s.lastName].filter(Boolean).join(" ") || null;
  return matchScholarshipToDiscount(
    applicantFullName,
    parseAwardPercentage(s.need),
    twoDigitYear(reviewMillis),
    scholarshipProgramGroup(s.course),
    scholarshipExpectedProductName(s.course),
    redemptions
  );
}

export default function ScholarshipsClient() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [scholarships, setScholarships] = useState<Map<string, ScholarshipRecord>>(new Map());
  const [courses, setCourses] = useState<Map<string, CoursePurchase[]>>(new Map());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("approved");
  const [zakatFilter, setZakatFilter] = useState<ZakatFilter>("all");
  const [consentFilter, setConsentFilter] = useState<ConsentFilter>("all");

  const signOutAndRedirect = useCallback(async () => {
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    return onAuthStateChanged(getClientAuth(), (user) => {
      if (user) {
        setSignedIn(true);
      } else {
        router.replace("/login?next=/scholarships");
      }
    });
  }, [router]);

  useEffect(() => {
    if (!signedIn) return;
    const db = getClientDb();

    const onError = (error: { code?: string; message: string }) => {
      if (error.code === "permission-denied") {
        void signOutAndRedirect();
      } else {
        setAuthError(error.message);
      }
    };

    const unsubScholarships = onSnapshot(
      collection(db, "scholarships"),
      (snapshot) => {
        const next = new Map<string, ScholarshipRecord>();
        snapshot.forEach((docSnap) => next.set(docSnap.id, docSnap.data() as ScholarshipRecord));
        setScholarships(next);
      },
      onError
    );

    // Same collectionGroup pattern as the Registrations dashboard: courses
    // live at students/{email}/courses/{lineItemId}, and this project also
    // has an unrelated top-level "courses" catalog collection that security
    // rules already exclude from this group's reads.
    const unsubCourses = onSnapshot(
      collectionGroup(db, "courses"),
      (snapshot) => {
        const byStudent = new Map<string, CoursePurchase[]>();
        snapshot.forEach((docSnap) => {
          if (!docSnap.ref.path.startsWith("students/")) return;
          const studentId = docSnap.ref.parent.parent!.id;
          const data = docSnap.data() as CourseRecord;
          const pricePaidValue = Number.parseFloat(data.pricePaid?.value ?? "");
          const purchase: CoursePurchase = {
            id: docSnap.id,
            productName: data.productName,
            pricePaidValue: Number.isNaN(pricePaidValue) ? 0 : pricePaidValue,
            discountLines: (data.discountLines ?? []).map((d) => ({
              promoCode: d.promoCode,
              amountValue: Number.parseFloat(d.amount?.value ?? "0") || 0,
            })),
            enrolleeNames: enrolleeNames(data.formResponses),
          };
          const list = byStudent.get(studentId) ?? [];
          list.push(purchase);
          byStudent.set(studentId, list);
        });
        setCourses(byStudent);
      },
      onError
    );

    return () => {
      unsubScholarships();
      unsubCourses();
    };
  }, [signedIn, signOutAndRedirect]);

  const rows = useMemo<Row[]>(() => {
    return Array.from(scholarships.entries())
      .map(([id, s]): Row => {
        const status = normalizeStatus(s.status);
        const zakat = normalizeZakat(s.zakat);
        const consented = normalizeConsented(s.consented);
        const reviewMillis = toMillis(s.reviewDate) ?? toMillis(s.submittedAt);

        const eligibleForMatching = status === "approved" && zakat === "yes" && consented === "yes";
        if (!eligibleForMatching) {
          return { scholarship: { id, ...s }, status, zakat, consented, reviewMillis, match: null, amountCovered: null };
        }

        const match = computeMatch(s, reviewMillis, courses);
        const amountCovered = match.kind === "matched" ? committedAmount(match.redemption) : null;

        return { scholarship: { id, ...s }, status, zakat, consented, reviewMillis, match, amountCovered };
      })
      .filter((row) => isOnOrAfterCutoff(row.reviewMillis))
      .filter((row) => statusFilter === "all" || row.status === statusFilter)
      .filter((row) => zakatFilter === "all" || row.zakat === zakatFilter)
      .filter((row) => consentFilter === "all" || row.consented === consentFilter)
      .filter((row) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        const { scholarship } = row;
        return [scholarship.firstName, scholarship.lastName, scholarship.email, scholarship.course, scholarship.form]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => (b.reviewMillis ?? 0) - (a.reviewMillis ?? 0));
  }, [scholarships, courses, statusFilter, zakatFilter, consentFilter, query]);

  const summary = useMemo(() => {
    const inScope = Array.from(scholarships.entries())
      .map(([id, s]) => {
        const status = normalizeStatus(s.status);
        const zakat = normalizeZakat(s.zakat);
        const consented = normalizeConsented(s.consented);
        const reviewMillis = toMillis(s.reviewDate) ?? toMillis(s.submittedAt);
        return { id, s, status, zakat, consented, reviewMillis };
      })
      .filter((r) => isOnOrAfterCutoff(r.reviewMillis));

    const approved = inScope.filter((r) => r.status === "approved");
    const eligible = approved.filter((r) => r.zakat === "yes");
    const consented = eligible.filter((r) => r.consented === "yes");

    let totalCovered = 0;
    let needsReview = 0;
    for (const r of consented) {
      const match = computeMatch(r.s, r.reviewMillis, courses);
      const amount = match.kind === "matched" ? committedAmount(match.redemption) : null;
      if (amount !== null) {
        totalCovered += amount;
      } else {
        needsReview += 1;
      }
    }

    return {
      approvedCount: approved.length,
      eligibleCount: eligible.length,
      consentedCount: consented.length,
      totalCovered,
      needsReview,
    };
  }, [scholarships, courses]);

  if (authError) {
    return (
      <main className="dashboard-shell">
        <Image src="/logo.webp" alt="Tanwir Institute" width={37} height={40} className="brand-logo skel-logo" priority />
        <div className="state-card state-card-error">
          <IconAlertTriangle className="state-icon" />
          <h2>Couldn&apos;t load scholarships</h2>
          <p>{authError}</p>
          <button type="button" className="login-btn" style={{ marginTop: "1rem" }} onClick={signOutAndRedirect}>
            Back to sign in
          </button>
        </div>
      </main>
    );
  }

  if (!signedIn) {
    return <ScholarshipsSkeleton />;
  }

  const filtersActive = query.trim() !== "" || statusFilter !== "approved" || zakatFilter !== "all" || consentFilter !== "all";

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Link href="/" className="brand brand-link">
          <Image src="/logo.webp" alt="Tanwir Institute" width={37} height={40} className="brand-logo" priority />
          <div>
            <h1>Scholarships</h1>
            <p className="dashboard-subtitle">
              Financial aid applications reviewed on or after {formatDate(Date.parse(SCHOLARSHIP_CUTOFF_ISO))} — earlier
              applications are legacy and out of scope here.
            </p>
          </div>
        </Link>
        <div className="dashboard-header-actions">
          <SignOutButton />
        </div>
      </header>

      <div className="stat-grid">
        <StatCard
          icon={<IconHeart className="stat-icon-svg" />}
          label="Approved"
          value={summary.approvedCount}
          onClick={() => setStatusFilter(statusFilter === "approved" ? "all" : "approved")}
          active={statusFilter === "approved"}
        />
        <StatCard
          icon={<IconHeart className="stat-icon-svg" />}
          label="Zakat-eligible"
          value={summary.eligibleCount}
          onClick={() => setZakatFilter(zakatFilter === "yes" ? "all" : "yes")}
          active={zakatFilter === "yes"}
        />
        <StatCard
          icon={<IconHeart className="stat-icon-svg" />}
          label="Consented"
          value={summary.consentedCount}
          onClick={() => setConsentFilter(consentFilter === "yes" ? "all" : "yes")}
          active={consentFilter === "yes"}
        />
        <StatCard icon={<IconHeart className="stat-icon-svg" />} label="Covered by Zakat" value={formatMoney(summary.totalCovered)} />
        <StatCard icon={<IconAlertTriangle className="stat-icon-svg" />} label="Needs manual review" value={summary.needsReview} />
      </div>

      <p className="dashboard-subtitle" style={{ marginTop: "-0.5rem" }}>
        &quot;Zakat-eligible&quot; and &quot;Consented&quot; are two different facts — eligible for Zakat funding vs.
        having actually agreed to it being used on their award — and only an approved award with both counts toward
        &quot;Covered by Zakat.&quot; That figure is the course&apos;s full price times the percentage on the FAID
        promo code actually redeemed at checkout — not the amount on that order, which is only one installment for a
        recipient on a payment plan. A recipient who hasn&apos;t registered yet, whose account has more than one FAID
        redemption that can&apos;t be disambiguated, or whose course has no price on file yet, is excluded from the
        total and flagged below instead of guessed at.
      </p>

      <div className="filter-bar">
        <div className="search-field">
          <IconSearch className="search-icon" />
          <input
            autoFocus
            type="text"
            className="search-input"
            placeholder="Search by name, email, or program…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
        </select>
        <select value={zakatFilter} onChange={(e) => setZakatFilter(e.target.value as ZakatFilter)}>
          <option value="all">Eligible: all</option>
          <option value="yes">Eligible: yes</option>
          <option value="no">Eligible: no</option>
        </select>
        <select value={consentFilter} onChange={(e) => setConsentFilter(e.target.value as ConsentFilter)}>
          <option value="all">Consent: all</option>
          <option value="yes">Consent: recorded</option>
        </select>
      </div>

      <div className="table-wrap">
        {rows.length > 0 && (
          <div className="table-scroll">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Program</th>
                  <th>Reviewed</th>
                  <th>Status</th>
                  <th>Eligible</th>
                  <th>Consent</th>
                  <th>Award</th>
                  <th>Redeemed discount</th>
                  <th>Covered by Zakat</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const s = row.scholarship;
                  return (
                    <tr key={s.id} className="student-tr">
                      <td className="col-student">
                        <div className="student-identity">
                          <span className="avatar" aria-hidden="true">
                            {initials(s)}
                          </span>
                          <div>
                            <div className="student-name">{[s.firstName, s.lastName].filter(Boolean).join(" ") || s.email || "—"}</div>
                            <div className="student-email">{s.email || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td data-label="Program">{s.course || s.form || "—"}</td>
                      <td data-label="Reviewed">{formatDate(row.reviewMillis)}</td>
                      <td data-label="Status">
                        <span className={`status-pill ${row.status === "approved" ? "ok" : row.status === "denied" ? "danger" : "warn"}`}>
                          <span className="status-dot" />
                          {row.status === "unknown" ? "unset" : row.status}
                        </span>
                      </td>
                      <td data-label="Eligible">
                        {row.zakat === "unknown" ? (
                          <span className="status-pill warn">unset</span>
                        ) : (
                          <span className={row.zakat === "yes" ? "status-pill ok" : "source-chip"}>{row.zakat}</span>
                        )}
                      </td>
                      <td data-label="Consent">
                        {row.consented === "yes" ? (
                          <span className="status-pill ok">yes</span>
                        ) : (
                          <span className="source-chip">not recorded</span>
                        )}
                      </td>
                      <td data-label="Award">{s.need || "—"}</td>
                      <td data-label="Redeemed discount">
                        {row.match === null && "—"}
                        {row.match?.kind === "no-discount-found" && <span className="status-pill warn">Not redeemed yet</span>}
                        {row.match?.kind === "ambiguous" && <span className="status-pill warn">{row.match.redemptions.length} redemptions — review</span>}
                        {row.match?.kind === "matched" && (
                          <>
                            {row.match.redemption.promoCode}
                            <div className="student-email">
                              {row.match.redemption.productName}
                              {row.amountCovered !== null &&
                                row.match.redemption.amountValue < row.amountCovered &&
                                ` · payment plan, ${formatMoney(row.match.redemption.amountValue)} so far`}
                            </div>
                          </>
                        )}
                      </td>
                      <td data-label="Covered by Zakat">{row.amountCovered !== null ? formatMoney(row.amountCovered) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {rows.length === 0 && (
          <div className="empty-state">
            <IconInbox className="empty-icon" />
            <h2>No scholarships match</h2>
            <p>{filtersActive ? "Try adjusting your search or filters." : "No scholarship applications in scope yet."}</p>
          </div>
        )}
      </div>
    </main>
  );
}
