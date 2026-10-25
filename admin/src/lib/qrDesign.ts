/**
 * The per-code design of a branded QR: frame, module pattern, finder-corner
 * style, colors and center logo. Pure data + validation with no Firebase or
 * DOM dependency, so the same rules run in the console (live preview) and in
 * the API routes (before anything is written to Firestore).
 *
 * Every field ends up interpolated into SVG markup that the console renders
 * with dangerouslySetInnerHTML, so validation is strict allow-listing: enums,
 * #rrggbb colors, and base64 raster data URIs only. Frame text is the one
 * free-form field and is XML-escaped by the renderer.
 */

export const FRAME_STYLES = ["none", "banner-bottom", "banner-top", "pill", "outline"] as const;
export const PATTERN_STYLES = ["dots", "squares", "rounded", "fluid", "diamonds"] as const;
export const CORNER_FRAME_STYLES = ["rounded", "square", "circle", "leaf"] as const;
export const CORNER_DOT_STYLES = ["rounded", "square", "circle", "leaf"] as const;
export const LOGO_MODES = ["tanwir", "custom", "none"] as const;

export type QrFrameStyle = (typeof FRAME_STYLES)[number];
export type QrPatternStyle = (typeof PATTERN_STYLES)[number];
export type QrCornerFrameStyle = (typeof CORNER_FRAME_STYLES)[number];
export type QrCornerDotStyle = (typeof CORNER_DOT_STYLES)[number];
export type QrLogoMode = (typeof LOGO_MODES)[number];

export interface QrDesign {
  frameStyle: QrFrameStyle;
  /** Call to action printed in the frame ("Scan me"); ignored for "none". */
  frameText: string;
  frameColor: string;
  frameTextColor: string;
  patternStyle: QrPatternStyle;
  /** Module (data dot) color. */
  foreground: string;
  /** Quiet zone + logo badge color; unused when transparentBackground. */
  background: string;
  /** Leave the background unpainted (transparent PNG / SVG) so the code can
   * sit on artwork. Frames keep their own color. */
  transparentBackground: boolean;
  cornerFrameStyle: QrCornerFrameStyle;
  cornerDotStyle: QrCornerDotStyle;
  cornerColor: string;
  logoMode: QrLogoMode;
  /** Uploaded logo, only meaningful when logoMode is "custom". */
  logoDataUri: string | null;
}

export const FRAME_TEXT_MAX_LENGTH = 32;
/** Custom logos are downscaled client-side to ~256px before upload, which
 * lands well under this; the cap keeps a doc far from Firestore's 1 MiB. */
export const LOGO_DATA_URI_MAX_LENGTH = 300_000;

const BRAND_GREEN = "#2a6051";

/** The original Tanwir look — what every code created before designs
 * existed (and every new code, until someone changes it) renders as. */
export const DEFAULT_QR_DESIGN: QrDesign = {
  frameStyle: "none",
  frameText: "Scan me",
  frameColor: BRAND_GREEN,
  frameTextColor: "#ffffff",
  patternStyle: "dots",
  foreground: BRAND_GREEN,
  background: "#ffffff",
  transparentBackground: false,
  cornerFrameStyle: "rounded",
  cornerDotStyle: "rounded",
  cornerColor: BRAND_GREEN,
  logoMode: "tanwir",
  logoDataUri: null,
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const IMAGE_DATA_URI = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

/** Shape check only (no size cap) — the renderer uses it to vet whatever
 * logo it's handed, including the bundled Tanwir one. */
export function isImageDataUri(value: unknown): value is string {
  return typeof value === "string" && IMAGE_DATA_URI.test(value);
}

function isUploadableLogo(value: unknown): value is string {
  return isImageDataUri(value) && value.length <= LOGO_DATA_URI_MAX_LENGTH;
}

export class QrDesignError extends Error {}

/**
 * Coerces untrusted input into a valid design. In strict mode (API writes) a
 * present-but-invalid field throws so the admin learns their change was
 * rejected; otherwise (reading stored docs, rendering) it falls back to the
 * default, so a bad doc can only ever render as a plain Tanwir code.
 */
function coerceQrDesign(raw: unknown, strict: boolean): QrDesign {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  function pick<T>(key: keyof QrDesign, isValid: (value: unknown) => value is T, what: string): T {
    const value = input[key];
    if (value === undefined || value === null) return DEFAULT_QR_DESIGN[key] as T;
    if (isValid(value)) return value;
    if (strict) throw new QrDesignError(`Invalid ${what}`);
    return DEFAULT_QR_DESIGN[key] as T;
  }

  const oneOf =
    <T extends string>(values: readonly T[]) =>
    (value: unknown): value is T =>
      typeof value === "string" && (values as readonly string[]).includes(value);

  const frameText = pick(
    "frameText",
    (value): value is string => typeof value === "string" && value.trim().length <= FRAME_TEXT_MAX_LENGTH,
    `frame text (max ${FRAME_TEXT_MAX_LENGTH} characters)`
  ).trim();

  const logoMode = pick("logoMode", oneOf(LOGO_MODES), "logo option");
  const logoDataUri = logoMode === "custom" ? pick("logoDataUri", isUploadableLogo, "logo image (PNG, JPEG or WebP, under ~200 KB)") : null;
  if (logoMode === "custom" && !logoDataUri && strict) {
    throw new QrDesignError("Upload a logo image or pick another logo option");
  }

  return {
    frameStyle: pick("frameStyle", oneOf(FRAME_STYLES), "frame style"),
    frameText,
    frameColor: pick("frameColor", isHexColor, "frame color"),
    frameTextColor: pick("frameTextColor", isHexColor, "frame text color"),
    patternStyle: pick("patternStyle", oneOf(PATTERN_STYLES), "pattern style"),
    foreground: pick("foreground", isHexColor, "pattern color"),
    background: pick("background", isHexColor, "background color"),
    transparentBackground: pick(
      "transparentBackground",
      (value): value is boolean => typeof value === "boolean",
      "transparent background setting"
    ),
    cornerFrameStyle: pick("cornerFrameStyle", oneOf(CORNER_FRAME_STYLES), "corner frame style"),
    cornerDotStyle: pick("cornerDotStyle", oneOf(CORNER_DOT_STYLES), "corner dot style"),
    cornerColor: pick("cornerColor", isHexColor, "corner color"),
    // A custom mode whose image didn't survive (lenient read) degrades to no logo.
    logoMode: logoMode === "custom" && !logoDataUri ? "none" : logoMode,
    logoDataUri,
  };
}

export function normalizeQrDesign(raw: unknown): QrDesign {
  return coerceQrDesign(raw, false);
}

/** Throws QrDesignError on any invalid field. */
export function validateQrDesign(raw: unknown): QrDesign {
  return coerceQrDesign(raw, true);
}

/* --- Scannability check --- */

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Human-readable reasons a design may not scan reliably, empty when fine.
 * Advisory only — never blocks saving.
 */
export function qrDesignWarnings(design: QrDesign): string[] {
  const warnings: string[] = [];
  // A transparent code is only scannable on a light surface, so judge it
  // against white — the editor tells the admin to place it accordingly.
  const background = design.transparentBackground ? "#ffffff" : design.background;
  const bgLum = relativeLuminance(background);
  for (const [name, color] of [
    ["Pattern", design.foreground],
    ["Corner", design.cornerColor],
  ] as const) {
    if (relativeLuminance(color) > bgLum) {
      warnings.push(`${name} color is lighter than the background — many scanners can't read inverted codes.`);
    } else if (contrastRatio(color, background) < 4) {
      warnings.push(`${name} color has low contrast against the background, which can make the code hard to scan.`);
    }
  }
  return warnings;
}
