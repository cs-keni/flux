# Phase 6 — WebGPU Upgrade (spike-gated)

**Status:** Not started. Gated behind a throwaway perf spike. Do NOT begin the
migration (P6.1+) until the spike greenlights it.

Locked by `/plan-eng-review` on 2026-07-08 (eng review + Codex outside voice,
both cross-model tensions resolved in Codex's direction). See
`docs/ENGINEERING_LOG.md` 2026-07-08.

---

## Why a spike first

Flux already holds 60fps at 768² on mid GPUs. A raw GPU speedup under an
already-met frame budget is **invisible to the user**. WebGPU's compute
advantage is also real but *smallest and least certain* for a grid-based
Eulerian solver on small textures (vs the particle-scatter sims that show the
headline wins). And Firefox still ships WebGPU behind a flag, so `WebGL2Backend`
would be a **permanent** second backend — every future shader authored twice.

That combination (uncertain payoff, high and ongoing cost) is exactly what a
throwaway spike exists to de-risk. We do not spend the innovation token until a
measurement says the user gets something they can't get today.

---

## The spike (throwaway, ~1 day, hard timebox)

```
  T1. PROFILE FIRST
    Instrument the CURRENT WebGL2 frame per-pass (EXT_disjoint_timer_query).
    Where does the 16.6ms actually go?
        ├── pressure dominates ──► spike it (T2/T3 below)
        └── dye / render / bandwidth / readback dominates ──► RE-AIM the spike
            or reconsider the migration entirely. (Do not assume Jacobi is the
            bottleneck — Codex's core objection. Measure before optimizing.)

  T2. WEBGPU COMPUTE (correct solver)   ┐ parallel after T1
    Global Jacobi, one dispatch per      │
    iteration — the SAME equation as     │
    WebGL2 (apples-to-apples).           │
    Shared-memory tiled block-Jacobi is  │
    allowed ONLY if it passes a residual │
    + pixel-diff equivalence check vs    │
    WebGL2. If tiling changes the ink    │
    look, it is disqualified.            │
                                         │
  T3. BENCHMARK HARNESS                  ┘
    GPU timer queries on both backends + wall-clock frame pacing FALLBACK
    (timestamp-query is optional and often disabled on weak devices).
    Report p95/p99 frame time, not median — a 60fps gate lives in the tail.
    Production 40 Jacobi iterations. Deterministic scenes: idle, active
    painting, many-splats, gallery capture. Discard warmup.

  T4. MULTI-DEVICE
    Dev box (ceiling/sanity) AND >=1 genuinely weak/mid GPU (Intel UHD / old
    laptop) — the device the gate is actually about. Randomized/interleaved
    A/B order, fixed power mode, run to steady state.

  T5. GO / NO-GO (outcome-based, with margin)
    GREENLIGHT the migration ONLY IF a real weak device gains a resolution
    tier at p95 < ~14ms (headroom to survive browser noise + UI load):
      • LOW-tier device runs MID (512²) at stable 60fps, OR
      • MID device runs 1024² at 60fps that WebGL2 cannot hold.
    ELSE NO-GO → spend the token on sound reactivity or new visual features.
    Write a decision doc artifact recording the numbers and the call.

  T6. GOVERNANCE
    Hard timebox + required-artifacts list so the spike cannot sprawl into
    half a backend.
```

### Key correctness note (would-have-bitten)

"Multiple Jacobi iterations per dispatch" is **not** the same solver as global
Jacobi: you cannot sync workgroups within a dispatch, so tiled multi-iteration
degrades to block-Jacobi with stale halo boundaries, changing convergence AND
the visual ink behavior. Benchmarking that against WebGL2 global Jacobi is
apples-to-oranges and could report a fast number for a sim that paints
differently. Hence the mandatory residual + pixel-diff equivalence gate on any
tiled variant (reuse the SIM_HEADLESS Playwright pixelmatch harness).

---

## If greenlit — migration phases (NOT part of the spike)

| Phase | Work | Ships |
|-------|------|-------|
| P6.1 | `GpuBackend` interface; move today's code behind `WebGL2Backend`, **zero behavior change**; make boot async | Refactor that proves the seam. Existing 64 unit + hardened Playwright e2e are the regression net. |
| P6.2 | Port 8 shaders GLSL→WGSL; `WebGPUBackend` solver + render; feature-detect `navigator.gpu`, WebGL2 **permanent** fallback | WebGPU path live |
| P6.3 | Async readback (`mapAsync`) for gallery + PNG export; keep sync WebGL2 path | Feature parity |
| P6.4 | Perf validation (browser/adapter matrix, thermal/power), flip default | Validated default |

### Seam shape (decided, contingent on greenlight)

**Thin** `GpuBackend`: the backend owns texture/pass primitives; `FluidSim`
keeps the solver orchestration (pass ordering, iteration counts, crossfade
math). Avoids duplicating solver logic across two backends. Locked in P6.1.

---

## Deferred to the migration decision, not the spike

- Browser/adapter matrix (Safari, mobile, Apple GPU, ANGLE/WSL) — a P6.2/P6.4
  concern; the spike answers "is it worth starting."
- Battery/thermal cost accounting — P6.4 validation input, not a go/no-go input.
- Permanent WebGL2 + WebGPU maintenance tax (shaders authored twice) — priced
  into the P6.1 decision, not the spike.
- See `TODOS.md`: measure the gallery/PNG-export readback stall — it may be the
  *real* user-visible payoff (async readback), independent of frame rate.
