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

### Next
- T19: Playwright deterministic replay test (SIM_HEADLESS URL param, pixelmatch)
- T20: Vitest unit tests (coord normalization, isMobile, config loading)
- Browser verification: open http://localhost:5174/, drag mouse, confirm ink flows on cream canvas
