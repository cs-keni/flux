# Phase 6 — T5 go/no-go decision (required artifact)

**Date:** 2026-07-08
**Call:** **NO-GO on the WebGPU migration.** Salvage the one real finding by
fixing the sync-readback hitch in WebGL2 (Pixel Buffer Objects + `fenceSync`),
then spend the innovation token on sound reactivity.

## The data (T1 + resolution sweep, native Chrome, dev box)

Frame GPU cost measured per-pass with `EXT_disjoint_timer_query_webgl2`
(`src/dev/GpuProfiler.ts`), production 40 Jacobi iterations, 300 samples/pass.

| Resolution | texels vs 768² | frame total (mean) | pressure mean | pressure p50 | pressure p99 |
|-----------:|---------------:|-------------------:|--------------:|-------------:|-------------:|
| 768² (ship tier) | 1.0× | 1.98 ms | 1.13 | 0.55 | 7.12 |
| 1024² | 1.78× | 1.71 ms | 1.19 | 0.32 | 6.21 |
| 1536² | 4.0× | 2.22 ms | 1.52 | 0.58 | 11.69 |
| 2048² | 7.1× | 3.00 ms | 2.26 | 1.10 | 12.42 |

## Why no-go

1. **The GPU is coasting — scaling is wildly sublinear.** 7.1× the pixels buys
   only ~1.5× the frame time (throughput-bound would be ~7×). At these sizes the
   cost is dominated by fixed per-dispatch overhead, not arithmetic. Even
   2048²×40 Jacobi = ~3 ms mean / ~1.4 ms median vs a 16.6 ms budget → 5×
   headroom at the ceiling.
2. **Pressure dominates the share (57→75%) but is never expensive** in absolute
   terms — 1–2 ms of a 16.6 ms frame. The exact pass WebGPU would optimize is
   invisible to the user.
3. **WebGL2 already holds 1024² trivially (1.7 ms).** This directly fails the
   "device WebGL2 can't hold 1024² on" greenlight branch. The other branch (weak
   device gains a tier) requires weak silicon we don't have, and the sublinear
   curve means a fast GPU can't be extrapolated to a weak one.
4. **Cost/benefit unchanged from the plan:** WebGPU would be a *permanent* second
   backend (Firefox still flags it) — every shader authored twice — for an
   invisible speedup. Uncertain payoff, high ongoing cost.

## The one finding worth acting on — and it isn't the solver

The sync `readPixels` in `FluidSim.readDyeField()` stalls the main thread
~5.7 ms at 768² (measured; Chromium logs `GPU stall due to ReadPixels`), and it
scales with pixel count — the 2048² PNG export is ~7× that, a visible multi-frame
freeze on export / gallery-capture. That is a real user-visible hitch, unlike the
solver.

**It does not require WebGPU.** WebGL2 supports async readback via Pixel Buffer
Objects: `readPixels` into a `PIXEL_PACK_BUFFER`, insert a `fenceSync`, poll
`getSyncParameter` / `clientWaitSync(…, 0)` across frames, then `getBufferSubData`
when signaled. Async readback (the WebGPU migration's best justification) is
achievable in the existing backend with no second-backend tax.

## Decision & next steps

- **NO-GO** on WebGPU migration (P6.1–P6.4 shelved). Revisit only if a genuinely
  weak/mid GPU becomes available to test the weak-device gate, or if a future
  compute-heavy feature changes the calculus.
- **DO:** WebGL2 PBO + `fenceSync` async readback for gallery capture (R key) and
  PNG export. Design wrinkle: the `pagehide` capture must stay synchronous (the
  page is unloading — no time to poll a fence), so async applies to R-key capture
  and export, not pagehide.
- **THEN:** sound reactivity (mic → auto-pilot / injection force).
- Spike instrumentation (`GpuProfiler`, `__fluxProfile`, `__fluxSetRes`) is
  **kept** — the `readback` CPU sampler is how we'll verify the PBO fix drops the
  stall. Remove after the readback work lands.

## Spike governance (T6)

Timeboxed and closed at T5 as planned. Artifacts of record: this doc,
`docs/PHASE6_T1_RESULTS.md`, `docs/PHASE6_WEBGPU_SPIKE.md`. No production solver
code was written for the spike (instrumentation only), so there is nothing to
revert.
