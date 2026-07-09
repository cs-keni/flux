# Current Task

## Status: Phase 5 COMPLETE — Phase 6 spike in progress (T1)

### Active: Phase 6 WebGPU spike — T1 profiling

**Done this session:** Built the T1 instrument — `src/dev/GpuProfiler.ts`, a DEV-only per-pass GPU timer (`EXT_disjoint_timer_query_webgl2`, async ring-buffer, disjoint-aware, p50/p95/p99). Wired into `FluidSim` via `attachProfiler()` with null-guarded `begin/end` brackets around all 9 pass groups; dev hooks `window.__fluxProfile()` / `__fluxProfileReset()`. Tree-shaken from prod. Piggybacked the readback TODO: `readDyeField()` sync `readPixels` measured at **5.7ms** on WSL2 (~⅓ frame).

**Next concrete step:** Run `window.__fluxProfile()` in a DEV build **on a native-GL machine** to get the actual per-pass split. This WSL2/ANGLE box returns `supported:false` (timer queries disabled), so it cannot produce the per-pass numbers that decide whether pressure actually dominates. Do NOT start T2 (WebGPU compute) until T1's numbers are in.

Verify: `npm run type-check` clean · 64 unit tests pass · `npm run build` clean.

---

### (Prior) What completed in Phase 4

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

### Done: Shareable link
- [x] URL hash `#p=<idx>&s=<name>` encodes palette + auto-pilot sequence
- [x] `src/share/shareLink.ts` — parse/build/lookup (14 unit tests)
- [x] Parses on load → applies palette + starts sequence (non-forced)
- [x] Live-updates hash via `history.replaceState`; `C` copies link

### Just completed: Gallery (last 5 paintings, live restore)
- [x] `G` key → animated overlay of up to 5 saved paintings; 1–5 / click to restore
- [x] `src/gallery/gallery.ts` — dye R field → PNG alpha (~30KB), load/save/encode/decode/resample (18 unit tests)
- [x] `src/ui/GalleryOverlay.ts` — staggered fade-in thumbnails, palette-tinted via CSS mask
- [x] `FluidSim.readDyeField()` / `restoreDyeField()` — restore uploads field, clears velocity
- [x] Captures on R (before clear) + pagehide; blanks skipped below MIN_COVERAGE
- Verified end-to-end via browse: paint → R (capture+clear) → G (overlay) → 1 (live restore)

### Just completed: Dynamic resolution downgrade
- [x] `PerfMonitor` (src/sim/perfMonitor.ts) — 90-frame avg > 22ms → downgrade; outlier + warmup guards (7 tests)
- [x] `TIERS` ladder + `lowerTierFor()` in config.ts (5 tests); one-way, floors at LOW
- [x] `FluidSim.rebuildAt()` + `getResolution()`; config copied in ctor (tier objects stay pristine)
- [x] main.ts rAF loop feeds raw frame delta; downgrade preserves painting (resample)
- Verified via DEV `__fluxForceDowngrade` (tree-shaken from prod): 512→256 kept the stroke, floored at 256

### Just completed: Watercolor material mode (W key)
- [x] `u_material` uniform in render.frag.glsl: transparent washes, softer feather, wet-edge rim, granulation
- [x] Material crossfade in FluidSim (~400ms, mirrors palette); setMaterial/toggleMaterial/getMaterialIndex
- [x] Persists: share hash `&m=1`, gallery entry `material` field, export renders current
- [x] W key toggles (flashes label); added to ShortcutOverlay; on-load hash applies material
- Verified via browse: sumi↔watercolor distinct (rim visible), hash + gallery round-trip material (6 new tests)

### Next Phase 5 candidates
- [ ] Sound reactivity: mic → auto-pilot speed / injection force (needs mic-permission UX)

### Phase 6 — WebGPU (planned 2026-07-08, spike-gated, NOT started)
- Locked via `/plan-eng-review`. Full spec: `docs/PHASE6_WEBGPU_SPIKE.md`; tasks in `PHASES.md` Phase 6.
- **Do not migrate until the spike greenlights.** Spike order: T1 profile WebGL2 per-pass → T2 correct global-Jacobi WebGPU (tiled only if equivalence-checked) → T3 p95/p99 harness → T4 multi-device A/B → T5 outcome-based go/no-go (weak device gains a tier at p95 < ~14ms).
- Go/no-go is outcome-based, not a raw multiplier: already 60fps at 768², so a speedup is invisible unless it buys resolution or reaches weaker hardware.

### Keyboard shortcuts (current)
1–6 palette · P cycle · R reset(+gallery capture) · S save PNG · C copy link · G gallery · W watercolor · A auto-pilot · F fps(dev)
