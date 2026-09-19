"use client";

import { useEffect, useRef } from "react";

const PIXEL = 4;

/** Classic 4-shade DMG Game Boy green palette — every pixel on screen uses one of these. */
const GB = {
  lightest: "#9bbc0f",
  light: "#8bac0f",
  dark: "#306230",
  darkest: "#0f380f",
};

/**
 * One 10x13 pixel-grid sprite, reused for every character — see PALETTES
 * below for the (limited, GB-authentic) recoloring. Legend: ' ' empty,
 * 'T'/'t' turban main/shade, 'S' skin, 'e' eye, 'R'/'r' robe main/shade,
 * 'H' hands (skin). Drawn from a bottom-center pivot (see drawCharacter) so
 * rotation for the dhikr sway pivots at the hips, not the head.
 */
const SPRITE = [
  "  TTTT    ",
  " TTTTTT   ",
  " TttttT   ",
  "  SSSS    ",
  "  SeSeS   ",
  "  SSSSS   ",
  "  RRRRR   ",
  " RRRRRRR  ",
  " RrrrrrR  ",
  "RRRHHHRRR ",
  "RRRrrrRRR ",
  "RRRRRRRRR ",
  " rrrrrrr  ",
];

/** Two recolorings within the 4-tone palette, alternated for a little variety without breaking the one-screen-one-palette GB conceit. */
const PALETTES: Record<string, string>[] = [
  { T: GB.lightest, t: GB.light, S: GB.light, R: GB.dark, r: GB.darkest, H: GB.light },
  { T: GB.light, t: GB.darkest, S: GB.lightest, R: GB.darkest, r: GB.dark, H: GB.lightest },
];

const CHARACTER_COUNT = 7;
const MAX_SWAY = 0.16;
const MAX_CONCURRENT_WALKERS = 1;

interface Character {
  seatX: number;
  palette: Record<string, string>;
  phase: number;
  speed: number;
  mode: "idle" | "walking";
  walkStart: number;
  walkDuration: number;
  walkDir: number;
  nextWalkAt: number;
}

function drawCharacter(ctx: CanvasRenderingContext2D, palette: Record<string, string>, x: number, y: number, scale: number, angle: number) {
  const size = PIXEL * scale;
  const rows = SPRITE.length;
  const cols = SPRITE[0].length;

  const cells: { ch: string; px: number; py: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = SPRITE[r][c];
      if (ch === " ") continue;
      cells.push({ ch, px: (c - cols / 2) * size, py: (r - rows) * size });
    }
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Outline pass: stamp a one-"pixel" dark halo behind the sprite so it
  // reads clearly against a same-toned background (only 4 shades exist).
  ctx.fillStyle = GB.darkest;
  const outlineOffsets: [number, number][] = [
    [-size, 0],
    [size, 0],
    [0, -size],
    [0, size],
  ];
  for (const { px, py } of cells) {
    for (const [dx, dy] of outlineOffsets) {
      ctx.fillRect(px + dx, py + dy, size + 0.5, size + 0.5);
    }
  }

  for (const { ch, px, py } of cells) {
    ctx.fillStyle = ch === "e" ? GB.darkest : palette[ch];
    ctx.fillRect(px, py, size + 0.5, size + 0.5);
  }

  ctx.restore();
}

function makeCharacters(now: number, width: number): Character[] {
  const margin = width * 0.1;
  const span = width - margin * 2;
  return Array.from({ length: CHARACTER_COUNT }, (_, i) => ({
    seatX: margin + (span * i) / (CHARACTER_COUNT - 1),
    palette: PALETTES[i % PALETTES.length],
    phase: Math.random() * Math.PI * 2,
    speed: 1.1 + Math.random() * 0.3,
    mode: "idle" as const,
    walkStart: 0,
    walkDuration: 0,
    walkDir: Math.random() < 0.5 ? -1 : 1,
    nextWalkAt: now + 2000 + Math.random() * 6000,
  }));
}

function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number, horizon: number) {
  ctx.fillStyle = GB.lightest;
  ctx.fillRect(0, 0, width, horizon);

  const tile = 12;
  for (let ty = horizon; ty < height; ty += tile) {
    const rowIndex = Math.floor((ty - horizon) / tile);
    for (let tx = 0; tx < width; tx += tile) {
      const colIndex = Math.floor(tx / tile);
      ctx.fillStyle = (rowIndex + colIndex) % 2 === 0 ? GB.light : GB.dark;
      ctx.fillRect(tx, ty, tile, tile);
    }
  }

  ctx.fillStyle = GB.darkest;
  ctx.fillRect(0, horizon - 2, width, 2);
}

export default function HadraScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const height = 160;
    let width = container.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function applySize() {
      if (!canvas) return;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    applySize();

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      width = entry.contentRect.width;
      applySize();
      characters = makeCharacters(performance.now(), width);
    });
    resizeObserver.observe(container);

    let characters = makeCharacters(performance.now(), width);
    let animationFrame: number;
    let concurrentWalkers = 0;

    function frame(now: number) {
      const horizon = height * 0.6;
      const baseline = horizon + 22;

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBackground(ctx!, width, height, horizon);

      const positioned = characters.map((character) => {
        if (character.mode === "idle" && now >= character.nextWalkAt && concurrentWalkers < MAX_CONCURRENT_WALKERS) {
          character.mode = "walking";
          character.walkStart = now;
          character.walkDuration = 3000 + Math.random() * 1600;
        }

        let x = character.seatX;
        let y = baseline;
        let angle = Math.sin(now / 1000 + character.phase) * MAX_SWAY * character.speed;

        if (character.mode === "walking") {
          const t = Math.min((now - character.walkStart) / character.walkDuration, 1);
          const p = Math.sin(t * Math.PI);
          x = character.seatX + character.walkDir * 16 * p;
          y = baseline - Math.abs(Math.sin(t * Math.PI * 6)) * 3 * p;
          angle = Math.sin(now / 200) * 0.06 * p;
          if (t >= 1) {
            character.mode = "idle";
            character.nextWalkAt = now + 5000 + Math.random() * 9000;
          }
        }

        return { character, x, y, angle };
      });

      concurrentWalkers = positioned.filter((p) => p.character.mode === "walking").length;

      for (const { character, x, y, angle } of positioned) {
        drawCharacter(ctx!, character.palette, x, y, 1, angle);
      }

      animationFrame = requestAnimationFrame(frame);
    }

    animationFrame = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="hadra-frame">
      <div className="hadra-frame-led" aria-hidden="true" />
      <div className="hadra-screen" ref={containerRef}>
        <canvas ref={canvasRef} className="hadra-canvas" aria-hidden="true" />
        <div className="hadra-scanlines" aria-hidden="true" />
      </div>
    </div>
  );
}
