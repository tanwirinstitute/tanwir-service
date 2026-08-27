import { NextRequest, NextResponse } from "next/server";
import { hasValidSyncToken } from "@/server/syncAuth";
import { runCourseSync } from "@/server/courseSync";

async function parseSince(request: NextRequest): Promise<string | undefined> {
  try {
    const body = await request.json();
    return typeof body?.since === "string" ? body.since : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  if (!hasValidSyncToken(request)) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  const since = await parseSince(request);

  try {
    const summary = await runCourseSync(since ? { since } : undefined);
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error("Squarespace course sync failed:", error);
    return NextResponse.json(
      { success: false, message: "Sync failed", error: (error as Error).message },
      { status: 500 }
    );
  }
}
