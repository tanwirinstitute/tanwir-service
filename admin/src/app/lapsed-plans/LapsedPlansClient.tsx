"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import SignOutButton from "../SignOutButton";
import { downloadBlob } from "../dashboard/exportAttendance";
import type { LapsedPlan, LapsedPlansReport } from "@/server/lapsedPlans";

function formatMoney(value: number): string {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

type StatusFilter = "all" | LapsedPlan["status"];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "at-risk", label: "At risk" },
  { value: "cancelled", label: "Cancelled" },
];

function fullName(plan: LapsedPlan): string {
  return [plan.firstName, plan.lastName].filter(Boolean).join(" ");
}

function initials(plan: LapsedPlan): string {
  const combined = [plan.firstName?.trim()?.[0], plan.lastName?.trim()?.[0]].filter(Boolean).join("");
  return (combined || plan.email[0] || "?").toUpperCase();
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

function IconClock({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function IconWallet({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M16 12.5h2" />
      <path d="M3 9.5h18" />
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

export default function LapsedPlansClient({ report, error }: { report: LapsedPlansReport | null; error: string | null }) {
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const products = useMemo(() => [...new Set(report?.plans.map((p) => p.productName) ?? [])].sort(), [report]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (report?.plans ?? []).filter(
      (p) =>
        (product === "all" || p.productName === product) &&
        (status === "all" || p.status === status) &&
        (!needle || [fullName(p), p.email, p.phone ?? ""].some((field) => field.toLowerCase().includes(needle)))
    );
  }, [report, query, product, status]);

  const atRiskCount = report?.plans.filter((p) => p.status === "at-risk").length ?? 0;
  const cancelledCount = (report?.plans.length ?? 0) - atRiskCount;
  const outstanding = rows.reduce((sum, p) => sum + p.expectedTotal - p.amountPaid, 0);

  const handleExport = useCallback(() => {
    const header = ["Status", "Name", "Email", "Phone", "Course", "Semester", "Installments paid", "Installment", "Paid", "Full price", "Outstanding", "Last payment", "Missed payment", "Cancels on"];
    const lines = rows.map((p) =>
      [
        p.status === "at-risk" ? "At risk" : "Cancelled",
        fullName(p),
        p.email,
        p.phone,
        p.productName,
        p.semester,
        p.installmentsPaid,
        p.installmentAmount.toFixed(2),
        p.amountPaid.toFixed(2),
        p.expectedTotal.toFixed(2),
        (p.expectedTotal - p.amountPaid).toFixed(2),
        p.lastPaymentOn.slice(0, 10),
        p.missedPaymentOn.slice(0, 10),
        p.cancelsOn.slice(0, 10),
      ]
        .map(csvCell)
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `lapsed-payment-plans-${report?.academicYear}.csv`);
  }, [rows, report]);

  if (error || !report) {
    return (
      <main className="dashboard-shell">
        <Image src="/logo.webp" alt="Tanwir Institute" width={37} height={40} className="brand-logo skel-logo" priority />
        <div className="state-card state-card-error">
          <IconAlertTriangle className="state-icon" />
          <h2>Couldn&apos;t load payment plans from Squarespace</h2>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Link href="/" className="brand brand-link">
          <Image src="/logo.webp" alt="Tanwir Institute" width={37} height={40} className="brand-logo" priority />
          <div>
            <h1>Lapsed Payment Plans</h1>
            <p className="dashboard-subtitle">
              {report.academicYear} plans with a missed installment. Squarespace cancels a plan 15 days after a missed payment.
            </p>
          </div>
        </Link>
        <div className="dashboard-header-actions">
          <button
            type="button"
            className="ec-btn"
            onClick={handleExport}
            disabled={rows.length === 0}
            title="Exports the students currently shown below as a CSV"
          >
            Export CSV
          </button>
          <SignOutButton />
        </div>
      </header>

      <div className="stat-grid">
        <StatCard icon={<IconClock className="stat-icon-svg" />} label="At risk: reach out" value={atRiskCount} />
        <StatCard icon={<IconUsers className="stat-icon-svg" />} label="Cancelled: fix manually" value={cancelledCount} />
        <StatCard icon={<IconWallet className="stat-icon-svg" />} label="Outstanding" value={formatMoney(outstanding)} />
      </div>

      {report.productsMissingListPrice.length > 0 && (
        <div className="state-card">
          <IconAlertTriangle className="state-icon" />
          <p>
            Not checked, because these courses have no list price in <code>coursePricing.ts</code>:{" "}
            {report.productsMissingListPrice.join(", ")}.
          </p>
        </div>
      )}

      <div className="filter-bar">
        <div className="search-field">
          <IconSearch className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, email, or phone…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="segmented" role="group" aria-label="Plan status">
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={status === option.value ? "segmented-btn active" : "segmented-btn"}
              onClick={() => setStatus(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <select value={product} onChange={(event) => setProduct(event.target.value)}>
          <option value="all">All courses</option>
          {products.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="table-wrap">
        {rows.length > 0 ? (
          <div className="table-scroll">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Student</th>
                  <th>Phone</th>
                  <th>Course</th>
                  <th>Paid</th>
                  <th>Outstanding</th>
                  <th>Missed payment</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.lineItemId} className="student-tr">
                    <td data-label="Status">
                      <span className={p.status === "at-risk" ? "status-pill warn" : "status-pill danger"}>
                        <span className="status-dot" aria-hidden="true" />
                        {p.status === "at-risk" ? `${daysUntil(p.cancelsOn)} days left` : "Cancelled"}
                      </span>
                      <div className="student-email">
                        {p.status === "at-risk" ? `Cancels ${formatDate(p.cancelsOn)}` : `On ${formatDate(p.cancelsOn)}`}
                      </div>
                    </td>
                    <td className="col-student">
                      <div className="student-identity">
                        <span className="avatar" aria-hidden="true">
                          {initials(p)}
                        </span>
                        <div>
                          <div className="student-name">{fullName(p) || p.email}</div>
                          <div className="student-email">{p.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="col-phone" data-label="Phone">
                      {p.phone || "—"}
                    </td>
                    <td data-label="Course">
                      {p.productName}
                      <div className="student-email">{p.semester}</div>
                    </td>
                    <td data-label="Paid">
                      {formatMoney(p.amountPaid)} of {formatMoney(p.expectedTotal)}
                      <div className="student-email">
                        {p.installmentsPaid} × {formatMoney(p.installmentAmount)}
                      </div>
                    </td>
                    <td data-label="Outstanding">{formatMoney(p.expectedTotal - p.amountPaid)}</td>
                    <td data-label="Missed payment">
                      {formatDate(p.missedPaymentOn)}
                      <div className="student-email">Last paid {formatDate(p.lastPaymentOn)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <IconInbox className="empty-icon" />
            <h2>{report.plans.length === 0 ? "No missed payments" : "No students match"}</h2>
            <p>
              {report.plans.length === 0
                ? "Everyone on a payment plan this year is paid up or still paying."
                : "Try adjusting your search, status, or course filter."}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
