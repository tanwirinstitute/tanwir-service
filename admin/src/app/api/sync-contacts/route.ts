import { NextRequest, NextResponse } from "next/server";
import { hasValidSyncToken } from "@/server/syncAuth";
import { runContactSync } from "@/server/contactSync";
import { contactSyncRunCounter, contactSyncContactsWritten } from "@/lib/telemetry";

export async function POST(request: NextRequest) {
  if (!hasValidSyncToken(request)) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runContactSync();
    contactSyncRunCounter.add(1, { outcome: summary.errors > 0 ? "partial" : "success" });
    contactSyncContactsWritten.record(summary.contactsWritten);
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error("Contact sync failed:", error);
    contactSyncRunCounter.add(1, { outcome: "error" });
    return NextResponse.json(
      { success: false, message: "Sync failed", error: (error as Error).message },
      { status: 500 }
    );
  }
}
