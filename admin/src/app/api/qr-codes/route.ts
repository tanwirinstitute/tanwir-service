import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { createQrLink, listQrLinks, QrLinkError } from "@/server/qrLinks";

// Reads/writes the session-gated QR link store; never statically cached.
export const dynamic = "force-dynamic";

interface CreateBody {
  label?: string;
  targetUrl?: string;
  slug?: string;
}

export async function GET() {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  try {
    const links = await listQrLinks();
    return NextResponse.json({ success: true, links });
  } catch (error) {
    console.error("Failed to list QR links:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load QR links", error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.label !== "string" || typeof body.targetUrl !== "string") {
    return NextResponse.json({ success: false, message: "label and targetUrl are required" }, { status: 400 });
  }

  try {
    const link = await createQrLink({
      label: body.label,
      targetUrl: body.targetUrl,
      slug: typeof body.slug === "string" ? body.slug : undefined,
      createdBy: { uid: session.uid, email: session.email, name: session.name },
    });
    return NextResponse.json({ success: true, link });
  } catch (error) {
    if (error instanceof QrLinkError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    console.error("Failed to create QR link:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create QR link", error: (error as Error).message },
      { status: 500 }
    );
  }
}
