# Current Task

## Status: Phase 3 COMPLETE — ready for Phase 4

### What just completed

All Phase 3 deliverables shipped (minus the two explicitly deferred to Phase 4):

1. **Directional feather** (`render.frag.glsl`): velocity-based asymmetric edge softening — ink trailing edge feathers more than leading edge. Velocity uniform `u_velocity` bound to texture unit 1.

2. **Multi-touch** (`InputHandler.ts`): `Map<pointerId, {x,y}>` tracking with `setPointerCapture`; any number of simultaneous strokes.

3. **Hint overlay** (`src/ui/HintOverlay.ts` — new file): "drag to paint." fades on first interaction, returns after 8s idle. Hidden during auto-pilot.

4. **Auto-pilot sequences** (`src/autopilot/sequences.ts` — new file): BRANCH (8.5s), WAVE (7.5s), CHARACTER (8.0s). Time-based waypoint interpolation with pen-up gaps between strokes. Loops through all 3 sequences with 3s pause and canvas reset between each. 30s idle threshold. A key to force-toggle.

5. **Save + Reset** (`main.ts`): S key saves `canvas.toDataURL()` PNG (requires `preserveDrawingBuffer: true`); R key clears all FBOs.

6. **Frame-rate-independent dissipation** (`FluidSim.ts`): fixed critical bug where ink dissipated 4.7× faster at 280fps vs 60fps. Now uses `pow(0.999, elapsed_sec × 60)`.

7. **Per-splat radius** (`FluidSim.ts`): `SplatEvent.radius?` override — auto-pilot uses 0.12 (calligraphic), user default stays 0.25.

8. **Playwright headless** (`main.ts`, `tests/e2e/`): headless replay now synchronous (RAF/setTimeout throttled to ~4fps in Playwright Chromium). Test timeout raised to 40s.

### Deferred to Phase 4
- Wet-on-wet tuning: velocity injection for stroke intersection bleed
- High-DPI 2048×2048 export

### Next: Phase 4 — Refinement (in progress)
- [x] Auto-pilot: 7 new sequences (ENSO, MOUNTAIN, BIRD, FISH, BAMBOO, SPIRAL, RAIN) — total 10 done
- [ ] Wet-on-wet tuning: velocity injection for stroke intersection bleed
- [ ] Resolution scaling: auto-detect device capability (256/512/768)
- [ ] "Ink dry" animation: 60s idle → ink subtly darkens (visual-only)
- [ ] High-DPI export: 2048×2048 PNG via offscreen canvas
- [ ] Keyboard shortcut discoverability overlay (first load)
