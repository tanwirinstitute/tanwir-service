import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { deleteQrLink, normalizeSlug, QrLinkError, updateQrLink } from "@/server/qrLinks";

// Writes the session-gated QR link store; never statically cached.
export const dynamic = "force-dynamic";

interface UpdateBody {
  label?: string;
  targetUrl?: string;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  let body: UpdateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const slug = normalizeSlug((await params).slug);
    const link = await updateQrLink(slug, {
      label: typeof body.label === "string" ? body.label : undefined,
      targetUrl: typeof body.targetUrl === "string" ? body.targetUrl : undefined,
    });
    return NextResponse.json({ success: true, link });
  } catch (error) {
    if (error instanceof QrLinkError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    console.error("Failed to update QR link:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update QR link", error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  try {
    const slug = normalizeSlug((await params).slug);
    await deleteQrLink(slug);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof QrLinkError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    console.error("Failed to delete QR link:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete QR link", error: (error as Error).message },
      { status: 500 }
    );
  }
}
