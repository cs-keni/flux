// Deterministic replay mode: activated by ?SIM_HEADLESS=true
// Injects a fixed sequence of splats over REPLAY_TOTAL_FRAMES frames so
// Playwright can screenshot a reproducible sim state for visual regression.

export interface SplatFrame {
  frame: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

function makeStroke(
  x0: number, y0: number,
  x1: number, y1: number,
  startFrame: number,
  count: number,
): SplatFrame[] {
  const dx = (x1 - x0) / count;
  const dy = (y1 - y0) / count;
  return Array.from({ length: count }, (_, i) => ({
    frame: startFrame + i,
    x: x0 + dx * i,
    y: y0 + dy * i,
    dx,
    dy,
  }));
}

// Two strokes: a rising diagonal then a descending arc
export const REPLAY_SEQUENCE: SplatFrame[] = [
  ...makeStroke(0.2, 0.3, 0.7, 0.6, 5, 15),
  ...makeStroke(0.6, 0.7, 0.3, 0.25, 30, 15),
];

export const REPLAY_TOTAL_FRAMES = 60;

export function isHeadless(): boolean {
  return new URLSearchParams(location.search).get('SIM_HEADLESS') === 'true';
}
