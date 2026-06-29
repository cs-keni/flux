# Current Task

## Status: Phase 2 COMPLETE — ready for Phase 3

### What just completed
Full visual layer — all 5 Phase 2 deliverables shipped in a single commit:

1. **Paper texture**: FBM (5-octave, 30° rotated) + Worley noise composite in `render.frag.glsl`
   - Scale: 580× FBM + 30× Worley; ±2.8% luminance variation on #F2EDD7 base
   - Grain is subtle — perceptible on inspection, not noticeable at a glance

2. **Ink feather curve**: exponential `1 − exp(−ink × 3.0)` — slow onset, ~95% opacity at full dye
   - ink=0.1 → 26% opacity; ink=0.5 → 78%; ink=1.0 → 95%

3. **Ink-on-paper composite**: alpha blend over paper, ink darkens into paper grain

4. **Vignette**: radial `smoothstep(0.55, 1.0, dist × 1.85) × 0.28` — ~28% max at corners

5. **Palette system**: Sumi / Indigo / Sepia in `config.ts`
   - Keyboard: `1/2/3` direct, `P` to cycle
   - Each palette has primary ink color + secondary edge-bleed hue (55% max at thin edges)
   - `FluidSim.setPalette(n)` and `FluidSim.cyclePalette()`

Playwright visual regression baseline updated. All 15 tests pass (1 Playwright + 14 Vitest).

### Next: Phase 3 — Polish and Depth
- Edge feathering asymmetry: directional bias from velocity field (read `u_velocity` in render shader)
- Wet-on-wet tuning: velocity injection parameters for convincing bleed-through
- Auto-pilot: first 3 choreographed sequences (branch, wave, character)
- Save feature: PNG export with paper texture baked in
- Idle detection: 8s → hint text fade-in, 30s → auto-pilot begins
- Touch support: multi-touch for simultaneous strokes
