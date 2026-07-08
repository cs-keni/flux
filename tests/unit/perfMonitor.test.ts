import { describe, it, expect } from 'vitest';
import { PerfMonitor } from '../../src/sim/perfMonitor';

// Helper: feed n frames of a given delta, return how many times it fired.
function feed(mon: PerfMonitor, dt: number, n: number): number {
  let fires = 0;
  for (let i = 0; i < n; i++) if (mon.overBudget(dt)) fires++;
  return fires;
}

describe('PerfMonitor', () => {
  it('ignores frames during warmup', () => {
    const mon = new PerfMonitor(22, 10, 5); // threshold 22, window 10, warmup 5
    // 5 warmup frames at a janky 50ms produce no verdict even though they're slow
    expect(feed(mon, 50, 5)).toBe(0);
  });

  it('fires once a full post-warmup window averages over threshold', () => {
    const mon = new PerfMonitor(22, 10, 0); // no warmup
    // 9 slow frames: window not full yet
    expect(feed(mon, 50, 9)).toBe(0);
    // 10th completes the window → verdict
    expect(mon.overBudget(50)).toBe(true);
  });

  it('does not fire when the average is under threshold (healthy 60fps)', () => {
    const mon = new PerfMonitor(22, 10, 0);
    expect(feed(mon, 16.7, 40)).toBe(0); // smooth vsync, never downgrades
  });

  it('skips outlier deltas so a single stall cannot poison the window', () => {
    const mon = new PerfMonitor(22, 10, 0);
    // A 5000ms tab-switch stall must be ignored, not counted as jank
    expect(mon.overBudget(5000)).toBe(false);
    // Healthy frames after still never trip
    expect(feed(mon, 16.7, 30)).toBe(0);
  });

  it('ignores zero/negative deltas', () => {
    const mon = new PerfMonitor(22, 5, 0);
    expect(feed(mon, 0, 20)).toBe(0);
    expect(feed(mon, -5, 20)).toBe(0);
  });

  it('clears the window after a verdict and can fire again', () => {
    const mon = new PerfMonitor(22, 5, 0);
    expect(feed(mon, 40, 5)).toBe(1); // first verdict on frame 5
    expect(feed(mon, 40, 5)).toBe(1); // window cleared → fires again on next 5
  });

  it('reset() restarts warmup and clears partial samples', () => {
    const mon = new PerfMonitor(22, 5, 0);
    feed(mon, 40, 3);       // 3 slow samples banked (window not full)
    mon.reset(4);           // fresh warmup of 4
    expect(feed(mon, 40, 4)).toBe(0);         // warmup absorbs them
    expect(feed(mon, 40, 4)).toBe(0);         // only 4 real samples, window needs 5
    expect(mon.overBudget(40)).toBe(true);    // 5th completes a clean window
  });
});
