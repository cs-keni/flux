import { describe, it, expect } from 'vitest';

// Mirrors the private normalize() in InputHandler — tested here as pure math
// so we don't pull in the WebGL FluidSim dependency.
function normalize(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  return {
    x: (clientX - rect.left) / rect.width,
    y: 1.0 - (clientY - rect.top) / rect.height,
  };
}

const CANVAS = { left: 0, top: 0, width: 1280, height: 720 };

describe('coordinate normalization', () => {
  it('center of canvas maps to (0.5, 0.5)', () => {
    const { x, y } = normalize(640, 360, CANVAS);
    expect(x).toBeCloseTo(0.5);
    expect(y).toBeCloseTo(0.5);
  });

  it('top-left corner maps to (0, 1) — Y is flipped for WebGL', () => {
    const { x, y } = normalize(0, 0, CANVAS);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(1);
  });

  it('bottom-right corner maps to (1, 0)', () => {
    const { x, y } = normalize(1280, 720, CANVAS);
    expect(x).toBeCloseTo(1);
    expect(y).toBeCloseTo(0);
  });

  it('top-right maps to (1, 1)', () => {
    const { x, y } = normalize(1280, 0, CANVAS);
    expect(x).toBeCloseTo(1);
    expect(y).toBeCloseTo(1);
  });

  it('handles non-zero canvas offset', () => {
    const offset = { left: 100, top: 50, width: 800, height: 600 };
    const { x, y } = normalize(500, 350, offset);
    expect(x).toBeCloseTo(0.5);     // (500-100)/800 = 0.5
    expect(y).toBeCloseTo(0.5);     // 1 - (350-50)/600 = 0.5
  });

  it('Y is inverted relative to screen (WebGL origin is bottom-left)', () => {
    const top = normalize(640, 0, CANVAS);
    const bottom = normalize(640, 720, CANVAS);
    expect(top.y).toBeGreaterThan(bottom.y);
    expect(top.y).toBeCloseTo(1);
    expect(bottom.y).toBeCloseTo(0);
  });
});
