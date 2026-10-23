"use client";

import { useMemo, useRef, useState } from "react";
import { buildTanwirQrSvg, cornerSwatchSvg, patternSwatchSvg } from "./tanwirQr";
import {
  CORNER_DOT_STYLES,
  CORNER_FRAME_STYLES,
  DEFAULT_QR_DESIGN,
  FRAME_STYLES,
  FRAME_TEXT_MAX_LENGTH,
  LOGO_DATA_URI_MAX_LENGTH,
  PATTERN_STYLES,
  qrDesignWarnings,
  type QrCornerDotStyle,
  type QrCornerFrameStyle,
  type QrDesign,
  type QrFrameStyle,
  type QrPatternStyle,
} from "@/lib/qrDesign";

/* --- Icons: hand-rolled inline SVGs, matching the console's set --- */

type IconProps = { className?: string };

function IconFrame({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="3.5" width="16" height="17" rx="3" />
      <rect x="7.5" y="6.5" width="9" height="8" rx="1.5" />
      <line x1="9" y1="17.5" x2="15" y2="17.5" />
    </svg>
  );
}

function IconPattern({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="6.5" height="6.5" rx="2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" />
    </svg>
  );
}

function IconCorners({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9V5.5A1.5 1.5 0 015.5 4H9" />
      <path d="M15 4h3.5A1.5 1.5 0 0120 5.5V9" />
      <path d="M20 15v3.5a1.5 1.5 0 01-1.5 1.5H15" />
      <path d="M9 20H5.5A1.5 1.5 0 014 18.5V15" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function IconImage({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.75" />
      <path d="M20.5 16l-4.5-4.5L7 19.5" />
    </svg>
  );
}

function IconChevron({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 5.5 15.5 12 9 18.5" />
    </svg>
  );
}

function IconWarning({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.3 4.3L2.9 17.5A2 2 0 004.6 20.5h14.8a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0z" />
      <line x1="12" y1="9.5" x2="12" y2="13.5" />
      <line x1="12" y1="16.75" x2="12" y2="16.8" />
    </svg>
  );
}

/* --- Option labels --- */

const FRAME_LABELS: Record<QrFrameStyle, string> = {
  none: "None",
  "banner-bottom": "Banner",
  "banner-top": "Top banner",
  pill: "Pill",
  outline: "Outline",
};

const PATTERN_LABELS: Record<QrPatternStyle, string> = {
  dots: "Dots",
  squares: "Classic",
  rounded: "Rounded",
  fluid: "Fluid",
  diamonds: "Diamonds",
};

const CORNER_FRAME_LABELS: Record<QrCornerFrameStyle, string> = {
  rounded: "Rounded",
  square: "Square",
  circle: "Circle",
  leaf: "Leaf",
};

const CORNER_DOT_LABELS: Record<QrCornerDotStyle, string> = CORNER_FRAME_LABELS;

/* --- Logo upload --- */

/** Longest side of a stored custom logo. The badge prints at well under an
 * inch, so 256px is plenty even for a 2048px PNG export. */
const LOGO_MAX_PIXELS = 256;

/** Downscales an uploaded image to a small self-contained data URI (PNG to
 * keep transparency, WebP if that's still too large). SVG uploads get
 * rasterized here too, so no third-party markup ever reaches the QR SVG. */
async function fileToLogoDataUri(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Couldn't read that image"));
      img.src = objectUrl;
    });
    const naturalW = image.naturalWidth || LOGO_MAX_PIXELS;
    const naturalH = image.naturalHeight || LOGO_MAX_PIXELS;
    const scale = Math.min(1, LOGO_MAX_PIXELS / Math.max(naturalW, naturalH));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(naturalW * scale));
    canvas.height = Math.max(1, Math.round(naturalH * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    let uri = canvas.toDataURL("image/png");
    if (uri.length > LOGO_DATA_URI_MAX_LENGTH) uri = canvas.toDataURL("image/webp", 0.85);
    if (uri.length > LOGO_DATA_URI_MAX_LENGTH || !uri.startsWith("data:image/")) {
      throw new Error("That image is too detailed to use as a logo — try a simpler version");
    }
    return uri;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** The logo a design actually renders with: the bundled Tanwir artwork, the
 * uploaded one, or none. */
export function resolveQrLogo(design: QrDesign, tanwirLogoDataUri: string | null): string | null {
  if (design.logoMode === "tanwir") return tanwirLogoDataUri;
  if (design.logoMode === "custom") return design.logoDataUri;
  return null;
}

/* --- Building blocks --- */

function Swatch({ svg, className }: { svg: string; className?: string }) {
  // Safe: markup comes from our own renderer, from enum geometry and
  // validated #rrggbb colors only.
  return <span className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function OptionTile({
  label,
  selected,
  disabled,
  onSelect,
  children,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`qr-option${selected ? " selected" : ""}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      {children}
      <span className="qr-option-label">{label}</span>
    </button>
  );
}

function ColorField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  // Local text so a half-typed hex doesn't get rejected mid-keystroke; the
  // design only updates once it's a full #rrggbb.
  const [text, setText] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value);
  }

  return (
    <label className="qr-color-field">
      <span className="ec-label">{label}</span>
      <span className="qr-color-input">
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} picker`}
        />
        <input
          className="qr-input qr-hex-input"
          value={text}
          disabled={disabled}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value.trim();
            setText(next);
            const hex = next.startsWith("#") ? next : `#${next}`;
            if (/^#[0-9a-f]{6}$/i.test(hex)) onChange(hex.toLowerCase());
          }}
          onBlur={() => setText(value)}
        />
      </span>
    </label>
  );
}

type SectionId = "frame" | "pattern" | "corners" | "logo";

function Section({
  id,
  open,
  onToggle,
  icon,
  title,
  subtitle,
  children,
}: {
  id: SectionId;
  open: boolean;
  onToggle: (id: SectionId) => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`qr-design-section${open ? " open" : ""}`}>
      <button
        type="button"
        className="qr-design-head"
        aria-expanded={open}
        aria-controls={`qr-design-${id}`}
        onClick={() => onToggle(id)}
      >
        <span className="qr-design-icon">{icon}</span>
        <span className="qr-design-text">
          <span className="qr-design-title">{title}</span>
          <span className="qr-design-subtitle">{subtitle}</span>
        </span>
        <IconChevron className="qr-design-chevron" />
      </button>
      {open && (
        <div className="qr-design-body" id={`qr-design-${id}`}>
          {children}
        </div>
      )}
    </div>
  );
}

/* --- Editor --- */

/** Sample content for frame thumbnails: short, so modules stay legible tiny. */
const THUMBNAIL_CONTENT = "tanwir";

export default function QrDesignEditor({
  design,
  onChange,
  disabled,
}: {
  design: QrDesign;
  onChange: (design: QrDesign) => void;
  disabled?: boolean;
}) {
  const [openSection, setOpenSection] = useState<SectionId | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [readingLogo, setReadingLogo] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof QrDesign>(key: K, value: QrDesign[K]) => onChange({ ...design, [key]: value });
  const toggle = (id: SectionId) => setOpenSection((current) => (current === id ? null : id));

  const frameThumbnails = useMemo(
    () =>
      Object.fromEntries(
        FRAME_STYLES.map((style) => [
          style,
          buildTanwirQrSvg(THUMBNAIL_CONTENT, { design: { ...design, frameStyle: style, frameText: "Scan me" } }),
        ])
      ) as Record<QrFrameStyle, string>,
    [design]
  );

  const warnings = useMemo(() => qrDesignWarnings(design), [design]);

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    setLogoError(null);
    setReadingLogo(true);
    try {
      const uri = await fileToLogoDataUri(file);
      onChange({ ...design, logoMode: "custom", logoDataUri: uri });
    } catch (err) {
      setLogoError((err as Error).message);
    } finally {
      setReadingLogo(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const isDefault = JSON.stringify(design) === JSON.stringify(DEFAULT_QR_DESIGN);

  return (
    <div className="qr-design">
      <div className="qr-design-heading">
        <span className="ec-label">Design (optional)</span>
        {!isDefault && (
          <button type="button" className="qr-link-btn" onClick={() => onChange(DEFAULT_QR_DESIGN)} disabled={disabled}>
            Reset to Tanwir default
          </button>
        )}
      </div>

      <Section
        id="frame"
        open={openSection === "frame"}
        onToggle={toggle}
        icon={<IconFrame className="qr-icon" />}
        title="Frame"
        subtitle="Add a call to action that inspires more scans."
      >
        <div className="qr-option-grid">
          {FRAME_STYLES.map((style) => (
            <OptionTile
              key={style}
              label={FRAME_LABELS[style]}
              selected={design.frameStyle === style}
              disabled={disabled}
              onSelect={() => set("frameStyle", style)}
            >
              <Swatch svg={frameThumbnails[style]} className="qr-option-swatch qr-option-swatch-frame" />
            </OptionTile>
          ))}
        </div>
        {design.frameStyle !== "none" && (
          <>
            <label className="ec-field qr-field-tight">
              <span className="ec-label">Frame text</span>
              <input
                className="qr-input"
                value={design.frameText}
                maxLength={FRAME_TEXT_MAX_LENGTH}
                disabled={disabled}
                placeholder="Scan me"
                onChange={(e) => set("frameText", e.target.value)}
              />
            </label>
            <div className="qr-color-row">
              <ColorField label="Frame" value={design.frameColor} disabled={disabled} onChange={(v) => set("frameColor", v)} />
              {design.frameStyle !== "outline" && (
                <ColorField label="Text" value={design.frameTextColor} disabled={disabled} onChange={(v) => set("frameTextColor", v)} />
              )}
            </div>
          </>
        )}
      </Section>

      <Section
        id="pattern"
        open={openSection === "pattern"}
        onToggle={toggle}
        icon={<IconPattern className="qr-icon" />}
        title="QR Code Pattern"
        subtitle="Choose a pattern for your QR code and select colors."
      >
        <div className="qr-option-grid">
          {PATTERN_STYLES.map((style) => (
            <OptionTile
              key={style}
              label={PATTERN_LABELS[style]}
              selected={design.patternStyle === style}
              disabled={disabled}
              onSelect={() => set("patternStyle", style)}
            >
              <Swatch svg={patternSwatchSvg(style, design.foreground)} className="qr-option-swatch" />
            </OptionTile>
          ))}
        </div>
        <div className="qr-color-row">
          <ColorField label="Pattern" value={design.foreground} disabled={disabled} onChange={(v) => set("foreground", v)} />
          <ColorField label="Background" value={design.background} disabled={disabled} onChange={(v) => set("background", v)} />
        </div>
      </Section>

      <Section
        id="corners"
        open={openSection === "corners"}
        onToggle={toggle}
        icon={<IconCorners className="qr-icon" />}
        title="QR Code Corners"
        subtitle="Select your QR code's corner style."
      >
        <span className="ec-label qr-sub-label">Corner frame</span>
        <div className="qr-option-grid">
          {CORNER_FRAME_STYLES.map((style) => (
            <OptionTile
              key={style}
              label={CORNER_FRAME_LABELS[style]}
              selected={design.cornerFrameStyle === style}
              disabled={disabled}
              onSelect={() => set("cornerFrameStyle", style)}
            >
              <Swatch svg={cornerSwatchSvg(style, design.cornerDotStyle, design.cornerColor)} className="qr-option-swatch" />
            </OptionTile>
          ))}
        </div>
        <span className="ec-label qr-sub-label">Corner dot</span>
        <div className="qr-option-grid">
          {CORNER_DOT_STYLES.map((style) => (
            <OptionTile
              key={style}
              label={CORNER_DOT_LABELS[style]}
              selected={design.cornerDotStyle === style}
              disabled={disabled}
              onSelect={() => set("cornerDotStyle", style)}
            >
              <Swatch svg={cornerSwatchSvg(design.cornerFrameStyle, style, design.cornerColor)} className="qr-option-swatch" />
            </OptionTile>
          ))}
        </div>
        <div className="qr-color-row">
          <ColorField label="Corner color" value={design.cornerColor} disabled={disabled} onChange={(v) => set("cornerColor", v)} />
          {design.cornerColor !== design.foreground && (
            <button
              type="button"
              className="qr-link-btn qr-match-btn"
              disabled={disabled}
              onClick={() => set("cornerColor", design.foreground)}
            >
              Match pattern
            </button>
          )}
        </div>
      </Section>

      <Section
        id="logo"
        open={openSection === "logo"}
        onToggle={toggle}
        icon={<IconImage className="qr-icon" />}
        title="Add Logo"
        subtitle="Make your QR code unique with your logo or an image."
      >
        <div className="qr-option-grid">
          <OptionTile
            label="Tanwir"
            selected={design.logoMode === "tanwir"}
            disabled={disabled}
            onSelect={() => set("logoMode", "tanwir")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny static thumbnail */}
            <img src="/logo.webp" alt="" className="qr-option-swatch qr-option-img" />
          </OptionTile>
          {design.logoDataUri && (
            <OptionTile
              label="Uploaded"
              selected={design.logoMode === "custom"}
              disabled={disabled}
              onSelect={() => set("logoMode", "custom")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- data URI preview */}
              <img src={design.logoDataUri} alt="" className="qr-option-swatch qr-option-img" />
            </OptionTile>
          )}
          <OptionTile
            label="No logo"
            selected={design.logoMode === "none"}
            disabled={disabled}
            onSelect={() => set("logoMode", "none")}
          >
            <span className="qr-option-swatch qr-option-empty" />
          </OptionTile>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          hidden
          onChange={(e) => uploadLogo(e.target.files?.[0])}
        />
        <button
          type="button"
          className="ec-btn ec-btn-sm"
          disabled={disabled || readingLogo}
          onClick={() => fileInput.current?.click()}
        >
          {readingLogo ? "Reading…" : design.logoDataUri ? "Upload a different image" : "Upload image"}
        </button>
        <p className="ec-hint qr-logo-hint">Square logos with a transparent background look best.</p>
        {logoError && <p className="ec-error">{logoError}</p>}
      </Section>

      {warnings.length > 0 && (
        <div className="qr-design-warnings" role="status">
          {warnings.map((warning) => (
            <p key={warning}>
              <IconWarning className="qr-meta-icon" /> {warning}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
