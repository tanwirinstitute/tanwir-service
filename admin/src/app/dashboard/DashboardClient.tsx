"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { signInWithCustomToken } from "firebase/auth";
import { collection, collectionGroup, doc, onSnapshot, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { getClientAuth, getClientDb } from "@/lib/firebaseClient";
import { ACTIVE_REGISTRATION_ACADEMIC_YEAR, isAcademicYearAtOrAfter } from "@/server/academicTerm";
import type { CourseRecord, StudentRecord } from "@/types/student";

type CourseWithId = CourseRecord & { id: string };
type StudentWithCourses = StudentRecord & { id: string; courses: CourseWithId[] };

type YearFilter = "upcoming" | "all" | string;
type StatusFilter = "all" | "needs-pickup" | "picked-up";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs-pickup", label: "Needs pickup" },
  { value: "picked-up", label: "Picked up" },
];

function formatTimestamp(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function courseDetail(course: CourseWithId): string {
  return Object.entries(course.variantOptions)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
}

function courseMatchesYear(course: CourseWithId, yearFilter: YearFilter): boolean {
  if (yearFilter === "all") return true;
  if (yearFilter === "upcoming") return isAcademicYearAtOrAfter(course.academicYear, ACTIVE_REGISTRATION_ACADEMIC_YEAR);
  return course.academicYear === yearFilter;
}

function courseMatchesStatus(course: CourseWithId, statusFilter: StatusFilter): boolean {
  if (statusFilter === "all") return true;
  if (statusFilter === "needs-pickup") return !course.materialsPickedUp;
  return Boolean(course.materialsPickedUp);
}

function initials(student: { firstName: string | null; lastName: string | null; email: string }): string {
  const first = student.firstName?.trim()?.[0];
  const last = student.lastName?.trim()?.[0];
  const combined = [first, last].filter(Boolean).join("");
  return (combined || student.email[0] || "?").toUpperCase();
}

/* --- Icons: hand-rolled inline SVGs (no icon-font/emoji, no extra dependency) --- */

type IconProps = { className?: string };

function IconSearch({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.2" y2="16.2" />
    </svg>
  );
}

function IconChevronRight({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 6 15 12 9 18" />
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

function IconBookOpen({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5c2-1 5-1 8 .5 3-1.5 6-1.5 8-.5v13c-2-1-5-1-8 .5-3-1.5-6-1.5-8-.5z" />
      <line x1="12" y1="6" x2="12" y2="19" />
    </svg>
  );
}

function IconPackage({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5" />
      <line x1="12" y1="12" x2="12" y2="21" />
    </svg>
  );
}

function IconCheckCircle({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="8 12.3 10.8 15.3 16 9" />
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

function IconLoader({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3a9 9 0 106.36 2.64" />
    </svg>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone = "default",
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "default" | "warn" | "ok";
  onClick?: () => void;
  active?: boolean;
}) {
  const className = ["stat-card", `stat-card-${tone}`, onClick ? "stat-card-actionable" : "", active ? "stat-card-active" : ""]
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

function DashboardSkeleton() {
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

export default function DashboardClient({ customToken }: { customToken: string }) {
  const [signedIn, setSignedIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [students, setStudents] = useState<Map<string, StudentRecord>>(new Map());
  const [courses, setCourses] = useState<Map<string, CourseWithId[]>>(new Map());
  const [query, setQuery] = useState("");
  const [yearFilter, setYearFilter] = useState<YearFilter>("upcoming");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    signInWithCustomToken(getClientAuth(), customToken)
      .then(() => setSignedIn(true))
      .catch((error) => setAuthError((error as Error).message));
  }, [customToken]);

  useEffect(() => {
    if (!signedIn) return;
    const db = getClientDb();

    const unsubStudents = onSnapshot(collection(db, "students"), (snapshot) => {
      const next = new Map<string, StudentRecord>();
      snapshot.forEach((docSnap) => next.set(docSnap.id, docSnap.data() as StudentRecord));
      setStudents(next);
    });

    // collectionGroup matches by collection name across the whole database —
    // this Firestore project also has an unrelated top-level "courses"
    // collection (a curriculum catalog), so only keep docs actually nested
    // under students/. Firestore security rules already restrict reads to
    // students/{id}/courses/{id}, so those unrelated docs won't come through
    // anyway; this is defensive.
    const unsubCourses = onSnapshot(collectionGroup(db, "courses"), (snapshot) => {
      const next = new Map<string, CourseWithId[]>();
      snapshot.forEach((docSnap) => {
        if (!docSnap.ref.path.startsWith("students/")) return;
        const studentId = docSnap.ref.parent.parent!.id;
        const list = next.get(studentId) ?? [];
        list.push({ id: docSnap.id, ...(docSnap.data() as CourseRecord) });
        next.set(studentId, list);
      });
      setCourses(next);
    });

    return () => {
      unsubStudents();
      unsubCourses();
    };
  }, [signedIn]);

  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    courses.forEach((list) => list.forEach((c) => years.add(c.academicYear)));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [courses]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    const all: StudentWithCourses[] = Array.from(students.entries()).map(([id, student]) => ({
      id,
      ...student,
      courses: courses.get(id) ?? [],
    }));

    return all
      .map((student) => {
        const matchingCourses = student.courses
          .filter((c) => courseMatchesYear(c, yearFilter) && courseMatchesStatus(c, statusFilter))
          .sort((a, b) => (a.purchasedOn < b.purchasedOn ? 1 : -1));
        return { ...student, matchingCourses };
      })
      .filter((student) => {
        if (student.matchingCourses.length === 0) return false;
        if (!q) return true;
        return [student.email, student.firstName, student.lastName, student.phone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => a.email.localeCompare(b.email));
  }, [students, courses, query, yearFilter, statusFilter]);

  const registrationStats = useMemo(() => {
    let needsPickup = 0;
    let pickedUp = 0;
    rows.forEach((student) =>
      student.matchingCourses.forEach((course) => (course.materialsPickedUp ? pickedUp++ : needsPickup++))
    );
    return { total: needsPickup + pickedUp, needsPickup, pickedUp };
  }, [rows]);

  async function togglePickup(studentId: string, course: CourseWithId) {
    const key = `${studentId}/${course.id}`;
    const nextPickedUp = !course.materialsPickedUp;

    setPending((prev) => new Set(prev).add(key));
    try {
      await updateDoc(doc(getClientDb(), "students", studentId, "courses", course.id), {
        materialsPickedUp: nextPickedUp,
        materialsPickedUpAt: nextPickedUp ? serverTimestamp() : null,
      });
    } catch (error) {
      console.error(`Failed to update pickup status for ${key}:`, error);
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  if (authError) {
    return (
      <main className="dashboard-shell">
        <Image src="/logo.webp" alt="Tanwir Institute" width={37} height={40} className="brand-logo skel-logo" priority />
        <div className="state-card state-card-error">
          <IconAlertTriangle className="state-icon" />
          <h2>Couldn&apos;t sign in</h2>
          <p>{authError}</p>
        </div>
      </main>
    );
  }

  if (!signedIn) {
    return <DashboardSkeleton />;
  }

  const filtersActive = query.trim() !== "" || statusFilter !== "all";

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div className="brand">
          <Image src="/logo.webp" alt="Tanwir Institute" width={37} height={40} className="brand-logo" priority />
          <div>
            <h1>Registrations</h1>
            <p className="dashboard-subtitle">Track course registrations and materials pickup</p>
          </div>
        </div>
      </header>

      <div className="stat-grid">
        <StatCard icon={<IconUsers className="stat-icon-svg" />} label="Students" value={rows.length} />
        <StatCard icon={<IconBookOpen className="stat-icon-svg" />} label="Registrations" value={registrationStats.total} />
        <StatCard
          icon={<IconPackage className="stat-icon-svg" />}
          label="Needs pickup"
          value={registrationStats.needsPickup}
          tone="warn"
          onClick={() => setStatusFilter(statusFilter === "needs-pickup" ? "all" : "needs-pickup")}
          active={statusFilter === "needs-pickup"}
        />
        <StatCard
          icon={<IconCheckCircle className="stat-icon-svg" />}
          label="Picked up"
          value={registrationStats.pickedUp}
          tone="ok"
          onClick={() => setStatusFilter(statusFilter === "picked-up" ? "all" : "picked-up")}
          active={statusFilter === "picked-up"}
        />
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

        <label className="filter-field">
          <span>Registration</span>
          <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
            <option value="upcoming">{ACTIVE_REGISTRATION_ACADEMIC_YEAR} &amp; later (active)</option>
            <option value="all">All years</option>
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>

        <div className="segmented" role="group" aria-label="Materials status">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={statusFilter === option.value ? "segmented-btn active" : "segmented-btn"}
              aria-pressed={statusFilter === option.value}
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        {rows.length > 0 && (
        <div className="table-scroll">
          <table className="crm-table">
            <thead>
              <tr>
                <th className="col-status" aria-label="Status" />
                <th>Student</th>
                <th>Phone</th>
                <th>Gender</th>
                <th>Student type</th>
                <th>Courses</th>
                <th className="col-chevron" aria-label="Expand" />
              </tr>
            </thead>
            <tbody>
              {rows.map((student) => {
                const needsPickup = student.matchingCourses.some((c) => !c.materialsPickedUp);
                const isExpanded = expandedId === student.id;
                // Gender/student-type are per-person, not per-course, but only
                // captured at checkout — take them from the most relevant
                // (first) matching course rather than repeating a lookup.
                const gender = student.matchingCourses.find((c) => c.gender)?.gender;
                const studentType = student.matchingCourses.find((c) => c.studentType)?.studentType;

                return (
                  <Fragment key={student.id}>
                    <tr
                      className={isExpanded ? "student-tr expanded" : "student-tr"}
                      onClick={() => setExpandedId(isExpanded ? null : student.id)}
                    >
                      <td className="col-status">
                        <span className={needsPickup ? "status-pill warn" : "status-pill ok"}>
                          <span className="status-dot" aria-hidden="true" />
                          {needsPickup ? "Needs pickup" : "All set"}
                        </span>
                      </td>
                      <td className="col-student">
                        <div className="student-identity">
                          <span className="avatar" aria-hidden="true">
                            {initials(student)}
                          </span>
                          <div>
                            <div className="student-name">
                              {[student.firstName, student.lastName].filter(Boolean).join(" ") || student.email}
                            </div>
                            <div className="student-email">{student.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="col-phone" data-label="Phone">{student.phone || "—"}</td>
                      <td className="col-meta col-gender" data-label="Gender">{gender || "—"}</td>
                      <td className="col-meta col-student-type" data-label="Student type">{studentType || "—"}</td>
                      <td className="col-courses" data-label="Courses">
                        <span className="course-badge">{student.matchingCourses.length}</span>
                      </td>
                      <td className="col-chevron">
                        <IconChevronRight className="chevron-icon" />
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="course-detail-row">
                        <td colSpan={7}>
                          <table className="course-table">
                            <thead>
                              <tr>
                                <th>Course</th>
                                <th>Term</th>
                                <th>Details</th>
                                <th>Purchased</th>
                                <th>Materials</th>
                              </tr>
                            </thead>
                            <tbody>
                              {student.matchingCourses.map((course) => {
                                const key = `${student.id}/${course.id}`;
                                const detail = courseDetail(course);
                                const pickedUpAt = formatTimestamp(course.materialsPickedUpAt);
                                const isPending = pending.has(key);

                                return (
                                  <tr key={course.id}>
                                    <td className="col-course-name" data-label="Course">{course.productName}</td>
                                    <td className="col-term" data-label="Term">
                                      {course.semester} · {course.academicYear}
                                    </td>
                                    <td className="col-detail" data-label="Details">{detail || "—"}</td>
                                    <td className="col-purchased" data-label="Purchased">{formatDate(course.purchasedOn)}</td>
                                    <td className="col-materials" data-label="Materials">
                                      <button
                                        type="button"
                                        className={course.materialsPickedUp ? "pickup-btn picked-up" : "pickup-btn"}
                                        disabled={isPending}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          togglePickup(student.id, course);
                                        }}
                                      >
                                        {isPending ? (
                                          <IconLoader className="btn-icon spin" />
                                        ) : course.materialsPickedUp ? (
                                          <IconCheck className="btn-icon" />
                                        ) : null}
                                        {isPending
                                          ? "Saving…"
                                          : course.materialsPickedUp
                                            ? `Picked up${pickedUpAt ? ` · ${pickedUpAt}` : ""}`
                                            : "Mark picked up"}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        )}

        {rows.length === 0 && (
          <div className="empty-state">
            <IconInbox className="empty-icon" />
            <h2>No registrations match</h2>
            <p>{filtersActive ? "Try adjusting your search or filters." : "No students have registered yet."}</p>
          </div>
        )}
      </div>
    </main>
  );
}
