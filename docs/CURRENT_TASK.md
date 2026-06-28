# Current Task

## Status: Phase 1 COMPLETE — ready for Phase 2

### What just completed
T19: Playwright deterministic replay (SIM_HEADLESS mode, pixelmatch baseline generated + passing)
T20: Vitest unit tests (14 tests, all passing — isMobile(), getConfig(), normalize())

All Phase 1 tasks T1–T20 complete.

### Next: Phase 2 — The Visual Layer
Replace raw dye blit (render.frag) with sumi ink rendering:
- Paper texture shader (FBM + Worley noise, warm #F2EDD7)
- Ink feather render pass (dye concentration → opacity curve)
- Ink-on-paper composite (multiplicative blend)
- Vignette pass
- Palette system (Sumi / Indigo / Sepia, keyboard-only)
