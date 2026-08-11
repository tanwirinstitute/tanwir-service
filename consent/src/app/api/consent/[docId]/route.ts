import { NextRequest, NextResponse } from "next/server";
import { recordConsent } from "@/server/consent";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params;

  try {
    const result = await recordConsent(docId);

    if (result.status === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ status: result.status }, { status: 200 });
  } catch (error) {
    console.error(`Failed to record consent for doc ${docId}:`, error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
