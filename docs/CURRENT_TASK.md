# Current Task

## Status: Phase 4 COMPLETE — Phase 5 in progress

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

### Phase 4 complete (all shipped)
- [x] Auto-pilot: 7 new sequences (ENSO, MOUNTAIN, BIRD, FISH, BAMBOO, SPIRAL, RAIN) — total 10 done
- [x] Wet-on-wet tuning: velocity injection for stroke intersection bleed (wetOnWetStrength=1.8)
- [x] Resolution scaling: GPU tier detection → LOW 256 / MID 512 / HIGH 768
- [x] "Ink dry" animation: 60s idle → ink darkens + edges sharpen (visual-only, render shader)
- [x] High-DPI export: 2048×2048 PNG — offscreen WebGL2 re-render, paper grain at native 2048px
- [x] Keyboard shortcut overlay: appears 2s after load, dismisses on first interaction

### Phase 5 progress (complete so far)
- [x] Vermilion, Pine, Prussian Blue palettes (keys 4/5/6)
- [x] Palette crossfade (~500ms exponential lerp)
- [x] Deploy: https://flux-indol-gamma.vercel.app/ (auto-deploys on push)

### Phase 5 — palettes complete
- [x] Vermilion (#6E1208 cinnabar, key 4)
- [x] Pine (#1E3A24 forest green, key 5)
- [x] Prussian Blue (#0E1F3A Hokusai blue, key 6)
- Keys 4/5/6 wired; ShortcutOverlay updated to show 1–6

### Just completed: Shareable link
- [x] URL hash `#p=<idx>&s=<name>` encodes palette + auto-pilot sequence
- [x] `src/share/shareLink.ts` — parse/build/lookup (14 unit tests)
- [x] Parses on load → applies palette + starts sequence (non-forced)
- [x] Live-updates hash via `history.replaceState` on palette/sequence change
- [x] `C` key copies `location.href` to clipboard
- Verified end-to-end via browse (palette + auto-start + live hash)

### Next Phase 5 candidates (from checkpoint backlog)
- [ ] Gallery: last 5 sessions in localStorage (medium)
- [ ] Dynamic resolution downgrade on jank
- [ ] Watercolor material mode (shader-only)
- [ ] WebGPU upgrade (large, Phase 6)
