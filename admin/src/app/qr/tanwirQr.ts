import QRCode from "qrcode";
import {
  DEFAULT_QR_DESIGN,
  isImageDataUri,
  normalizeQrDesign,
  type QrCornerDotStyle,
  type QrCornerFrameStyle,
  type QrDesign,
  type QrPatternStyle,
} from "@/lib/qrDesign";

/**
 * Renders a branded Tanwir QR as a standalone SVG string, styled by a
 * QrDesign (frame, module pattern, corner style, colors, center logo). One
 * string is the single source of truth — the console previews it inline and
 * the SVG/PNG downloads serialize the exact same markup.
 *
 * Scannability notes, since every style deviates from square black modules:
 * - Error correction is forced to H (30% recoverable), and the logo badge
 *   knocks out a centered square of ~30% of the symbol's width (~9% of its
 *   modules) — well inside H's budget even on a smudged print.
 * - Every pattern keeps the module *center* dark, which is where scanners
 *   sample. Round dots are 80% of the module pitch, comfortably above the
 *   ~50% where dot styles start costing reliability.
 * - Finder eyes keep the 1:1:3:1:1 ring/gap/pupil proportions through their
 *   center lines in every corner style, which is what detectors key on.
 * - The quiet zone is the full 4 modules the spec asks for, and frames are
 *   drawn outside it.
 */

const QUIET_ZONE = 4;
/** Half-width of the logo knockout, as a fraction of the symbol width. */
const LOGO_WINDOW_RATIO = 0.15;
const DOT_RADIUS = 0.4;
const FONT_FAMILY = "'Helvetica Neue', Helvetica, Arial, sans-serif";

type Radii = [tl: number, tr: number, br: number, bl: number];

/** Rect path with an independent radius per corner, clockwise from top-left. */
function roundedRectPath(x: number, y: number, w: number, h: number, [tl, tr, br, bl]: Radii): string {
  const arc = (r: number, ex: number, ey: number) => (r > 0 ? `A${r} ${r} 0 0 1 ${ex} ${ey}` : "");
  return (
    `M${x + tl} ${y}H${x + w - tr}${arc(tr, x + w, y + tr)}` +
    `V${y + h - br}${arc(br, x + w - br, y + h)}` +
    `H${x + bl}${arc(bl, x, y + h - bl)}` +
    `V${y + tl}${arc(tl, x + tl, y)}Z`
  );
}

function circlePath(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
}

/** Which orthogonal neighbors of a module are dark (for the fluid style). */
interface Neighbors {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

function modulePath(style: QrPatternStyle, x: number, y: number, n: Neighbors): string {
  switch (style) {
    case "squares":
      return `M${x} ${y}h1v1h-1Z`;
    case "rounded":
      return roundedRectPath(x + 0.05, y + 0.05, 0.9, 0.9, [0.3, 0.3, 0.3, 0.3]);
    case "diamonds":
      return `M${x + 0.5} ${y}L${x + 1} ${y + 0.5}L${x + 0.5} ${y + 1}L${x} ${y + 0.5}Z`;
    case "fluid": {
      // Round a corner only where both modules touching it are light, so
      // runs of modules melt into continuous rounded blobs.
      const r = 0.5;
      return roundedRectPath(x, y, 1, 1, [
        !n.top && !n.left ? r : 0,
        !n.top && !n.right ? r : 0,
        !n.bottom && !n.right ? r : 0,
        !n.bottom && !n.left ? r : 0,
      ]);
    }
    case "dots":
    default:
      return circlePath(x + 0.5, y + 0.5, DOT_RADIUS);
  }
}

/** Leaf corners round two opposite corners; mirrored per eye so the shapes
 * read symmetric around the code's vertical axis. */
function leafRadii(r: number, mirrored: boolean): Radii {
  return mirrored ? [0, r, 0, r] : [r, 0, r, 0];
}

function eyeFrameRadii(style: QrCornerFrameStyle, mirrored: boolean): { outer: Radii; inner: Radii } {
  switch (style) {
    case "square":
      return { outer: [0, 0, 0, 0], inner: [0, 0, 0, 0] };
    case "circle":
      return { outer: [3.5, 3.5, 3.5, 3.5], inner: [2.5, 2.5, 2.5, 2.5] };
    case "leaf":
      return { outer: leafRadii(3, mirrored), inner: leafRadii(2, mirrored) };
    case "rounded":
    default:
      return { outer: [2.4, 2.4, 2.4, 2.4], inner: [1.4, 1.4, 1.4, 1.4] };
  }
}

function eyeDotRadii(style: QrCornerDotStyle, mirrored: boolean): Radii {
  switch (style) {
    case "square":
      return [0, 0, 0, 0];
    case "circle":
      return [1.5, 1.5, 1.5, 1.5];
    case "leaf":
      return leafRadii(1.4, mirrored);
    case "rounded":
    default:
      return [1, 1, 1, 1];
  }
}

/** One finder eye at (x, y): the 7x7 ring (as an even-odd cutout) + 3x3 pupil. */
function eyeSvg(x: number, y: number, design: QrDesign, mirrored: boolean): string {
  const { outer, inner } = eyeFrameRadii(design.cornerFrameStyle, mirrored);
  return (
    `<path fill-rule="evenodd" d="${roundedRectPath(x, y, 7, 7, outer)}${roundedRectPath(x + 1, y + 1, 5, 5, inner)}"/>` +
    `<path d="${roundedRectPath(x + 2, y + 2, 3, 3, eyeDotRadii(design.cornerDotStyle, mirrored))}"/>`
  );
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Single-line centered label, shrunk to fit `maxWidth` when it's long. */
function textSvg(text: string, cx: number, cy: number, maxSize: number, maxWidth: number, color: string): string {
  if (!text) return "";
  // Bold sans glyphs average ~0.62em; close enough to keep text in bounds
  // without measuring (which a standalone SVG can't do).
  const size = Math.min(maxSize, maxWidth / (text.length * 0.62));
  return `<text x="${cx}" y="${cy}" fill="${color}" font-family="${FONT_FAMILY}" font-size="${size.toFixed(2)}" font-weight="700" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text>`;
}

/** The QR symbol itself (quiet zone included) at the origin, `total` wide. */
function symbolSvg(content: string, design: QrDesign, logoDataUri: string | null): { markup: string; total: number } {
  const qr = QRCode.create(content, { errorCorrectionLevel: "H" });
  const { size, data } = qr.modules;
  const total = size + QUIET_ZONE * 2;
  const finders = [
    { row: 0, col: 0, mirrored: false },
    { row: 0, col: size - 7, mirrored: true },
    { row: size - 7, col: 0, mirrored: true },
  ];

  // Centered square knockout for the logo badge, aligned to module edges.
  const half = Math.round(size * LOGO_WINDOW_RATIO);
  const windowStart = size / 2 - half;
  const windowEnd = size / 2 + half;
  const hasLogo = logoDataUri !== null;

  const inFinder = (row: number, col: number) =>
    finders.some((f) => row >= f.row && row < f.row + 7 && col >= f.col && col < f.col + 7);
  const inLogoWindow = (row: number, col: number) =>
    hasLogo && row + 0.5 > windowStart && row + 0.5 < windowEnd && col + 0.5 > windowStart && col + 0.5 < windowEnd;
  const isDataModule = (row: number, col: number) =>
    row >= 0 &&
    col >= 0 &&
    row < size &&
    col < size &&
    Boolean(data[row * size + col]) &&
    !inFinder(row, col) &&
    !inLogoWindow(row, col);

  const modules: string[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!isDataModule(row, col)) continue;
      modules.push(
        modulePath(design.patternStyle, col, row, {
          top: isDataModule(row - 1, col),
          right: isDataModule(row, col + 1),
          bottom: isDataModule(row + 1, col),
          left: isDataModule(row, col - 1),
        })
      );
    }
  }

  const badgePad = 0.5;
  const badgeSize = windowEnd - windowStart - badgePad * 2;
  let logo = "";
  if (hasLogo) {
    // Transparent designs drop the badge too; the knockout alone keeps the
    // logo clear of modules.
    const badge = design.transparentBackground
      ? ""
      : `<rect x="${windowStart + badgePad}" y="${windowStart + badgePad}" width="${badgeSize}" height="${badgeSize}" rx="${badgeSize * 0.22}" fill="${design.background}"/>`;
    // Fit the artwork (any aspect ratio) inside the badge with breathing room.
    const logoSize = badgeSize * 0.82;
    logo =
      badge +
      `<image href="${logoDataUri}" x="${size / 2 - logoSize / 2}" y="${size / 2 - logoSize / 2}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  const markup =
    `<g transform="translate(${QUIET_ZONE} ${QUIET_ZONE})">` +
    `<path fill="${design.foreground}" d="${modules.join("")}"/>` +
    `<g fill="${design.cornerColor}">${finders.map((f) => eyeSvg(f.col, f.row, design, f.mirrored)).join("")}</g>` +
    logo +
    `</g>`;
  return { markup, total };
}

export interface TanwirQrOptions {
  design?: QrDesign;
  /** Data URI of the center logo; omit/null to render dots edge to edge. */
  logoDataUri?: string | null;
}

export function buildTanwirQrSvg(content: string, options: TanwirQrOptions = {}): string {
  // Re-normalize: the design may have come from anywhere, and every field
  // is about to be interpolated into markup.
  const design = normalizeQrDesign(options.design ?? DEFAULT_QR_DESIGN);
  const logoDataUri = isImageDataUri(options.logoDataUri) ? options.logoDataUri : null;
  const { markup: symbol, total: q } = symbolSvg(content, design, logoDataUri);
  const symbolRadius = q * 0.04;
  const transparent = design.transparentBackground;
  /** Background tile behind the symbol, or nothing when transparent. */
  const backgroundRect = (x: number, y: number, rx: number) =>
    transparent ? "" : `<rect x="${x}" y="${y}" width="${q}" height="${q}" rx="${rx}" fill="${design.background}"/>`;

  let width = q;
  let height = q;
  let body: string;

  switch (design.frameStyle) {
    case "banner-bottom":
    case "banner-top": {
      // Solid frame-color card; the symbol sits on its own background tile
      // inset by `pad`, with a label band below (or above) it.
      const pad = q * 0.045;
      const band = q * 0.2;
      const top = design.frameStyle === "banner-top";
      width = q + pad * 2;
      height = q + pad + band;
      const symbolY = top ? band : pad;
      const textY = top ? band / 2 + pad / 4 : pad + q + (band - pad / 2) / 2;
      const cardRadius = q * 0.07;
      const card = roundedRectPath(0, 0, width, height, [cardRadius, cardRadius, cardRadius, cardRadius]);
      // Transparent: punch the symbol's tile out of the card rather than
      // letting the frame color show through behind the modules.
      const hole = transparent
        ? roundedRectPath(pad, symbolY, q, q, [symbolRadius, symbolRadius, symbolRadius, symbolRadius])
        : "";
      body =
        `<path fill-rule="evenodd" fill="${design.frameColor}" d="${card}${hole}"/>` +
        backgroundRect(pad, symbolY, symbolRadius) +
        `<g transform="translate(${pad} ${symbolY})">${symbol}</g>` +
        textSvg(design.frameText, width / 2, textY, band * 0.5, width * 0.86, design.frameTextColor);
      break;
    }
    case "pill": {
      // Symbol on its own, with a pill-shaped call to action under it.
      const gap = q * 0.03;
      const pillHeight = q * 0.15;
      const pillWidth = q * 0.84;
      height = q + gap + pillHeight;
      body =
        backgroundRect(0, 0, symbolRadius) +
        symbol +
        `<rect x="${(q - pillWidth) / 2}" y="${q + gap}" width="${pillWidth}" height="${pillHeight}" rx="${pillHeight / 2}" fill="${design.frameColor}"/>` +
        textSvg(design.frameText, q / 2, q + gap + pillHeight / 2, pillHeight * 0.52, pillWidth * 0.84, design.frameTextColor);
      break;
    }
    case "outline": {
      // Thin frame-color border around symbol + label, all on the background.
      const stroke = q * 0.025;
      const pad = q * 0.03;
      const band = q * 0.17;
      width = q + pad * 2;
      height = q + pad + band;
      body =
        `<rect x="${stroke / 2}" y="${stroke / 2}" width="${width - stroke}" height="${height - stroke}" rx="${q * 0.07}" fill="${transparent ? "none" : design.background}" stroke="${design.frameColor}" stroke-width="${stroke}"/>` +
        `<g transform="translate(${pad} ${pad})">${symbol}</g>` +
        textSvg(design.frameText, width / 2, pad + q + (band - pad) / 2, band * 0.5, width * 0.84, design.frameColor);
      break;
    }
    case "none":
    default:
      body = backgroundRect(0, 0, 0) + symbol;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="geometricPrecision">` +
    body +
    `</svg>`
  );
}

/* --- Option swatches for the design editor --- */

/** A 4x4 sample of modules — enough to show both lone and connected modules. */
const SWATCH_BITMAP = [
  [1, 1, 0, 1],
  [0, 1, 0, 1],
  [1, 1, 1, 0],
  [0, 0, 1, 1],
];

export function patternSwatchSvg(style: QrPatternStyle, color: string): string {
  const on = (r: number, c: number) => Boolean(SWATCH_BITMAP[r]?.[c]);
  let d = "";
  SWATCH_BITMAP.forEach((cells, row) =>
    cells.forEach((cell, col) => {
      if (!cell) return;
      d += modulePath(style, col, row, {
        top: on(row - 1, col),
        right: on(row, col + 1),
        bottom: on(row + 1, col),
        left: on(row, col - 1),
      });
    })
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.5 -0.5 5 5"><path fill="${color}" d="${d}"/></svg>`;
}

export function cornerSwatchSvg(frameStyle: QrCornerFrameStyle, dotStyle: QrCornerDotStyle, color: string): string {
  const design = { ...DEFAULT_QR_DESIGN, cornerFrameStyle: frameStyle, cornerDotStyle: dotStyle };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 9 9"><g fill="${color}">${eyeSvg(0, 0, design, false)}</g></svg>`;
}

/* --- Raster export --- */

/** Rasterizes the SVG to a PNG blob (for print/social use), `pixels` on its
 * longer side; framed designs aren't square, so the aspect follows viewBox. */
export function tanwirQrPng(svg: string, pixels = 2048): Promise<Blob> {
  const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const vw = viewBox ? Number(viewBox[1]) : 1;
  const vh = viewBox ? Number(viewBox[2]) : 1;
  const scale = pixels / Math.max(vw, vh);
  const width = Math.round(vw * scale);
  const height = Math.round(vh * scale);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png");
    };
    image.onerror = () => reject(new Error("Could not rasterize QR SVG"));
    // Percent-encode rather than btoa: frame text may be non-Latin (Arabic).
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
