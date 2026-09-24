"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, collectionGroup, onSnapshot, Timestamp } from "firebase/firestore";
import { getClientAuth, getClientDb } from "@/lib/firebaseClient";
import SignOutButton from "../SignOutButton";
import type { ScholarshipRecord } from "@/types/scholarship";
import type { CourseRecord } from "@/types/student";
import {
  computeListPrices,
  formatMoney,
  isOnOrAfterCutoff,
  matchScholarshipPurchase,
  normalizeStatus,
  normalizeZakat,
  scholarshipProgramGroup,
  SCHOLARSHIP_CUTOFF_ISO,
  type CoursePurchaseCandidate,
  type ScholarshipMatch,
} from "@/lib/scholarshipMatching";

type ScholarshipWithId = ScholarshipRecord & { id: string };
type ZakatFilter = "all" | "yes" | "no";
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
  zakat: "yes" | "no" | "unknown";
  reviewMillis: number | null;
  match: ScholarshipMatch | null; // null when not eligible for matching (not approved+zakat=yes)
  amountCovered: number | null;
  listPrice: number | null;
}

export default function ScholarshipsClient() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [scholarships, setScholarships] = useState<Map<string, ScholarshipRecord>>(new Map());
  const [courses, setCourses] = useState<Map<string, CoursePurchaseCandidate[]>>(new Map());
  const [allCourseProducts, setAllCourseProducts] = useState<{ productName: string; pricePaidValue: number }[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("approved");
  const [zakatFilter, setZakatFilter] = useState<ZakatFilter>("all");

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
        const byStudent = new Map<string, CoursePurchaseCandidate[]>();
        const allProducts: { productName: string; pricePaidValue: number }[] = [];
        snapshot.forEach((docSnap) => {
          if (!docSnap.ref.path.startsWith("students/")) return;
          const studentId = docSnap.ref.parent.parent!.id;
          const data = docSnap.data() as CourseRecord;
          const pricePaidValue = Number.parseFloat(data.pricePaid?.value ?? "");
          if (Number.isNaN(pricePaidValue)) return;
          const candidate: CoursePurchaseCandidate = {
            id: docSnap.id,
            productName: data.productName,
            pricePaidValue,
            purchasedOnMillis: data.purchasedOn ? Date.parse(data.purchasedOn) : null,
          };
          const list = byStudent.get(studentId) ?? [];
          list.push(candidate);
          byStudent.set(studentId, list);
          allProducts.push({ productName: data.productName, pricePaidValue });
        });
        setCourses(byStudent);
        setAllCourseProducts(allProducts);
      },
      onError
    );

    return () => {
      unsubScholarships();
      unsubCourses();
    };
  }, [signedIn, signOutAndRedirect]);

  const listPrices = useMemo(() => computeListPrices(allCourseProducts), [allCourseProducts]);

  const rows = useMemo<Row[]>(() => {
    return Array.from(scholarships.entries())
      .map(([id, s]): Row => {
        const status = normalizeStatus(s.status);
        const zakat = normalizeZakat(s.zakat);
        const reviewMillis = toMillis(s.reviewDate) ?? toMillis(s.submittedAt);

        const eligibleForMatching = status === "approved" && zakat === "yes";
        if (!eligibleForMatching) {
          return { scholarship: { id, ...s }, status, zakat, reviewMillis, match: null, amountCovered: null, listPrice: null };
        }

        const studentId = (s.email ?? "").trim().toLowerCase();
        const programGroup = scholarshipProgramGroup(s.course);
        const studentCourses = courses.get(studentId) ?? [];
        const match = matchScholarshipPurchase(programGroup, reviewMillis, studentCourses);

        let amountCovered: number | null = null;
        let listPrice: number | null = null;
        if (match.kind === "matched") {
          listPrice = listPrices.get(match.course.productName) ?? null;
          if (listPrice !== null) {
            amountCovered = Math.max(0, listPrice - match.course.pricePaidValue);
          }
        }

        return { scholarship: { id, ...s }, status, zakat, reviewMillis, match, amountCovered, listPrice };
      })
      .filter((row) => isOnOrAfterCutoff(row.reviewMillis))
      .filter((row) => statusFilter === "all" || row.status === statusFilter)
      .filter((row) => zakatFilter === "all" || row.zakat === zakatFilter)
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
  }, [scholarships, courses, listPrices, statusFilter, zakatFilter, query]);

  const summary = useMemo(() => {
    const inScope = Array.from(scholarships.entries())
      .map(([id, s]) => {
        const status = normalizeStatus(s.status);
        const zakat = normalizeZakat(s.zakat);
        const reviewMillis = toMillis(s.reviewDate) ?? toMillis(s.submittedAt);
        return { id, s, status, zakat, reviewMillis };
      })
      .filter((r) => isOnOrAfterCutoff(r.reviewMillis));

    const approved = inScope.filter((r) => r.status === "approved");
    const zakatConsented = approved.filter((r) => r.zakat === "yes");

    let totalCovered = 0;
    let needsReview = 0;
    for (const r of zakatConsented) {
      const studentId = (r.s.email ?? "").trim().toLowerCase();
      const programGroup = scholarshipProgramGroup(r.s.course);
      const studentCourses = courses.get(studentId) ?? [];
      const match = matchScholarshipPurchase(programGroup, r.reviewMillis, studentCourses);
      if (match.kind === "matched") {
        const listPrice = listPrices.get(match.course.productName);
        if (listPrice !== undefined) {
          totalCovered += Math.max(0, listPrice - match.course.pricePaidValue);
        } else {
          needsReview += 1;
        }
      } else {
        needsReview += 1;
      }
    }

    return {
      approvedCount: approved.length,
      zakatConsentedCount: zakatConsented.length,
      totalCovered,
      needsReview,
    };
  }, [scholarships, courses, listPrices]);

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

  const filtersActive = query.trim() !== "" || statusFilter !== "approved" || zakatFilter !== "all";

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
          label="Zakat-consented"
          value={summary.zakatConsentedCount}
          onClick={() => setZakatFilter(zakatFilter === "yes" ? "all" : "yes")}
          active={zakatFilter === "yes"}
        />
        <StatCard icon={<IconHeart className="stat-icon-svg" />} label="Covered by Zakat (matched)" value={formatMoney(summary.totalCovered)} />
        <StatCard icon={<IconAlertTriangle className="stat-icon-svg" />} label="Needs manual review" value={summary.needsReview} />
      </div>

      <p className="dashboard-subtitle" style={{ marginTop: "-0.5rem" }}>
        &quot;Covered by Zakat&quot; is a best-effort match against actual course purchases (same program, purchased at
        or after the award&apos;s review date), priced against the highest amount anyone paid for that same course —
        not the order the discount code was redeemed on, since that link isn&apos;t recorded anywhere. Records that
        couldn&apos;t be matched to exactly one purchase are excluded from the total and flagged &quot;Needs review&quot;
        below.
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
          <option value="all">Zakat: all</option>
          <option value="yes">Zakat: yes</option>
          <option value="no">Zakat: no</option>
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
                  <th>Zakat</th>
                  <th>Award</th>
                  <th>Matched purchase</th>
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
                      <td data-label="Zakat">
                        {row.zakat === "unknown" ? (
                          <span className="status-pill warn">unset</span>
                        ) : (
                          <span className={row.zakat === "yes" ? "status-pill ok" : "source-chip"}>{row.zakat}</span>
                        )}
                      </td>
                      <td data-label="Award">{s.need || "—"}</td>
                      <td data-label="Matched purchase">
                        {row.match === null && "—"}
                        {row.match?.kind === "no-purchase-found" && <span className="status-pill warn">Not yet enrolled</span>}
                        {row.match?.kind === "ambiguous" && <span className="status-pill warn">{row.match.courses.length} candidates — review</span>}
                        {row.match?.kind === "matched" && (
                          <>
                            {row.match.course.productName}
                            <div className="student-email">
                              paid {formatMoney(row.match.course.pricePaidValue)}
                              {row.listPrice !== null && ` of ${formatMoney(row.listPrice)}`}
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
