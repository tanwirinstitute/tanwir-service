"use client";

import { useEffect, useRef } from "react";

const PIXEL = 4;

/**
 * One 10x13 pixel-grid sprite, reused for every character — palette swaps
 * (below) give each one a distinct look. Legend: ' ' empty, 'T'/'t' turban
 * main/shade, 'S' skin, 'e' eye, 'R'/'r' robe main/shade, 'H' hands (skin).
 * Drawn from a bottom-center pivot (see drawCharacter) so rotation for the
 * dhikr sway pivots at the hips, not the head.
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

const EYE_COLOR = "#1a1d23";

const PALETTES: Record<string, string>[] = [
  { T: "#f4f1ea", t: "#d8d3c5", S: "#e8b98a", R: "#2a6051", r: "#1f4a3f" },
  { T: "#eaf2ef", t: "#c7d9d2", S: "#c98a56", R: "#8a5a3b", r: "#6b4530" },
  { T: "#f9e4c8", t: "#e0c49f", S: "#f0c9a0", R: "#3d5a80", r: "#2c4260" },
  { T: "#ffffff", t: "#dcdcdc", S: "#8d5a3c", R: "#6d597a", r: "#54465f" },
  { T: "#f0e6d2", t: "#d4c7a8", S: "#f5d0a9", R: "#a44a3f", r: "#7f3830" },
  { T: "#e6d9c3", t: "#c9b896", S: "#6b4226", R: "#556b2f", r: "#3f4f22" },
  { T: "#dfe7e2", t: "#b9c7c0", S: "#d9a066", R: "#264653", r: "#1a323b" },
  { T: "#f6efe3", t: "#dccdb0", S: "#a9713f", R: "#7c3f58", r: "#5c2e42" },
];

const CHARACTER_COUNT = 8;
const MAX_SWAY = 0.16;
const MAX_CONCURRENT_WALKERS = 1;

interface Character {
  seatAngle: number;
  palette: Record<string, string>;
  phase: number;
  speed: number;
  mode: "idle" | "walking";
  walkStart: number;
  walkDuration: number;
  nextWalkAt: number;
}

function drawCharacter(ctx: CanvasRenderingContext2D, palette: Record<string, string>, x: number, y: number, scale: number, angle: number) {
  const size = PIXEL * scale;
  const rows = SPRITE.length;
  const cols = SPRITE[0].length;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = SPRITE[r][c];
      if (ch === " ") continue;
      ctx.fillStyle = ch === "e" ? EYE_COLOR : palette[ch];
      const px = (c - cols / 2) * size;
      const py = (r - rows) * size;
      ctx.fillRect(px, py, size + 0.5, size + 0.5);
    }
  }

  ctx.restore();
}

function makeCharacters(now: number): Character[] {
  return Array.from({ length: CHARACTER_COUNT }, (_, i) => ({
    seatAngle: (i / CHARACTER_COUNT) * Math.PI * 2 - Math.PI / 2,
    palette: PALETTES[i % PALETTES.length],
    phase: Math.random() * Math.PI * 2,
    speed: 1.1 + Math.random() * 0.3,
    mode: "idle" as const,
    walkStart: 0,
    walkDuration: 0,
    nextWalkAt: now + 2000 + Math.random() * 6000,
  }));
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

    const height = 190;
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
    });
    resizeObserver.observe(container);

    const characters = makeCharacters(performance.now());
    let animationFrame: number;
    let concurrentWalkers = 0;

    function frame(now: number) {
      const cx = width / 2;
      const cy = height * 0.66;
      const radiusX = width * 0.36;
      const radiusY = height * 0.22;

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, width, height);

      // Rug the circle sits on.
      ctx!.fillStyle = "#eaf2ef";
      ctx!.beginPath();
      ctx!.ellipse(cx, cy + radiusY * 0.15, radiusX * 1.22, radiusY * 1.35, 0, 0, Math.PI * 2);
      ctx!.fill();

      const positioned = characters.map((character) => {
        const seatX = cx + Math.cos(character.seatAngle) * radiusX;
        const seatY = cy + Math.sin(character.seatAngle) * radiusY;
        const depth = (Math.sin(character.seatAngle) + 1) / 2;
        const baseScale = 0.78 + depth * 0.34;

        if (character.mode === "idle" && now >= character.nextWalkAt && concurrentWalkers < MAX_CONCURRENT_WALKERS) {
          character.mode = "walking";
          character.walkStart = now;
          character.walkDuration = 3200 + Math.random() * 1800;
        }

        let x = seatX;
        let y = seatY;
        let scale = baseScale;
        let angle = Math.sin(now / 1000 + character.phase) * MAX_SWAY * character.speed;

        if (character.mode === "walking") {
          const t = Math.min((now - character.walkStart) / character.walkDuration, 1);
          const p = Math.sin(t * Math.PI);
          const destX = cx + (seatX - cx) * 0.25;
          const destY = cy + (seatY - cy) * 0.25;
          x = seatX + (destX - seatX) * p;
          y = seatY + (destY - seatY) * p - Math.abs(Math.sin(t * Math.PI * 6)) * 2 * p;
          scale = baseScale * (1 + 0.06 * p);
          angle = Math.sin(now / 220) * 0.05 * p;
          if (t >= 1) {
            character.mode = "idle";
            character.nextWalkAt = now + 5000 + Math.random() * 9000;
          }
        }

        return { character, x, y, scale, angle };
      });

      concurrentWalkers = positioned.filter((p) => p.character.mode === "walking").length;

      positioned
        .sort((a, b) => a.y - b.y)
        .forEach(({ character, x, y, scale, angle }) => {
          drawCharacter(ctx!, character.palette, x, y, scale, angle);
        });

      animationFrame = requestAnimationFrame(frame);
    }

    animationFrame = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="hadra-card" ref={containerRef}>
      <canvas ref={canvasRef} className="hadra-canvas" aria-hidden="true" />
    </div>
  );
}
