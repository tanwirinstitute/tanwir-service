import { NextRequest, NextResponse } from "next/server";
import { isValidAdminToken } from "@/server/adminAuth";
import { sendConsentEmailForApplicant } from "@/server/zakat";

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  if (!isValidAdminToken(bearerToken(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { docId } = await params;

  try {
    const result = await sendConsentEmailForApplicant(docId);

    if (result.status === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ status: result.status }, { status: 200 });
  } catch (error) {
    console.error(`Failed to send zakat consent email for doc ${docId}:`, error);
    // TEMP: surface the real cause in the response while debugging the
    // production 500. This endpoint is admin-token gated. Revert to the bare
    // { error: "internal_error" } once resolved.
    return NextResponse.json(
      {
        error: "internal_error",
        detail: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : undefined,
      },
      { status: 500 }
    );
  }
}
