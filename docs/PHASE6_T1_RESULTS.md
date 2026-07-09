# Phase 6 — T1 profiling results (required artifact)

**Purpose:** T1 asks where the WebGL2 frame budget actually goes, so we don't
assume the Jacobi pressure solve is the bottleneck before measuring. Captured
with `window.__fluxProfile()` (`src/dev/GpuProfiler.ts`,
`EXT_disjoint_timer_query_webgl2` / `TIME_ELAPSED`).

## Run 1 — dev box ceiling (2026-07-08)

- **Device:** Kenny's Windows dev box, native Chrome (not the WSL2 headless
  Chromium — that box has timer queries disabled by ANGLE). Timer queries
  `supported: true`.
- **Resolution:** the tier this box boots (HIGH, 768²) — confirm via the F dev
  overlay if precision matters. Production 40 Jacobi iterations.
- **Samples:** 300 per pass (rolling window). Idle/light painting scene.
- **Frame GPU total (sum of per-pass means):** ~1.50 ms.

| Pass | mean ms | % of GPU | p50 | p95 | p99 |
|------|--------:|---------:|----:|----:|----:|
| pressure (Jacobi ×40) | 0.840 | 55.9% | 0.385 | 2.647 | 4.760 |
| diffuse (Jacobi)      | 0.354 | 23.6% | 0.028 | 1.866 | 2.824 |
| advect-vel            | 0.119 | 7.9%  | 0.007 | 0.983 | 1.899 |
| divergence            | 0.098 | 6.5%  | 0.004 | 0.167 | 1.806 |
| render (display blit) | 0.040 | 2.7%  | 0.016 | 0.017 | 1.034 |
| advect-dye            | 0.021 | 1.4%  | 0.007 | 0.009 | 0.593 |
| boundary              | 0.019 | 1.3%  | 0.006 | 0.006 | 0.040 |
| gradient              | 0.012 | 0.8%  | 0.006 | 0.010 | 0.032 |
| splat                 | ~0.000| 0.0%  | 0     | 0     | 0     |

## Reading

1. **Pressure dominates the compute (56%); pressure + diffuse = ~80%.** Both are
   iterative Jacobi solvers. So the solver IS the correct optimization target —
   Codex's "don't assume Jacobi" caveat resolves to "it does dominate," with data.
2. **But the whole GPU slice is ~1.5 ms against a 16.6 ms budget (~9% util).**
   On this capable device a raw solver speedup is invisible. This is the ceiling
   case; it CANNOT greenlight the migration. The go/no-go gate (T5) is about weak
   devices.
3. **splat reads ~0** because the scene was idle when captured (brackets zero
   draws when `pendingSplats` is empty). Profile mid-drag to capture splat cost.
4. **Per-pass p99s don't co-occur**, so they can't be summed into a frame p99.
   Whole-frame tail latency needs the T3 wall-clock harness; the per-pass tails
   here are directional only. Note the bursty shape: pressure p50 0.385 << mean
   0.84 << p99 4.76.
5. **Readback (`readPixels`) not sampled this run** (no gallery capture / export
   triggered). The WSL2 measurement of ~5.7 ms per sync readback still stands as
   a candidate re-aim target (async readback, P6.3); re-measure on native.

## Decision-tree branch

Pressure dominates → the solver is the thing to spike **if the gate says go**.
The gate is unanswerable on this box. **Next measurement: run the same
`__fluxProfile()` on a genuinely weak/mid GPU (Intel UHD / old laptop),** at the
booting tier and at 1024².

- Pressure balloons and frame breaches ~14 ms with pressure as driver → greenlight T2.
- Cost shows up in fullscreen `render` fill-rate or the readback hitch instead →
  re-aim the spike toward that (cheaper render, or async readback).

## Runs still needed

- [ ] Weak/mid GPU run (decisive for T5).
- [ ] Higher-resolution run (1024²) on the dev box — ceiling for the
      "MID device runs 1024² at 60fps" gate branch.
- [ ] Mid-drag run to capture splat cost.
- [ ] Native readback (`readback` CPU sample) via an R-key gallery capture / export.
