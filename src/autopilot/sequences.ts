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

export const SEQUENCES: AutoPilotSequence[] = [BRANCH, WAVE, CHARACTER];

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
