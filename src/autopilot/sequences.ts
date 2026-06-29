// Auto-pilot stroke sequences — played when the canvas is idle.
// Each sequence is defined as a series of strokes with time-based waypoints.
// Coordinates: x ∈ [0,1] left-to-right, y ∈ [0,1] bottom-to-top (WebGL convention).

export interface Waypoint {
  t: number;  // seconds from sequence start
  x: number;
  y: number;
}

export interface Stroke {
  waypoints: Waypoint[];
}

export interface AutoPilotSequence {
  name: string;
  duration: number;   // total seconds (auto-pilot stops after this)
  strokes: Stroke[];
}

// ── Bezier helpers ────────────────────────────────────────────────────────────

function quadBezier(
  x0: number, y0: number,
  cx: number, cy: number,
  x1: number, y1: number,
  startT: number, endT: number,
  steps: number,
): Waypoint[] {
  return Array.from({ length: steps }, (_, i) => {
    const f = i / (steps - 1);
    const fi = 1 - f;
    return {
      t: startT + (endT - startT) * f,
      x: fi * fi * x0 + 2 * fi * f * cx + f * f * x1,
      y: fi * fi * y0 + 2 * fi * f * cy + f * f * y1,
    };
  });
}

function line(
  x0: number, y0: number,
  x1: number, y1: number,
  startT: number, endT: number,
  steps: number = 12,
): Waypoint[] {
  return Array.from({ length: steps }, (_, i) => {
    const f = i / (steps - 1);
    return {
      t: startT + (endT - startT) * f,
      x: x0 + (x1 - x0) * f,
      y: y0 + (y1 - y0) * f,
    };
  });
}

// Arc along a circle. sweepDeg > 0 = clockwise (angle decreases in standard math).
function arc(
  cx: number, cy: number,
  r: number,
  startDeg: number,
  sweepDeg: number,
  startT: number, endT: number,
  steps: number,
): Waypoint[] {
  const startRad = startDeg * Math.PI / 180;
  const sweepRad = sweepDeg * Math.PI / 180;
  return Array.from({ length: steps }, (_, i) => {
    const f = i / (steps - 1);
    const angle = startRad - sweepRad * f;
    return {
      t: startT + (endT - startT) * f,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  });
}

// Archimedes spiral. r grows from rStart to rEnd over sweepDeg degrees clockwise.
function spiral(
  cx: number, cy: number,
  rStart: number, rEnd: number,
  startDeg: number,
  sweepDeg: number,
  startT: number, endT: number,
  steps: number,
): Waypoint[] {
  const startRad = startDeg * Math.PI / 180;
  const sweepRad = sweepDeg * Math.PI / 180;
  return Array.from({ length: steps }, (_, i) => {
    const f = i / (steps - 1);
    const r = rStart + (rEnd - rStart) * f;
    const angle = startRad - sweepRad * f;
    return {
      t: startT + (endT - startT) * f,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  });
}

// ── Sequence 1 — Branch ───────────────────────────────────────────────────────
// Suggests a bamboo branch: long trunk, then 2–3 offshoots
const BRANCH: AutoPilotSequence = {
  name: 'branch',
  duration: 8.5,
  strokes: [
    // Main trunk: top-center curving slightly down and right
    { waypoints: quadBezier(0.50, 0.90, 0.54, 0.52, 0.55, 0.10, 0.3, 2.2, 20) },
    // Right branch (upper), from mid-trunk
    { waypoints: quadBezier(0.52, 0.68, 0.72, 0.74, 0.82, 0.88, 2.6, 3.8, 14) },
    // Left branch (upper), from a different point on trunk
    { waypoints: quadBezier(0.53, 0.60, 0.34, 0.70, 0.18, 0.82, 4.1, 5.1, 12) },
    // Short right twig off first branch
    { waypoints: line(0.68, 0.80, 0.82, 0.92, 5.5, 6.3, 8) },
    // Short left twig
    { waypoints: line(0.32, 0.76, 0.16, 0.88, 6.7, 7.4, 8) },
    // Trailing small mark at top (like a leaf bud)
    { waypoints: line(0.52, 0.93, 0.50, 0.97, 7.8, 8.2, 5) },
  ],
};

// ── Sequence 2 — Wave ─────────────────────────────────────────────────────────
// Two flowing S-curves across the canvas
function sineWaypoints(
  startX: number, endX: number,
  centerY: number, amplitude: number,
  phase: number,
  startT: number, endT: number,
  steps: number,
): Waypoint[] {
  return Array.from({ length: steps }, (_, i) => {
    const f = i / (steps - 1);
    const x = startX + (endX - startX) * f;
    const y = centerY + amplitude * Math.sin(f * Math.PI * 2 + phase);
    return { t: startT + (endT - startT) * f, x, y };
  });
}

const WAVE: AutoPilotSequence = {
  name: 'wave',
  duration: 7.5,
  strokes: [
    // First wave: sweeps left-to-right with a gentle S (phase=0: starts upward)
    { waypoints: sineWaypoints(0.04, 0.96, 0.58, 0.18, 0, 0.3, 2.8, 24) },
    // Second wave: reverse direction, slightly lower, smaller amplitude
    { waypoints: sineWaypoints(0.96, 0.04, 0.40, 0.13, Math.PI, 3.2, 5.4, 20) },
    // Final short flourish: small arc in the center
    { waypoints: quadBezier(0.30, 0.52, 0.50, 0.60, 0.70, 0.52, 5.9, 7.0, 10) },
  ],
};

// ── Sequence 3 — Character ────────────────────────────────────────────────────
// Suggests a simplified East-Asian character (loosely inspired by 水 / water).
// Three structural strokes + two diagonal splashes.
const CHARACTER: AutoPilotSequence = {
  name: 'character',
  duration: 8.0,
  strokes: [
    // Vertical center stroke: flows from top toward bottom with slight curve
    { waypoints: quadBezier(0.50, 0.88, 0.48, 0.52, 0.50, 0.18, 0.3, 2.0, 18) },
    // Horizontal stroke through upper third
    { waypoints: line(0.22, 0.68, 0.78, 0.68, 2.4, 3.4, 14) },
    // Lower-left diagonal (like ink splashing left-down)
    { waypoints: quadBezier(0.46, 0.48, 0.32, 0.36, 0.16, 0.18, 3.8, 5.0, 12) },
    // Lower-right diagonal (mirrored)
    { waypoints: quadBezier(0.54, 0.48, 0.68, 0.36, 0.84, 0.18, 5.4, 6.5, 12) },
    // Central bottom dot / small mark
    { waypoints: line(0.50, 0.24, 0.50, 0.14, 6.9, 7.5, 6) },
  ],
};

// ── Sequence 4 — Enso ─────────────────────────────────────────────────────────
// Zen circle in a single sweeping arc — nearly closed, with a small gap
// (the deliberate opening is traditional: represents imperfection and space).
const ENSO: AutoPilotSequence = {
  name: 'enso',
  duration: 5.2,
  strokes: [
    // Single sweeping arc: starts at top (90°), sweeps 340° clockwise
    // leaving a 20° gap at the upper-left
    { waypoints: arc(0.50, 0.50, 0.28, 90, 340, 0.3, 3.8, 40) },
    // Expressive brush-lift tail following the natural exit tangent
    { waypoints: line(0.40, 0.76, 0.46, 0.78, 4.1, 4.6, 4) },
  ],
};

// ── Sequence 5 — Mountain ─────────────────────────────────────────────────────
// Three peaks inspired by 山 (mountain): each is a single continuous stroke
// up-and-over. A horizontal ground line anchors the base.
const MOUNTAIN: AutoPilotSequence = {
  name: 'mountain',
  duration: 9.0,
  strokes: [
    // Left peak: continuous up-and-over stroke
    { waypoints: [
      ...quadBezier(0.14, 0.20, 0.18, 0.42, 0.28, 0.60, 0.3, 1.4, 12),
      ...quadBezier(0.28, 0.60, 0.34, 0.42, 0.38, 0.20, 1.4, 2.1, 8),
    ]},
    // Center peak (tallest): same pattern
    { waypoints: [
      ...quadBezier(0.36, 0.20, 0.44, 0.64, 0.50, 0.86, 2.6, 4.1, 16),
      ...quadBezier(0.50, 0.86, 0.56, 0.64, 0.64, 0.20, 4.1, 5.2, 12),
    ]},
    // Right peak: mirrors left
    { waypoints: [
      ...quadBezier(0.62, 0.20, 0.70, 0.44, 0.76, 0.60, 5.7, 6.8, 12),
      ...quadBezier(0.76, 0.60, 0.80, 0.42, 0.86, 0.20, 6.8, 7.5, 8),
    ]},
    // Horizontal ground line
    { waypoints: line(0.10, 0.20, 0.90, 0.20, 7.9, 8.8, 14) },
  ],
};

// ── Sequence 6 — Bird ─────────────────────────────────────────────────────────
// Simplified crane in flight: two large wing arcs, a compact body,
// an upward neck curve, and a small head arc.
const BIRD: AutoPilotSequence = {
  name: 'bird',
  duration: 7.5,
  strokes: [
    // Left wing: sweeps from body out to upper-left
    { waypoints: quadBezier(0.44, 0.52, 0.28, 0.66, 0.08, 0.58, 0.3, 1.8, 18) },
    // Right wing: mirror
    { waypoints: quadBezier(0.56, 0.52, 0.72, 0.66, 0.92, 0.58, 2.2, 3.7, 18) },
    // Body: compact arc connecting wing roots
    { waypoints: quadBezier(0.38, 0.50, 0.50, 0.44, 0.62, 0.50, 4.1, 5.0, 10) },
    // Neck: elegant curve rising from body
    { waypoints: quadBezier(0.50, 0.54, 0.54, 0.64, 0.60, 0.74, 5.4, 6.2, 9) },
    // Head: small arc suggesting a round crane head
    { waypoints: arc(0.62, 0.76, 0.04, 160, 280, 6.5, 7.1, 8) },
  ],
};

// ── Sequence 7 — Fish ─────────────────────────────────────────────────────────
// Koi silhouette: upper body arc, lower body arc forming a lens shape,
// two tail fans, and a dorsal fin.
const FISH: AutoPilotSequence = {
  name: 'fish',
  duration: 7.2,
  strokes: [
    // Body upper arc: snout → dorsal → tail junction
    { waypoints: quadBezier(0.18, 0.50, 0.46, 0.68, 0.74, 0.52, 0.3, 2.0, 18) },
    // Body lower arc: snout → belly → tail junction
    { waypoints: quadBezier(0.18, 0.50, 0.46, 0.34, 0.74, 0.52, 2.3, 3.8, 16) },
    // Tail upper fan
    { waypoints: quadBezier(0.74, 0.52, 0.82, 0.60, 0.90, 0.64, 4.1, 4.9, 8) },
    // Tail lower fan
    { waypoints: quadBezier(0.74, 0.52, 0.82, 0.44, 0.90, 0.40, 5.1, 5.9, 8) },
    // Dorsal fin: short stroke rising from the back
    { waypoints: quadBezier(0.46, 0.65, 0.44, 0.74, 0.40, 0.78, 6.2, 6.8, 6) },
  ],
};

// ── Sequence 8 — Bamboo ───────────────────────────────────────────────────────
// Two stalks with node marks and leaf clusters. Each stalk segment ends
// at a node; leaves shoot off at diagonals.
const BAMBOO: AutoPilotSequence = {
  name: 'bamboo',
  duration: 9.5,
  strokes: [
    // Stalk 1 — lower section
    { waypoints: quadBezier(0.38, 0.10, 0.36, 0.30, 0.35, 0.42, 0.3, 1.3, 12) },
    // Node 1: short horizontal dash
    { waypoints: line(0.31, 0.42, 0.39, 0.42, 1.6, 1.9, 4) },
    // Stalk 1 — upper section
    { waypoints: quadBezier(0.35, 0.42, 0.33, 0.58, 0.32, 0.78, 2.1, 3.4, 14) },
    // Node 2 mark (placed mid-upper section)
    { waypoints: line(0.28, 0.62, 0.36, 0.62, 3.6, 3.9, 4) },
    // Leaf cluster: two leaves sweeping right from upper stalk
    { waypoints: quadBezier(0.34, 0.68, 0.50, 0.76, 0.64, 0.74, 4.2, 5.0, 10) },
    { waypoints: quadBezier(0.34, 0.66, 0.48, 0.58, 0.58, 0.50, 5.2, 5.9, 9) },
    // Stalk 2 — shorter, offset right
    { waypoints: quadBezier(0.56, 0.26, 0.54, 0.44, 0.52, 0.60, 6.4, 7.4, 12) },
    // Node on stalk 2
    { waypoints: line(0.48, 0.46, 0.56, 0.46, 7.6, 7.9, 4) },
    // Leaf off stalk 2 — sweeps upper-left
    { waypoints: quadBezier(0.53, 0.54, 0.42, 0.64, 0.32, 0.70, 8.2, 9.0, 9) },
  ],
};

// ── Sequence 9 — Spiral ───────────────────────────────────────────────────────
// Outward Archimedes spiral: starts from near-center and blooms outward
// with 2.5 clockwise rotations, ending with a brush-lift flick.
const SPIRAL: AutoPilotSequence = {
  name: 'spiral',
  duration: 5.5,
  strokes: [
    // Outward spiral: r grows from 0.02 to 0.30 over 900° (2.5 rotations CW from top)
    // Ends at 90°−900° = 270° → position (0.50, 0.20) — bottom center
    { waypoints: spiral(0.50, 0.50, 0.02, 0.30, 90, 900, 0.3, 4.0, 60) },
    // Brush-lift flick leftward following the exit tangent at 270°
    { waypoints: line(0.50, 0.20, 0.44, 0.18, 4.3, 4.8, 5) },
  ],
};

// ── Sequence 10 — Rain ────────────────────────────────────────────────────────
// Three waves of diagonal rain streaks sweep from upper-left to lower-right.
// Each stroke is a short line falling at the same angle (dx≈+0.05, dy≈−0.14).
const RAIN: AutoPilotSequence = {
  name: 'rain',
  duration: 8.0,
  strokes: [
    // Wave 1 — upper canvas, left to right
    { waypoints: line(0.08, 0.90, 0.13, 0.76, 0.2, 0.7, 4) },
    { waypoints: line(0.22, 0.94, 0.27, 0.80, 0.5, 1.0, 4) },
    { waypoints: line(0.38, 0.88, 0.43, 0.74, 0.8, 1.3, 4) },
    { waypoints: line(0.54, 0.92, 0.59, 0.78, 1.1, 1.6, 4) },
    { waypoints: line(0.70, 0.86, 0.75, 0.72, 1.4, 1.9, 4) },
    { waypoints: line(0.86, 0.90, 0.91, 0.76, 1.7, 2.2, 4) },
    // Wave 2 — mid-canvas, offset horizontally
    { waypoints: line(0.14, 0.72, 0.19, 0.58, 2.6, 3.1, 4) },
    { waypoints: line(0.30, 0.76, 0.35, 0.62, 2.9, 3.4, 4) },
    { waypoints: line(0.46, 0.70, 0.51, 0.56, 3.2, 3.7, 4) },
    { waypoints: line(0.62, 0.74, 0.67, 0.60, 3.5, 4.0, 4) },
    { waypoints: line(0.78, 0.68, 0.83, 0.54, 3.8, 4.3, 4) },
    // Wave 3 — lower canvas
    { waypoints: line(0.06, 0.52, 0.11, 0.38, 4.8, 5.3, 4) },
    { waypoints: line(0.24, 0.56, 0.29, 0.42, 5.1, 5.6, 4) },
    { waypoints: line(0.44, 0.50, 0.49, 0.36, 5.4, 5.9, 4) },
    { waypoints: line(0.62, 0.54, 0.67, 0.40, 5.7, 6.2, 4) },
    { waypoints: line(0.80, 0.48, 0.85, 0.34, 6.0, 6.5, 4) },
    // Trailing scattered drops
    { waypoints: line(0.16, 0.38, 0.21, 0.24, 6.9, 7.3, 4) },
    { waypoints: line(0.52, 0.34, 0.57, 0.20, 7.1, 7.5, 4) },
  ],
};

export const SEQUENCES: AutoPilotSequence[] = [
  BRANCH, WAVE, CHARACTER, ENSO, MOUNTAIN, FISH, BIRD, BAMBOO, SPIRAL, RAIN,
];

// ── Interpolation ─────────────────────────────────────────────────────────────

export function getAutoPilotSplat(
  seq: AutoPilotSequence,
  t: number,
): { x: number; y: number } | null {
  for (const stroke of seq.strokes) {
    const wps = stroke.waypoints;
    if (!wps.length) continue;
    const first = wps[0];
    const last = wps[wps.length - 1];
    if (t < first.t || t > last.t) continue;

    // Find bracketing waypoints and interpolate
    for (let i = 0; i < wps.length - 1; i++) {
      const a = wps[i];
      const b = wps[i + 1];
      if (t >= a.t && t <= b.t) {
        const f = (t - a.t) / Math.max(b.t - a.t, 1e-6);
        return {
          x: a.x + (b.x - a.x) * f,
          y: a.y + (b.y - a.y) * f,
        };
      }
    }
  }
  return null; // pen lifted
}
