# Flux — PHASES.md

Engineering plan for Flux (Digital Sumi-e fluid simulation).
Source of truth for what is built, what is deferred, and what decisions have been made.

---

## Architecture Decisions (locked)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | WebGL context loss + restore in Phase 1 | iOS GPU resets are common; blank canvas is worse than added complexity |
| D2 | RGBA16F / R16F for all FBOs | Native WebGL 2, no extension needed; 2× mobile fillrate vs RGBA32F |
| D3 | .glsl files via vite-plugin-glsl | Syntax highlighting, linting, #include support for 8+ shaders |
| D4 | Sim resolution decoupled from display canvas | Sim at 512×512, display at viewport × devicePixelRatio |
| D5 | Boundary condition pass in Phase 1 | No-slip at canvas edges prevents velocity accumulation artifacts |
| D6 | All tuning params in src/sim/config.ts | Single location for 200+ tuning iterations during development |
| D7 | visibilitychange handler pauses rAF loop | Prevents background GPU burn; required for iOS context suspend behavior |
| D8 | Playwright deterministic replay + FPS overlay | SIM_HEADLESS mode with fixed dt + JSON input sequence for screenshot determinism |
| D9 | OES_texture_float_linear check + manual bilinear fallback | Correct bilinear advection on ~100% of devices; graceful on the ~2% without extension |
| D10 | Mobile: maxTouchPoints > 0 && screen < 768 → res=256, jacobi=20 | No UA string parsing; DPR alone insufficient (Retina Macs) |
| D11 | Deterministic replay mode for visual regression | Fixed dt=1/60, JSON pointer sequence, pixelmatch threshold 0.1 |
| D12 | Starting Jacobi: 40 desktop / 20 mobile | 20 iterations on 512×512 doesn't converge; 40 is production floor at this resolution |
| D13 | Diffusion Jacobi: configurable, default near-zero (0.0001) | Near-zero viscosity converges in <5 iterations; ink is not viscous |
| D14 | Context loss kept in Phase 1 (vs. outside voice deferral recommendation) | Good architecture forced by reinit pattern benefits whole codebase |
| D15 | Fixed dt = 1/60 with 100ms frame cap | Stability over temporal accuracy; advection backtrace bounded |

---

## Sim Pipeline (per frame)

```
Pointer/Touch Events
       │
       ▼
  InputHandler (normalized [0,1]², DPR-corrected, fixed dt=1/60)
       │
       ▼
  ┌─────────────────────────────────────────────────────┐
  │                  Per-frame GPU passes                │
  │                                                     │
  │  1. SplatPass         inject velocity + dye         │
  │  2. AdvectVelocity    semi-Lagrangian               │
  │  3. DiffuseVelocity   Jacobi × N (default ~5)       │
  │  4. Divergence        ∇·u                           │
  │  5. PressureSolve     Jacobi × 40/20 (desk/mobile) │──┐
  │  6. GradientSubtract  u -= ∇p                       │  │ ping-pong
  │  7. BoundaryCondition no-slip at edges              │  │
  │  8. AdvectDye         dye advects along u           │──┘
  │  9. RenderDye         blit to display canvas        │
  └─────────────────────────────────────────────────────┘
       │
       ▼
  Canvas (CSS viewport size × devicePixelRatio)
```

**FBO layout:**
```
velocity_read / velocity_write  RGBA16F  [vx, vy, 0, 0]  — ping-pong
dye_read / dye_write            RGBA16F  [r,  0,  0, 0]  — ping-pong
divergence                      R16F     [∇·u]
pressure_read / pressure_write  R16F     [p]             — Jacobi ping-pong
```

---

## Phase 1 — Core Simulation (Weeks 1–5)

**Goal:** Sim runs, dye advects realistically, 60fps on M-series, visual regression tests pass.
No paper layer. Dye displayed raw to verify sim correctness.

### Scaffolding
- [x] Vite + TypeScript project init (`npm create vite@latest flux -- --template vanilla-ts`)
- [x] Install dependencies: `vite-plugin-glsl`, `vitest`, `playwright`, `pixelmatch`
- [x] `vite.config.ts` with glsl plugin configured
- [x] `src/sim/config.ts` — all tuning parameters (resolution, jacobiIterations, viscosity, splatRadius, dt, force)
- [x] Mobile detection in config (maxTouchPoints + screen size heuristic)

### WebGL Infrastructure
- [x] `src/main.ts` — canvas init, DPR-correct sizing, init call
- [x] WebGL 2 context creation with no-WebGL-2 fallback message (styled, not blank page)
- [x] `src/sim/FBOManager.ts` — create/destroy FBOs (RGBA16F, R16F), framebuffer completeness check
- [x] WebGL context loss (`webglcontextlost`) + restore (`webglcontextrestored`) handlers
- [x] Canvas resize safety: `pendingResize` flag, applied at top of next rAF frame
- [x] Page lifecycle: `visibilitychange` → pause/resume rAF loop

### GLSL Shaders
- [x] `src/shaders/quad.vert.glsl` — shared fullscreen quad vertex shader
- [x] `src/shaders/splat.frag.glsl` — Gaussian splat, inject velocity + dye
- [x] `src/shaders/advect.frag.glsl` — semi-Lagrangian advection (shared for velocity + dye)
  - Manual bilinear fallback if OES_texture_float_linear absent (D9)
- [x] `src/shaders/diffuse.frag.glsl` — implicit diffusion Jacobi pass
- [x] `src/shaders/divergence.frag.glsl` — compute ∇·u
- [x] `src/shaders/pressure.frag.glsl` — Jacobi pressure solve
- [x] `src/shaders/gradient.frag.glsl` — gradient subtraction (u -= ∇p)
- [x] `src/shaders/boundary.frag.glsl` — no-slip boundary conditions
- [x] `src/shaders/render.frag.glsl` — Phase 1: raw dye blit to display (replaced in Phase 2)

### Fluid Simulation
- [x] `src/sim/FluidSim.ts` — orchestrates GPU passes
  - Fixed dt=1/60, frame cap 100ms (D15)
  - OES_texture_float_linear extension check (D9)
  - ASCII pipeline diagram at top of class
  - Clean `init()` that can be called multiple times (required for context restore)
- [x] rAF loop with proper cleanup (cancel on context loss, restart on restore)

### Input
- [x] `src/input/InputHandler.ts` — pointer events → normalized [0,1]² coords
  - DPR-corrected coordinate math
  - Mouse up / pointer cancel → clear splat state
  - Touch support (single touch for Phase 1)

### Dev Tools
- [x] Dev shader error overlay: `gl.getShaderInfoLog()` + `gl.getProgramInfoLog()` visible in `import.meta.env.DEV`
- [x] FPS overlay: press F in dev mode to show FPS / sim resolution / Jacobi count

### Tests
- [x] Vitest: coordinate normalization math in InputHandler
- [x] Playwright: deterministic replay mode (`SIM_HEADLESS=true` URL param, JSON pointer sequence, fixed dt)
- [ ] Performance baseline: headless FPS benchmark script (60 frames, report avg)

### Phase 1 Success Criteria (all must pass before marking Phase 1 complete)
- [x] 60fps on MacBook Air M-series at 512×512 sim resolution (verified: 280fps)
- [ ] 30fps on mobile at 256×256 sim resolution
- [x] Dye advects smoothly — no hard pixel edges, no numerical blow-up
- [x] Ink bleeds and diffuses, velocity field decays correctly
- [ ] No memory leaks over 10 minutes (Chrome DevTools heap snapshot)
- [x] Canvas resize during active paint → no corruption
- [x] Tab switch → loop pauses, resumes correctly
- [ ] GPU reset simulation (via WEBGL_lose_context.loseContext()) → sim reinitializes
- [x] Playwright visual regression test passes

---

## Phase 2 — The Visual Layer (Weeks 6–10)

- [x] Paper texture shader: FBM + Worley noise composite, warm #F2EDD7 color
- [x] Ink feather render pass: dye concentration → opacity curve (1−exp(−ink×3))
- [x] Ink-on-paper composite: ink over paper texture, alpha blend
- [x] Vignette pass: radial smoothstep, ~28% max darkening at corners
- [x] Palette system: Sumi (#1A1209), Indigo (#1B2A4A), Sepia (#3D2008)
  - Selectable via keyboard only (1/2/3 direct, P to cycle — no visible UI)
  - Secondary hue that appears at thin ink edges (edgeFactor blend, 55% max)
- [x] **Visual milestone:** screenshots look like ink paintings ✓ (Playwright baseline updated)

---

## Phase 3 — Polish and Depth (Weeks 11–18)

- [x] Edge feathering asymmetry: directional bias from velocity field (velocity uniform in render shader, 0.003 UV downstream sample)
- [ ] Wet-on-wet tuning: velocity injection for convincing stroke intersection bleed (deferred to Phase 4)
- [x] Auto-pilot: first 3 choreographed sequences (branch, wave, character) with idle detection
- [x] Save feature: PNG export with paper texture baked in (S key, `canvas.toDataURL`)
- [x] Idle detection: 8s → hint text fades back in; 30s → auto-pilot begins
- [x] Touch support: multi-touch for simultaneous strokes (Map-based pointer tracking)
- [ ] High-DPI export: 2048×2048 PNG (deferred to Phase 4)

**Phase 3 bugs fixed:**
- Frame-rate-independent dissipation (`pow(0.999, elapsed_sec × 60)`) — ink persistence was fps-dependent
- Auto-pilot pen-up transition: reset `autoPilotPrevPos` to null on stroke end to prevent velocity spike at next stroke start
- Per-splat radius override in `SplatEvent` for calligraphic auto-pilot strokes (0.12 vs 0.25 user default)
- Playwright headless timeout: synchronous loop + 40s timeout (RAF/setTimeout throttled to ~4fps in headless Chrome)

---

## Phase 4 — Refinement (Weeks 19–28)

- [x] Auto-pilot: full 10 sequences (ENSO, MOUNTAIN, BIRD, FISH, BAMBOO, SPIRAL, RAIN + 3 from Phase 3)
- [x] Resolution scaling: GPU tier detection — LOW 256/MID 512/HIGH 768
- [x] "Ink dry" animation: 60s idle → ink darkens 12% + edges sharpen (render shader, u_idleTime)
- [x] Keyboard shortcuts: R=reset, S=save, P=cycle, 1/2/3=palette direct, A=autopilot, F=fps (dev)
- [x] Wet-on-wet ink bleed: velocity boost at stroke intersections (wetOnWetStrength=1.8)
- [x] Keyboard shortcut overlay: shown once on load, auto-dismisses after 8s
- [x] High-DPI 2048×2048 export (S key): offscreen WebGL2 re-render with native paper grain

---

## Phase 5 — The Depth Layer (Months 6+)

- [x] Additional palettes: Vermilion (key 4), Pine (key 5), Prussian Blue (key 6)
- [x] Deploy/hosting: https://flux-indol-gamma.vercel.app/ (Vercel, auto-deploys on push to main)
- [ ] WebGPU upgrade → moved to **Phase 6** (spike-gated). See below and `docs/PHASE6_WEBGPU_SPIKE.md`.
- [x] "Watercolor" material mode (W key): transparent washes, softer feather, wet-edge rim
  - `u_material` uniform (0=sumi, 1=watercolor) in render.frag.glsl; signature wet-edge rim (band-pass on concentration), granulation, stronger secondary bleed
  - Material crossfades (~400ms) like the palette, mirrors palette state in FluidSim
  - Persists everywhere: share hash `&m=1`, gallery entry `material` field, export renders current
  - Verified via browse: sumi↔watercolor visually distinct (rim visible), hash + gallery round-trip material
- [x] Gallery: last 5 paintings in localStorage — G key overlay, live restore
  - Stores the dye R field packed into PNG alpha (~30KB each, sparse ink compresses well)
  - Same PNG is both restore data AND CSS-mask thumbnail (tinted with saved palette)
  - Restore uploads the field back into the dye FBO, clears velocity (resumes calm/paintable)
  - Captures on R (before clear) + on pagehide; blank canvases skipped (MIN_COVERAGE)
  - Pure helpers unit-tested; full paint→capture→restore loop verified via browse
- [x] Shareable link: URL hash encodes auto-pilot sequence + palette (`#p=<idx>&s=<name>`)
  - Parses on load → applies palette + starts that sequence (non-forced)
  - Live-updates via `history.replaceState` on palette change and sequence start
  - `C` key copies `location.href` to clipboard (flash "link copied.")
  - Pure module `src/share/shareLink.ts` + 14 unit tests
- [ ] Sound reactivity: mic input → auto-pilot speed or injection force
- [x] Dynamic resolution downgrade: monitor frame time, drop tier on sustained jank
  - `PerfMonitor` (src/sim/perfMonitor.ts): 90-frame avg > 22ms → downgrade; skips outliers + warmup
  - `TIERS` ladder + `lowerTierFor()` in config.ts; one-way, floors at LOW (256)
  - `FluidSim.rebuildAt()` rebuilds FBOs; painting preserved across the rebuild (resampled)
  - Verified via DEV-only `__fluxForceDowngrade` hook (tree-shaken from prod): 512→256 kept the stroke

---

## Phase 6 — WebGPU Upgrade (spike-gated) → **NO-GO** (spike complete 2026-07-08)

**Spike ran and concluded NO-GO.** Full decision + numbers:
`docs/PHASE6_T5_DECISION.md`. Spec: `docs/PHASE6_WEBGPU_SPIKE.md`; profiling data:
`docs/PHASE6_T1_RESULTS.md`. No production solver code was written (instrumentation
only) — nothing to revert.

**Why no-go:** even 2048²×40 Jacobi = ~3ms mean / ~1.4ms median of a 16.6ms budget
(5× headroom); scaling is wildly sublinear (7.1× pixels → 1.5× time) so this GPU
is coasting; WebGL2 already holds 1024² trivially; and we have no weak device to
test the only branch that could greenlight. WebGPU would be a permanent 2nd backend
(Firefox-flagged) for an invisible speedup. Revisit only if a weak/mid GPU becomes
available, or a compute-heavy feature changes the calculus.

- [x] **T1** — Profiled WebGL2 frame per-pass (`EXT_disjoint_timer_query`). Instrument `src/dev/GpuProfiler.ts` + hooks `__fluxProfile()` / `__fluxSetRes()` (DEV-only, tree-shaken). Result: solver dominates the compute (pressure 56–75%) but is tiny in absolute terms. See `docs/PHASE6_T1_RESULTS.md`.
- [x] **T5** — Go/no-go: **NO-GO**, recorded in `docs/PHASE6_T5_DECISION.md`.
- [n/a] T2–T4, T6 — moot; spike did not greenlight.

**Salvaged finding (the one real user-visible cost, and it isn't the solver):**
the sync `readPixels` in `FluidSim.readDyeField()` stalls ~5.7ms at 768² and scales
with pixels (2048² export ≈ 7× → a visible freeze). Fixable in WebGL2, no WebGPU.

### Phase 6b — WebGL2 async readback (PBO) — the actual deliverable

- [ ] **Async gallery/export readback** — `readPixels` into a `PIXEL_PACK_BUFFER` + `fenceSync`, poll `clientWaitSync(…, 0)` across frames, `getBufferSubData` when signaled. Removes the export/gallery-capture freeze.
  - [ ] R-key gallery capture → async (no visible hitch mid-paint).
  - [ ] PNG export (`exportHighRes`, 2048²) → async (the biggest stall).
  - [ ] **`pagehide` capture stays synchronous** — page is unloading, no time to poll a fence. Keep the sync path for that one caller.
  - [ ] Verify the fix with the `readback` CPU sampler (`__fluxProfile()` before/after).
  - [ ] Remove spike instrumentation (`GpuProfiler`, `__fluxSetRes`) once verified.

---

## NOT in scope (explicit deferrals)

| Item | Rationale |
|------|-----------|
| Audio (default) | Silence is a design decision, not a deferred feature |
| React/Vue/any framework | Canvas is the entire experience; framework overhead is noise |
| UI chrome (toolbar, color picker, buttons) | Ruins the illusion. Keyboard-only interaction. |
| Multi-color per session | Makes it look like a digital toy, not a painting instrument |
| CI/CD pipeline | Out of scope until near Phase 3 |
| Server-side anything | This is a pure frontend static app |

---

## Open Questions

| Question | Status |
|----------|--------|
| Paper texture: procedural (GLSL FBM) vs scanned paper image? | Open — Phase 2 decision |
| Auto-pilot idle delay: 30s desktop vs 60s mobile? | Open — Phase 3 decision |
| Mobile sim resolution: 256×256 sufficient? | Open — needs real device validation in Phase 1 |

---

## TODOS (deferred, not forgotten)

- [ ] **WebGPU abstraction layer** — Design a minimal `GpuBackend` interface (createBuffer, createProgram, runPass) so WebGPU can be swapped in without a full rewrite in Phase 5. Decision point: FBO concept maps to WebGPU render passes differently. Depends on: Phase 1 complete.

---

## Implementation Tasks
Synthesized from eng review findings. Each task derives from a specific finding. Run with Claude Code or Codex; checkbox as you ship.

- [x] **T1 (P1, human: ~2h / CC: ~10min)** — Scaffold — Init Vite + TypeScript project with vite-plugin-glsl, vitest, playwright
  - Surfaced by: Architecture review — greenfield project needs scaffold
  - Files: `package.json`, `vite.config.ts`, `index.html`
  - Verify: `npm run dev` serves page, `npm run build` succeeds

- [x] **T2 (P1, human: ~30min / CC: ~5min)** — Config — Create `src/sim/config.ts` with all tuning params + mobile detection
  - Surfaced by: Code quality D6+D10 — scatter vs single-source for 200+ tuning iterations
  - Files: `src/sim/config.ts`
  - Verify: Mobile params activate on simulated mobile viewport

- [x] **T3 (P1, human: ~1h / CC: ~10min)** — WebGL init — WebGL 2 context creation + styled no-WebGL-2 fallback message
  - Surfaced by: Failure modes — critical gap: blank page on unsupported browser
  - Files: `src/main.ts`
  - Verify: Disable WebGL in Chrome flags → styled message appears

- [x] **T4 (P1, human: ~2h / CC: ~15min)** — FBOManager — Create/destroy RGBA16F + R16F FBOs with framebuffer completeness check
  - Surfaced by: Architecture D2 — half-float, native WebGL 2, no extension
  - Files: `src/sim/FBOManager.ts`
  - Verify: `gl.checkFramebufferStatus()` returns FRAMEBUFFER_COMPLETE

- [x] **T5 (P1, human: ~1h / CC: ~10min)** — Context lifecycle — Context loss/restore + visibilitychange pause/resume
  - Surfaced by: Architecture D1 + Code quality D7 — iOS GPU reset + background burn
  - Files: `src/main.ts`, `src/sim/FluidSim.ts`
  - Verify: `WEBGL_lose_context.loseContext()` → reinit → sim resumes

- [x] **T6 (P1, human: ~30min / CC: ~5min)** — Resize safety — `pendingResize` flag applied at top of next rAF frame
  - Surfaced by: Failure modes — critical gap: FBO corruption on mid-frame resize
  - Files: `src/sim/FluidSim.ts`
  - Verify: Rapid window resize during active paint → no corruption

- [x] **T7 (P1, human: ~30min / CC: ~5min)** — Shaders: quad.vert — Shared fullscreen quad vertex shader
  - Surfaced by: Architecture D3 — .glsl files with vite-plugin-glsl
  - Files: `src/shaders/quad.vert.glsl`
  - Verify: Imports cleanly in TypeScript, renders fullscreen quad

- [x] **T8 (P1, human: ~1h / CC: ~10min)** — Shaders: splat.frag — Gaussian splat, inject velocity + dye
  - Surfaced by: Phase 1 core sim
  - Files: `src/shaders/splat.frag.glsl`
  - Verify: Visible dye injected at pointer position

- [x] **T9 (P1, human: ~2h / CC: ~15min)** — Shaders: advect.frag — Semi-Lagrangian advection + manual bilinear fallback
  - Surfaced by: Performance D9 + D15 — bilinear correctness + fixed dt=1/60
  - Files: `src/shaders/advect.frag.glsl`
  - Verify: Dye advects smoothly, no hard pixel edges

- [x] **T10 (P1, human: ~1h / CC: ~10min)** — Shaders: diffuse.frag — Implicit diffusion Jacobi (~5 iterations at near-zero viscosity)
  - Surfaced by: Cross-model D13 — configurable viscosity, near-zero default for ink
  - Files: `src/shaders/diffuse.frag.glsl`
  - Verify: Ink diffuses slightly without going viscous

- [x] **T11 (P1, human: ~45min / CC: ~8min)** — Shaders: divergence.frag — Compute ∇·u
  - Surfaced by: Phase 1 core sim (Stam's algorithm)
  - Files: `src/shaders/divergence.frag.glsl`
  - Verify: Divergence field is non-zero before pressure solve, near-zero after

- [x] **T12 (P1, human: ~1h / CC: ~10min)** — Shaders: pressure.frag — Jacobi pressure solve (40 desktop / 20 mobile)
  - Surfaced by: Cross-model D12 — outside voice: 20 iterations doesn't converge on 512×512
  - Files: `src/shaders/pressure.frag.glsl`
  - Verify: Dye flows in divergence-free pattern (no visible compressibility artifacts)

- [x] **T13 (P1, human: ~45min / CC: ~8min)** — Shaders: gradient.frag — Gradient subtraction u -= ∇p
  - Surfaced by: Phase 1 core sim (Stam's algorithm)
  - Files: `src/shaders/gradient.frag.glsl`
  - Verify: Velocity field divergence-free after this pass

- [x] **T14 (P1, human: ~1h / CC: ~10min)** — Shaders: boundary.frag — No-slip boundary conditions at canvas edges
  - Surfaced by: Code quality D5 — prevents velocity accumulation at edges
  - Files: `src/shaders/boundary.frag.glsl`
  - Verify: Ink doesn't pool permanently at canvas edges

- [x] **T15 (P1, human: ~30min / CC: ~5min)** — Shaders: render.frag — Phase 1 raw dye blit to display (replaced Phase 2)
  - Surfaced by: Phase 1 design decision — validate sim before visual layer
  - Files: `src/shaders/render.frag.glsl`
  - Verify: Dye texture visible on canvas

- [x] **T16 (P1, human: ~3h / CC: ~20min)** — FluidSim — Orchestrate all 9 passes; fixed dt=1/60, 100ms cap; clean reinit(); ASCII diagram comment
  - Surfaced by: Architecture D15 + D14 — fixed dt + clean init for context restore
  - Files: `src/sim/FluidSim.ts`
  - Verify: Full loop runs, all passes execute in correct order

- [x] **T17 (P1, human: ~1h / CC: ~10min)** — InputHandler — Pointer/touch → normalized [0,1]² DPR-corrected coords
  - Surfaced by: Architecture D4 — correct coordinate math for high-DPI
  - Files: `src/input/InputHandler.ts`
  - Verify: Splat appears at cursor position on Retina display

- [x] **T18 (P1, human: ~1h / CC: ~10min)** — Dev tools — Shader error overlay (DEV mode) + FPS overlay (F key)
  - Surfaced by: Code quality — silent GLSL errors are 5-week development blocker
  - Files: `src/main.ts` (or `src/dev/DevOverlay.ts`)
  - Verify: Introduce typo in .glsl → red overlay appears in dev, not in prod build

- [x] **T19 (P2, human: ~2h / CC: ~15min)** — Tests: Playwright — Deterministic replay mode (SIM_HEADLESS, JSON pointer, pixelmatch)
  - Surfaced by: Cross-model D11 — GPU sims non-deterministic, need seeded input
  - Files: `tests/e2e/`, `playwright.config.ts`
  - Verify: Same input sequence → same screenshot ± pixelmatch threshold

- [x] **T20 (P2, human: ~1h / CC: ~10min)** — Tests: Vitest — Coordinate normalization, config loading, mobile detection unit tests
  - Surfaced by: Test review — unit-testable pure functions
  - Files: `tests/unit/`
  - Verify: `npm run test` passes

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 10 issues, 3 critical gaps resolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**OUTSIDE VOICE:** Claude subagent ran. Found 5 real gaps (D11–D15) and 1 intentional design observation. All 5 incorporated into plan. No cross-model tension remaining.

**VERDICT:** ENG CLEARED — ready to implement Phase 1.

NO UNRESOLVED DECISIONS

