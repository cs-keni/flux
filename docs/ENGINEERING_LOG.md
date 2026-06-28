# Engineering Log

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
