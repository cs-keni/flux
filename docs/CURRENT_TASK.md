# Current Task

## Status: Browser verification + T19/T20

### What just completed
T1–T18 (all Phase 1 implementation) — committed and pushed.
Runtime bugfixes committed (d2b89cf): EXT_color_buffer_float guard, DevOverlay init order, broadened error handler.

### Immediate next step
**Open http://localhost:5174/ in the browser and drag the mouse.**
- Expected: dark sumi ink (#1A1209) appears and flows on cream canvas (#F2EDD7) at ~60fps
- Press F to show FPS overlay
- If an error overlay appears instead, read the message and report it

### Remaining tasks
- T19: Playwright deterministic replay test
  - `SIM_HEADLESS=true` URL param + JSON pointer sequence + pixelmatch threshold 0.1
  - Files: `tests/e2e/`, `playwright.config.ts`
- T20: Vitest unit tests
  - Coordinate normalization, isMobile(), config loading
  - Files: `tests/unit/`
