// PerfMonitor — decides when the sim is sustained-janky enough to drop a GPU tier.
//
// Design intent: never react to a single spike. A GC pause, a tab refocus, or
// the first frame after load all produce huge deltas that must NOT trigger a
// downgrade. So we skip outliers, warm up, then judge the AVERAGE over a full
// window. The decision is one-way (downgrade only); the caller stops at the tier
// floor, so this can't oscillate.
//
// Threshold framing: a healthy 60Hz vsync display sits at ~16.7ms/frame; a
// struggling one at 30fps is ~33ms. 22ms cleanly separates "smooth" from
// "grinding" (~45fps) without punishing a normal 60fps cap.

export const DEFAULT_THRESHOLD_MS = 22;
export const DEFAULT_WINDOW = 90;   // frames averaged before a verdict (~1.5s at 60fps)
export const DEFAULT_WARMUP = 45;   // frames ignored after start / after a downgrade
export const DEFAULT_MAX_SAMPLE_MS = 100; // deltas above this are outliers (tab switch, stall)

export class PerfMonitor {
  private samples: number[] = [];
  private warmup: number;

  constructor(
    private thresholdMs = DEFAULT_THRESHOLD_MS,
    private windowSize = DEFAULT_WINDOW,
    warmupFrames = DEFAULT_WARMUP,
    private maxSampleMs = DEFAULT_MAX_SAMPLE_MS,
  ) {
    this.warmup = warmupFrames;
  }

  // Start a fresh warmup + empty window (call right after a downgrade so the new
  // resolution settles before we consider dropping again).
  reset(warmupFrames = DEFAULT_WARMUP): void {
    this.samples = [];
    this.warmup = warmupFrames;
  }

  // Feed one frame delta (ms). Returns true exactly once when a full window's
  // average exceeds the threshold; the window then clears for the next verdict.
  overBudget(dtMs: number): boolean {
    if (this.warmup > 0) {
      this.warmup--;
      return false;
    }
    // Skip outliers so stalls and refocuses don't poison the average.
    if (dtMs <= 0 || dtMs > this.maxSampleMs) return false;

    this.samples.push(dtMs);
    if (this.samples.length < this.windowSize) return false;

    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples = [];
    return avg > this.thresholdMs;
  }
}
