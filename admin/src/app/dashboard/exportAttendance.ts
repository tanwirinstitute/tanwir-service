import { normalizeCourseName } from "@/lib/coursePrograms";
import { courseSessions } from "@/lib/courseSessions";
import { enrolleeNames } from "@/lib/enrolleeNames";

export interface AttendanceCourseEntry {
  productName: string;
  semester: string;
  academicYear: string;
  gender: string | null;
  studentType: string | null;
  formResponses: Record<string, string>;
}

export interface AttendanceStudent {
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  matchingCourses: AttendanceCourseEntry[];
}

interface RosterRow {
  name: string;
  email: string;
  phone: string;
  gender: string;
  studentType: string;
}

interface CourseGroup {
  courseName: string;
  semester: string;
  academicYear: string;
  rows: RosterRow[];
}

// Excel worksheet names: <=31 chars, no \ / ? * [ ] :, not blank, unique
// (case-insensitively) within the workbook.
const INVALID_SHEET_CHARS = /[\\/?*[\]:]/g;
const MAX_SHEET_NAME_LENGTH = 31;

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(INVALID_SHEET_CHARS, "-").trim();
  return (cleaned || "Sheet").slice(0, MAX_SHEET_NAME_LENGTH);
}

function uniqueSheetName(base: string, used: Set<string>): string {
  const sanitized = sanitizeSheetName(base);
  if (!used.has(sanitized.toLowerCase())) {
    used.add(sanitized.toLowerCase());
    return sanitized;
  }
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = sanitized.slice(0, MAX_SHEET_NAME_LENGTH - suffix.length) + suffix;
    if (!used.has(candidate.toLowerCase())) {
      used.add(candidate.toLowerCase());
      return candidate;
    }
  }
}

/** Fall < Spring < Summer < Full Year < anything else (alphabetical), for a stable tab order. */
const SEMESTER_ORDER = ["Fall", "Spring", "Summer", "Full Year"];
function semesterRank(semester: string): number {
  const i = SEMESTER_ORDER.indexOf(semester);
  return i === -1 ? SEMESTER_ORDER.length : i;
}

function studentName(student: AttendanceStudent): string {
  return [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || student.email;
}

/**
 * Flattens the given students/courses into one roster group per (course,
 * session, academic year) — a "Full Year" enrollment in a split-session
 * program (courseSessions) lands in both its Fall and Spring group, so a
 * student who bought the whole year shows up on both tabs' rosters, each
 * with its own attendance sheet.
 */
function groupForAttendance(students: AttendanceStudent[]): CourseGroup[] {
  const groups = new Map<string, CourseGroup>();

  for (const student of students) {
    for (const course of student.matchingCourses) {
      const courseName = normalizeCourseName(course.productName);
      for (const session of courseSessions(course.productName, course.semester)) {
        const key = `${courseName}__${course.academicYear}__${session.semester}`;
        let group = groups.get(key);
        if (!group) {
          group = { courseName, semester: session.semester, academicYear: course.academicYear, rows: [] };
          groups.set(key, group);
        }
        // A purchase can register more than one person (a parent buying
        // Taqwa for Teens for several kids in one checkout) — one roster row
        // per named enrollee, each still carrying the purchaser's own
        // contact info since that's who checkout actually captured it from.
        // Falls back to the purchaser's own name when the course carries no
        // such answer (most courses, and most Taqwa purchases too).
        const names = enrolleeNames(course.formResponses);
        for (const name of names.length > 0 ? names : [studentName(student)]) {
          group.rows.push({
            name,
            email: student.email,
            phone: student.phone || "",
            gender: course.gender || "",
            studentType: course.studentType || "",
          });
        }
      }
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.academicYear !== b.academicYear) return b.academicYear.localeCompare(a.academicYear);
    if (a.courseName !== b.courseName) return a.courseName.localeCompare(b.courseName);
    return semesterRank(a.semester) - semesterRank(b.semester);
  });
}

const ROSTER_COLUMNS = [
  { header: "Name", key: "name", width: 26 },
  { header: "Email", key: "email", width: 30 },
  { header: "Phone", key: "phone", width: 16 },
  { header: "Gender", key: "gender", width: 10 },
  { header: "Student Type", key: "studentType", width: 16 },
] as const;

/**
 * Builds one attendance workbook, one tab per (course, session, academic
 * year) present in `students` — pass the dashboard's already-filtered rows
 * to have the export match exactly what's on screen. Returns a Blob ready to
 * hand to a download link; caller owns naming the file.
 */
export async function buildAttendanceWorkbook(students: AttendanceStudent[]): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Tanwir Institute Admin";
  workbook.created = new Date();

  const groups = groupForAttendance(students);
  const usedNames = new Set<string>();

  for (const group of groups) {
    const shortYear = group.academicYear.split("-").map((y) => y.slice(2)).join("-");
    const sheetName = uniqueSheetName(`${group.courseName} · ${group.semester} ${shortYear}`, usedNames);

    const sheet = workbook.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = [...ROSTER_COLUMNS];
    sheet.getRow(1).font = { bold: true };

    const sortedRows = [...group.rows].sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
    for (const row of sortedRows) sheet.addRow(row);
  }

  // No matching students/courses at all — still return a valid, openable
  // workbook rather than an empty buffer.
  if (groups.length === 0) {
    const sheet = workbook.addWorksheet("Attendance");
    sheet.columns = [...ROSTER_COLUMNS];
    sheet.getRow(1).font = { bold: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
