import QRCode from "qrcode";

/**
 * Renders the branded Tanwir QR style as a standalone SVG string: brand-green
 * round dots, rounded finder corners, and the Tanwir logo on a white badge in
 * the middle. One string is the single source of truth — the console previews
 * it inline and the SVG/PNG downloads serialize the exact same markup.
 *
 * Scannability notes, since this deviates from square black modules:
 * - Error correction is forced to H (30% recoverable), and the logo badge
 *   knocks out a centered square of ~30% of the symbol's width (~9% of its
 *   modules) — well inside H's budget even on a smudged print.
 * - Dots are 80% of the module pitch, comfortably above the ~50% where
 *   round-dot styles start costing scanner reliability. Verified decodable
 *   with ZXing at raster sizes from 200px up, logo included.
 * - The quiet zone is the full 4 modules the spec asks for.
 */

const BRAND_GREEN = "#2a6051";
const QUIET_ZONE = 4;
/** Half-width of the logo knockout, as a fraction of the symbol width. */
const LOGO_WINDOW_RATIO = 0.15;
const DOT_RADIUS = 0.4;

interface FinderOrigin {
  row: number;
  col: number;
}

function finderOrigins(size: number): FinderOrigin[] {
  return [
    { row: 0, col: 0 },
    { row: 0, col: size - 7 },
    { row: size - 7, col: 0 },
  ];
}

function inFinder(row: number, col: number, origins: FinderOrigin[]): boolean {
  return origins.some((o) => row >= o.row && row < o.row + 7 && col >= o.col && col < o.col + 7);
}

/** One finder eye: the standard ring + pupil, redrawn with rounded corners. */
function finderSvg(origin: FinderOrigin): string {
  const x = origin.col;
  const y = origin.row;
  // The ring's 1-module-wide stroke is centered on its path, so inset by 0.5
  // to make it cover exactly the outer 7x7 band the spec reserves.
  return (
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="1.9" fill="none" stroke="${BRAND_GREEN}" stroke-width="1"/>` +
    `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="1.1" fill="${BRAND_GREEN}"/>`
  );
}

export interface TanwirQrOptions {
  /** Data URI of the center logo; omit to render dots edge to edge. */
  logoDataUri?: string | null;
}

export function buildTanwirQrSvg(content: string, options: TanwirQrOptions = {}): string {
  const qr = QRCode.create(content, { errorCorrectionLevel: "H" });
  const { size, data } = qr.modules;
  const total = size + QUIET_ZONE * 2;
  const origins = finderOrigins(size);

  // Centered square knockout for the logo badge, aligned to module edges.
  const half = Math.round(size * LOGO_WINDOW_RATIO);
  const windowStart = size / 2 - half;
  const windowEnd = size / 2 + half;
  const hasLogo = Boolean(options.logoDataUri);

  const inLogoWindow = (row: number, col: number): boolean =>
    hasLogo && row + 0.5 > windowStart && row + 0.5 < windowEnd && col + 0.5 > windowStart && col + 0.5 < windowEnd;

  const dots: string[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!data[row * size + col]) continue;
      if (inFinder(row, col, origins)) continue;
      if (inLogoWindow(row, col)) continue;
      dots.push(`<circle cx="${col + 0.5}" cy="${row + 0.5}" r="${DOT_RADIUS}"/>`);
    }
  }

  let logo = "";
  if (hasLogo) {
    const windowSize = windowEnd - windowStart;
    const badgePad = 0.5;
    const badgeSize = windowSize - badgePad * 2;
    // Tanwir logo artwork is slightly taller than wide (37:40); fit it inside
    // the badge with breathing room, preserving that aspect ratio.
    const logoHeight = badgeSize * 0.82;
    const logoWidth = logoHeight * (37 / 40);
    logo =
      `<rect x="${windowStart + badgePad}" y="${windowStart + badgePad}" width="${badgeSize}" height="${badgeSize}" rx="${badgeSize * 0.22}" fill="#ffffff"/>` +
      `<image href="${options.logoDataUri}" x="${size / 2 - logoWidth / 2}" y="${size / 2 - logoHeight / 2}" width="${logoWidth}" height="${logoHeight}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="geometricPrecision">` +
    `<rect width="${total}" height="${total}" fill="#ffffff"/>` +
    `<g transform="translate(${QUIET_ZONE} ${QUIET_ZONE})">` +
    `<g fill="${BRAND_GREEN}">${dots.join("")}</g>` +
    origins.map(finderSvg).join("") +
    logo +
    `</g>` +
    `</svg>`
  );
}

/** Rasterizes the SVG to a PNG blob (for print/social use) at `pixels`². */
export function tanwirQrPng(svg: string, pixels = 2048): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = pixels;
      canvas.height = pixels;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.drawImage(image, 0, 0, pixels, pixels);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png");
    };
    image.onerror = () => reject(new Error("Could not rasterize QR SVG"));
    // btoa is safe here: the SVG is ASCII markup + a base64 logo data URI.
    image.src = `data:image/svg+xml;base64,${btoa(svg)}`;
  });
}
