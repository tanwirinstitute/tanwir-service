import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase";

/**
 * Dynamic QR links. Each doc is a short slug that the public redirect route
 * (`/qr/[slug]`) resolves to a destination URL at scan time, so a printed QR
 * code keeps working when an admin points it somewhere new. Written and read
 * only from server routes via the Admin SDK — never touched by client code —
 * so it needs no firestore.rules entry beyond the default deny.
 */
const COLLECTION = "qrLinks";

/** Slugs are what gets baked into printed codes: keep them short, lowercase
 * and URL-safe. Auto-generated ones use an unambiguous alphabet (no 0/o/1/l)
 * so a slug read off a printout can be retyped without guessing. */
const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const GENERATED_SLUG_LENGTH = 7;
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Slugs that must never resolve as QR links because they'd shadow (or be
 * shadowed by) real admin routes and static assets. */
const RESERVED_SLUGS = new Set(["api", "qr", "login", "dashboard", "email", "new", "edit"]);

export interface QrLinkActor {
  uid: string;
  email: string | null;
  name: string | null;
}

export interface QrLinkRecord {
  /** Doc id == slug — the immutable path segment encoded in the QR code. */
  slug: string;
  /** Admin-facing name ("Fall Open House flyer"), never shown to scanners. */
  label: string;
  /** Where a scan currently redirects. The one field meant to change. */
  targetUrl: string;
  scanCount: number;
  lastScannedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: QrLinkActor;
}

export class QrLinkError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function toIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

/** Only ever redirect somewhere a browser can safely follow: absolute
 * http(s). Anything else (javascript:, data:, relative paths) is rejected at
 * write time so the public redirect never has to reason about it. */
export function normalizeTargetUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new QrLinkError("A destination URL is required", 400);
  }
  const candidate = raw.trim();
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new QrLinkError("Destination must be an absolute URL (https://…)", 400);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new QrLinkError("Destination must use http or https", 400);
  }
  return url.toString();
}

export function normalizeSlug(raw: unknown): string {
  if (typeof raw !== "string") throw new QrLinkError("Invalid slug", 400);
  const slug = raw.trim().toLowerCase();
  if (!SLUG_PATTERN.test(slug)) {
    throw new QrLinkError("Slug must be 1-63 chars of a-z, 0-9 or hyphens (no leading/trailing hyphen)", 400);
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new QrLinkError(`"${slug}" is reserved and can't be used as a slug`, 400);
  }
  return slug;
}

function generateSlug(): string {
  const bytes = new Uint8Array(GENERATED_SLUG_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join("");
}

function mapRecord(slug: string, data: FirebaseFirestore.DocumentData): QrLinkRecord {
  return {
    slug,
    label: typeof data.label === "string" ? data.label : "",
    targetUrl: typeof data.targetUrl === "string" ? data.targetUrl : "",
    scanCount: typeof data.scanCount === "number" ? data.scanCount : 0,
    lastScannedAt: toIso(data.lastScannedAt),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: {
      uid: typeof data.createdBy?.uid === "string" ? data.createdBy.uid : "",
      email: typeof data.createdBy?.email === "string" ? data.createdBy.email : null,
      name: typeof data.createdBy?.name === "string" ? data.createdBy.name : null,
    },
  };
}

/** Every QR link, newest first. The console shows them all — an org's worth
 * of printed codes is dozens, not thousands, so no pagination. */
export async function listQrLinks(): Promise<QrLinkRecord[]> {
  const snapshot = await getDb().collection(COLLECTION).orderBy("createdAt", "desc").get();
  return snapshot.docs.map((doc) => mapRecord(doc.id, doc.data()));
}

export interface CreateQrLinkInput {
  label: string;
  targetUrl: string;
  /** Optional custom slug; auto-generated when omitted. */
  slug?: string;
  createdBy: QrLinkActor;
}

export async function createQrLink(input: CreateQrLinkInput): Promise<QrLinkRecord> {
  const targetUrl = normalizeTargetUrl(input.targetUrl);
  const label = input.label.trim();
  if (!label) throw new QrLinkError("A label is required", 400);

  const db = getDb();
  const wantsCustomSlug = typeof input.slug === "string" && input.slug.trim() !== "";
  const slug = wantsCustomSlug ? normalizeSlug(input.slug) : generateSlug();

  const ref = db.collection(COLLECTION).doc(slug);
  // create() (not set()) so a slug collision — a duplicate custom slug, or
  // the astronomically unlikely generated one — fails instead of silently
  // repointing an existing printed code.
  try {
    await ref.create({
      label,
      targetUrl,
      scanCount: 0,
      lastScannedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: input.createdBy,
    });
  } catch (error) {
    if ((error as { code?: number }).code === 6 /* ALREADY_EXISTS */) {
      throw new QrLinkError(`Slug "${slug}" is already in use`, 409);
    }
    throw error;
  }

  const doc = await ref.get();
  return mapRecord(slug, doc.data() as FirebaseFirestore.DocumentData);
}

export interface UpdateQrLinkInput {
  label?: string;
  targetUrl?: string;
}

/** Updates label and/or destination. The slug never changes — that's the
 * whole point of a dynamic QR code. */
export async function updateQrLink(slug: string, input: UpdateQrLinkInput): Promise<QrLinkRecord> {
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

  if (input.targetUrl !== undefined) updates.targetUrl = normalizeTargetUrl(input.targetUrl);
  if (input.label !== undefined) {
    const label = input.label.trim();
    if (!label) throw new QrLinkError("A label is required", 400);
    updates.label = label;
  }
  if (input.targetUrl === undefined && input.label === undefined) {
    throw new QrLinkError("Nothing to update", 400);
  }

  const ref = getDb().collection(COLLECTION).doc(slug);
  try {
    await ref.update(updates);
  } catch (error) {
    if ((error as { code?: number }).code === 5 /* NOT_FOUND */) {
      throw new QrLinkError("QR link not found", 404);
    }
    throw error;
  }

  const doc = await ref.get();
  return mapRecord(slug, doc.data() as FirebaseFirestore.DocumentData);
}

export async function deleteQrLink(slug: string): Promise<void> {
  await getDb().collection(COLLECTION).doc(slug).delete();
}

/** Resolves a slug for the public redirect and bumps its scan stats. The
 * increment is awaited (serverless kills work left running after the
 * response) but a failed increment never fails the redirect itself. */
export async function resolveQrLink(rawSlug: string): Promise<string | null> {
  if (!SLUG_PATTERN.test(rawSlug)) return null;

  const ref = getDb().collection(COLLECTION).doc(rawSlug);
  const doc = await ref.get();
  const targetUrl = doc.exists ? (doc.data()?.targetUrl as unknown) : null;
  if (typeof targetUrl !== "string" || !targetUrl) return null;

  try {
    await ref.update({ scanCount: FieldValue.increment(1), lastScannedAt: FieldValue.serverTimestamp() });
  } catch (error) {
    console.error(`Failed to record scan for QR link "${rawSlug}":`, error);
  }

  return targetUrl;
}
