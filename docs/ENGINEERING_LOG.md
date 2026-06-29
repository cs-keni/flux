# Engineering Log

## 2026-06-29

### Phase 4 — auto-pilot sequences (7 new, total 10)

**Files changed:** `src/autopilot/sequences.ts`

Added 7 new auto-pilot sequences to reach the 10-sequence target:

- **ENSO**: single 340° sweeping arc (Zen circle with traditional gap) + brush-lift tail
- **MOUNTAIN**: three peaks inspired by 山, each up-and-over stroke + horizontal ground line
- **BIRD**: crane in flight — two large wing arcs, body, neck curve, small head arc
- **FISH**: koi silhouette — upper/lower body arcs forming a lens, two tail fans, dorsal fin
- **BAMBOO**: two stalks with node marks and leaf clusters in diagonal strokes
- **SPIRAL**: outward Archimedes spiral (2.5 rotations, r 0.02→0.30) + exit flick
- **RAIN**: 18 short diagonal streaks in three waves sweeping upper→lower canvas

New helpers added: `arc()` (circle segment, clockwise sweepDeg) and `spiral()` (Archimedes, r grows with f).

All coordinates respect WebGL y-up convention. TypeScript type-check passes; 14 Vitest unit tests pass.

---

### Phase 3 — polish and depth (multi-touch, auto-pilot, save/reset, directional feather)

**Files changed:** `src/sim/FluidSim.ts`, `src/main.ts`, `src/input/InputHandler.ts`, `src/shaders/render.frag.glsl`, `src/autopilot/sequences.ts` (new), `src/ui/HintOverlay.ts` (new), `tests/e2e/fluid.spec.ts`, `PHASES.md`, `docs/`

**Directional feather** (`render.frag.glsl`):
- Added `uniform sampler2D u_velocity` to render shader
- Samples ink concentration 0.003 UV units downstream; blends up to 28% at high velocity
- Ink edge is softer in the direction of flow (trailing edge feathers more than leading)
- Velocity threshold: speed > 5.0 sim units, strength clamped to `speed / 280.0`

**Frame-rate-independent dissipation** (`FluidSim.ts`):
- Fixed: `u_dissipation = 0.999` per frame was framerate-dependent (at 280fps: 75.8%/s remains; at 60fps: 94.1%/s)
- Fix: `dissipation = pow(0.999, elapsed_sec × 60)` normalizes to 60fps-equivalent
- Result: ink persistence is identical regardless of actual framerate
- `step(_elapsed)` renamed to `step(elapsed)` — param is now used

**Per-splat radius override** (`FluidSim.ts`):
- Added `radius?: number` to `SplatEvent` interface
- `step()` uses `s.radius ?? splatRadius` — per-splat brush width override
- Auto-pilot uses `radius: 0.12` (calligraphic) vs user default `0.25` (broad)

**Multi-touch** (`InputHandler.ts`):
- Replaced single-pointer state with `Map<pointerId, {x,y}>`
- `setPointerCapture` on pointerdown; `pointercancel` handled identically to pointerup
- Each active pointer fires independent splats each frame

**Hint overlay** (`HintOverlay.ts` — new):
- "drag to paint." appears at load, fades on first input (1.4s ease)
- Returns after 8s idle via `setTimeout` (not RAF)
- Hidden during auto-pilot, re-scheduled after each sequence

**Auto-pilot sequences** (`autopilot/sequences.ts` — new):
- Three time-based sequences: BRANCH (8.5s), WAVE (7.5s), CHARACTER (8.0s)
- Waypoints sparse (12–24/stroke); `getAutoPilotSplat()` linearly interpolates
- Pen-up gaps between strokes: no splat fired; `autoPilotPrevPos` reset to null on lift (fixed velocity-spike bug at stroke joins)
- Idle threshold: 30s → auto-starts, loops through sequences with 3s pause between

**Keyboard shortcuts** (`main.ts`):
- `1/2/3` — direct palette select; `P` — cycle palette
- `R` — reset canvas; `S` — save PNG (`preserveDrawingBuffer: true` required)
- `A` — toggle auto-pilot (forced mode, ignores idle timer)

**Playwright headless fix** (`main.ts`, `tests/e2e/fluid.spec.ts`):
- Headless loop changed from RAF → synchronous for-loop (RAF/setTimeout throttled to ~4fps in Playwright Chromium)
- GPU stalls from ping-pong FBO sync cause ~15s total for 60 frames in software GL
- Test timeout increased from 15s → 40s to accommodate headless GL overhead
- `try-catch` around `sim.init()` for cleaner error surface on unsupported hardware

**Visual verification**: rendered BRANCH sequence via pointer events shows clean calligraphic trunk + branches with feathered ink edges — matches sumi-e aesthetic.

### Phase 2 commit — feat: implement full Phase 2 visual layer (paper, ink feather, vignette, palette)

**Files changed:** `src/shaders/render.frag.glsl`, `src/sim/config.ts`, `src/sim/FluidSim.ts`, `src/main.ts`, `tests/e2e/fluid.spec.ts-snapshots/fluid-baseline-chromium-linux.png`, `PHASES.md`, `docs/`

**Paper texture** (`render.frag.glsl`):
- 5-octave FBM with 30° rotation to break grid alignment, scale 580×
- Worley (cellular) noise at scale 30× for paper fiber structure
- Mix: 78% FBM + 22% Worley, ±2.8% luminance variation on #F2EDD7 base

**Ink feather curve** (`render.frag.glsl`):
- `opacity = 1 − exp(−rawInk × 3.0)` — exponential onset with long low-opacity tail
- Clamps RGBA16F overshoot at 1.5 before feather curve
- ink=0.1 → 26%; ink=0.5 → 78%; ink=1.0 → 95%

**Secondary edge hue** (`render.frag.glsl`):
- `edgeFactor = 1 − smoothstep(0.05, 0.40, rawInk)` — active at thin ink margins
- Blends up to 55% secondary color at the outer feather of each stroke
- Creates physical ink-bleeding-into-paper-fibers appearance

**Ink-on-paper composite**: alpha blend `mix(paperColor, inkColor, opacity)`

**Vignette**: `1 − smoothstep(0.55, 1.0, length(uv−0.5)×1.85) × 0.28` — ~28% max darkening at corners

**Palette system** (`config.ts`, `FluidSim.ts`, `main.ts`):
- `Palette` interface: `primary` + `secondary` (linear RGB tuples)
- `PALETTES[3]`: Sumi (#1A1209, blue-grey secondary), Indigo (#1B2A4A, lighter cool blue), Sepia (#3D2008, warm amber)
- `FluidSim.setPalette(n)` + `FluidSim.cyclePalette()`
- Keyboard handlers in `main.ts`: `1/2/3` direct, `P` to cycle
- Uniforms `u_inkPrimary` / `u_inkSecondary` passed to render shader every frame

**Playwright baseline**: regenerated on chromium-linux 1280×720 — 1 test passing

## 2026-06-28

### d2b89cf — fix: surface runtime errors before sim init and add EXT_color_buffer_float guard
- Moved `initDevOverlay()` call to before `sim.init()` in `src/main.ts` so any shader compile
  or extension failure is caught by the unhandledrejection handler and shown on screen.
- Added `gl.getExtension('EXT_color_buffer_float')` check at top of `FluidSim.init()`.
  WebGL 2 requires this extension to render into RGBA16F / R16F framebuffers; without it
  `checkFramebufferStatus()` returns incomplete and throws, which was the root cause of the
  silent "bad page" on first load.
- Broadened DevOverlay unhandledrejection handler to catch all error types, not just strings
  matching "compile failed" / "link failed".

### 51fb486 — feat(T3-T18): implement full Phase 1 simulation core
- All 9 GLSL shaders (quad.vert, splat, advect, diffuse, divergence, pressure, gradient,
  boundary, render)
- FBOManager with RGBA16F ping-pong (velocity, dye) and R16F (divergence, pressure)
- FluidSim 9-pass orchestrator, InputHandler (pointer → normalized UV, Y-flipped, DPR-correct)
- DevOverlay (FPS counter, F-key toggle, error banner)

### 0abb00a / f0cf33a — T1-T2: project scaffold + SimConfig
- Vite 8 + TypeScript, vite-plugin-glsl, vitest, playwright scaffolded
- SimConfig with desktop/mobile tuning params and isMobile() detection

### [pending commit] — feat(T19-T20): add Playwright visual regression + Vitest unit tests
- `src/sim/headless.ts` (NEW): `REPLAY_SEQUENCE` (two deterministic strokes), `REPLAY_TOTAL_FRAMES=60`, `isHeadless()`
- `src/main.ts`: headless branch — when `?SIM_HEADLESS=true`, runs fixed replay then sets `html[data-sim-ready]`
- `playwright.config.ts` (NEW): Chromium, 1280×720, reuses existing dev server
- `tests/e2e/fluid.spec.ts` (NEW): waits for `data-sim-ready`, screenshots with threshold 0.1 + maxDiffPixelRatio 0.02
- `tests/unit/config.test.ts` (NEW): 8 tests — isMobile() boundary cases + getConfig() desktop/mobile branches
- `tests/unit/inputHandler.test.ts` (NEW): 6 tests — normalize() center/corners/offset/Y-flip
- `vite.config.ts`: switched to `vitest/config`, added `test: { environment: 'jsdom' }`
- Added `jsdom` + `@types/jsdom` as devDependencies (Vitest v4 peer dep)

Results: 14 Vitest unit tests pass, Playwright baseline generated + regression passes.

Phase 1 browser verification (2026-06-28):
- 280fps at 512×512 desktop (target: 60fps) ✓
- Ink flows on cream canvas, smooth advection ✓
- Canvas resize: no corruption ✓
- Tab switch: pause/resume correct ✓
- Playwright regression: 1/1 passing ✓
