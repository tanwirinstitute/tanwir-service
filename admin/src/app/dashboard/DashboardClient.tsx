"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { collection, collectionGroup, doc, onSnapshot, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { getClientAuth, getClientDb } from "@/lib/firebaseClient";
import { ACTIVE_REGISTRATION_ACADEMIC_YEAR, isAcademicYearAtOrAfter } from "@/server/academicTerm";
import type { CourseRecord, StudentRecord } from "@/types/student";

type CourseWithId = CourseRecord & { id: string };
type StudentWithCourses = StudentRecord & { id: string; courses: CourseWithId[] };

type YearFilter = "upcoming" | "all" | string;
type StatusFilter = "all" | "needs-pickup" | "picked-up";

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

  const needsPickupCount = useMemo(
    () => rows.filter((r) => r.matchingCourses.some((c) => !c.materialsPickedUp)).length,
    [rows]
  );

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
        <p className="dashboard-error">Failed to authenticate: {authError}</p>
      </main>
    );
  }

  if (!signedIn) {
    return (
      <main className="dashboard-shell">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <h1>Students</h1>
        <div className="kpi-chips">
          <span className="kpi-chip">
            <strong>{rows.length}</strong> shown
          </span>
          <span className={needsPickupCount > 0 ? "kpi-chip warn" : "kpi-chip"}>
            <strong>{needsPickupCount}</strong> need pickup
          </span>
        </div>
      </header>

      <div className="filter-bar">
        <input
          autoFocus
          type="text"
          className="search-input"
          placeholder="Search by name, email, or phone…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

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

        <label className="filter-field">
          <span>Materials</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">All</option>
            <option value="needs-pickup">Needs pickup</option>
            <option value="picked-up">Picked up</option>
          </select>
        </label>
      </div>

      <div className="table-wrap">
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
                        {needsPickup ? "Needs pickup" : "All set"}
                      </span>
                    </td>
                    <td className="col-student">
                      <div className="student-name">
                        {[student.firstName, student.lastName].filter(Boolean).join(" ") || student.email}
                      </div>
                      <div className="student-email">{student.email}</div>
                    </td>
                    <td className="col-phone" data-label="Phone">{student.phone || "—"}</td>
                    <td className="col-meta col-gender" data-label="Gender">{gender || "—"}</td>
                    <td className="col-meta col-student-type" data-label="Student type">{studentType || "—"}</td>
                    <td className="col-courses" data-label="Courses">
                      <span className="course-badge">{student.matchingCourses.length}</span>
                    </td>
                    <td className="col-chevron">{isExpanded ? "▾" : "▸"}</td>
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
                                      disabled={pending.has(key)}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        togglePickup(student.id, course);
                                      }}
                                    >
                                      {course.materialsPickedUp
                                        ? `Picked up ✓${pickedUpAt ? ` (${pickedUpAt})` : ""}`
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

        {rows.length === 0 && <p className="no-results">No students match these filters.</p>}
      </div>
    </main>
  );
}
