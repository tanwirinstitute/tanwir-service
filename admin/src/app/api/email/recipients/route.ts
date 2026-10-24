import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { resolveRecipients, type Audience } from "@/server/recipients";

interface RecipientsRequestBody {
  audience: Audience;
}

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  let body: RecipientsRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const audience = body.audience;
  const hasCourseFilter =
    audience?.type === "course" && Boolean((audience.productNames && audience.productNames.length > 0) || audience.academicYear || audience.semester);
  const hasEventFilter = audience?.type === "event" && typeof audience.productId === "string" && audience.productId.length > 0;
  if (
    !audience ||
    (audience.type !== "all" && audience.type !== "course" && audience.type !== "event") ||
    (audience.type === "course" && !hasCourseFilter) ||
    (audience.type === "event" && !hasEventFilter)
  ) {
    return NextResponse.json({ success: false, message: "Invalid audience" }, { status: 400 });
  }

  try {
    const recipients = await resolveRecipients(audience);
    return NextResponse.json({ success: true, recipients });
  } catch (error) {
    console.error("Failed to resolve email recipients:", error);
    return NextResponse.json(
      { success: false, message: "Failed to resolve recipients", error: (error as Error).message },
      { status: 500 }
    );
  }
}
