# Engineering Log

## 2026-07-08

### Phase 6 — WebGPU upgrade scoped as a spike-gated effort (planning only, no code)

**Files changed:** `docs/PHASE6_WEBGPU_SPIKE.md` (new), `PHASES.md`, `docs/CURRENT_TASK.md`, `TODOS.md`

Ran `/plan-eng-review` on the WebGPU-upgrade backlog item. Outcome: **do not migrate yet — gate the whole thing behind a throwaway perf spike.** No production code touched this session; this is a locked plan.

**Why gated, not built:** Flux already holds 60fps at 768² on mid GPUs, so a raw GPU speedup under an already-met frame budget is invisible to the user. WebGPU's compute advantage is real but *smallest* for a grid-based Eulerian solver on small textures (the headline wins are for particle-scatter sims). Firefox still flags WebGPU, so `WebGL2Backend` would be a **permanent** second backend (every shader authored twice). Uncertain payoff + high ongoing cost = spike first.

**The spike (locked design, ~1 day, hard timebox):** T1 profile the current WebGL2 frame per-pass with `EXT_disjoint_timer_query` to find the *real* bottleneck before assuming it's Jacobi → T2 implement a **correct global-Jacobi** WebGPU compute pass (same equation as WebGL2), with tiled block-Jacobi allowed only behind a residual + pixel-diff equivalence check → T3 harness with GPU timers + wall-clock fallback, p95/p99 (not median), 40 production iterations, deterministic scenes → T4 run on dev box + ≥1 weak/mid GPU, randomized A/B → T5 outcome-based go/no-go (greenlight only if a weak device gains a resolution tier at p95 < ~14ms, else spend the token on sound reactivity).

**Two cross-model corrections from the Codex outside voice (both would have bitten):**
1. My initial "shared-memory tiled, multiple iterations per dispatch" recommendation is **not the same solver** — you can't sync workgroups within a dispatch, so it degrades to block-Jacobi with stale halos, changing convergence AND the ink look. Benchmarking it vs WebGL2 global Jacobi would report a fast number for a sim that paints differently. Fixed: correct global Jacobi is the baseline; tiling must pass an equivalence check.
2. "Measure the full 9-pass frame" is unrepresentable without porting the whole pipeline (hybrid GL+WebGPU interop skews it), and pressure may not even be the bottleneck. Fixed: profile WebGL2 first (T1), then benchmark the dominant pass in isolation.

**Eng review result:** 5 issues found + 2 cross-model tensions, all resolved. 0 unresolved, 0 critical gaps (the tiled-Jacobi silent-false-win gap was caught and closed). Verdict CLEARED. No commit hash for code — planning only; this doc set is the deliverable.

---

## 2026-07-07

### Phase 5 — watercolor material mode (W key)

**Files changed:** `src/shaders/render.frag.glsl`, `src/sim/FluidSim.ts`, `src/share/shareLink.ts`, `src/gallery/gallery.ts`, `src/main.ts`, `src/ui/ShortcutOverlay.ts`, `tests/unit/shareLink.test.ts`, `tests/unit/gallery.test.ts`

Press **W** to switch the painting medium between sumi ink and watercolor; it crossfades (~400ms) and persists with the artwork.

**Shader** (`render.frag.glsl`) — one `u_material` uniform (0 = sumi, 1 = watercolor, continuous so it crossfades). Watercolor lerps in four traits: (1) softer/wider feather — `k` mixes from 3.0→1.8 (2.4 when dry); (2) transparent washes — opacity ceiling `×0.85` so paper glows through even a dense core; (3) the signature **wet-edge rim** — a band-pass on concentration (`smoothstep(0.03,0.20) × (1−smoothstep(0.20,0.50))`) isolates the drying boundary and darkens it, the visual opposite of sumi's dense-core/feathered-edge; (4) granulation — paper-noise mottles the pigment, and the rim nudges toward the denser primary. All effects scale by `u_material`, so at 0 the render is byte-identical to before.

**Material crossfade** (`FluidSim`) — mirrors the palette crossfade exactly: `materialIndex`/`currentMaterial`/`targetMaterial`, lerped in `step()` at `1−exp(−8·dt)` (~95% in 0.4s). `setMaterial`/`toggleMaterial`/`getMaterialIndex`; `render()` feeds `currentMaterial`, `exportHighRes()` feeds the settled `targetMaterial` (like it uses the settled palette). `init()` settles both for context-restore.

**Persist everywhere.** Share hash gains `&m=1` (omitted when sumi, to keep common URLs clean); `parseShareHash` validates `m ∈ {0,1}`; on-load applies it. Gallery entries gain an optional `material` field (absent on pre-watercolor entries → treated as 0); `captureToGallery` records it, restore calls `setMaterial(entry.material ?? 0)`. `main` threads material through `syncShareUrl`, the `W` handler (flashes "watercolor." / "sumi ink."), gallery capture/restore, and the on-load hash apply. `W` added to the shortcut overlay.

**Verified:** type-check clean, 64 unit tests pass (6 new: material parse/build/round-trip + gallery back-compat), build clean. Via `browse` on a Prussian-blue ring: sumi = opaque uniform ink; `W` → watercolor with visible wet-edge rim, transparent luminous body, softer feather. `#p=5` → `#p=5&m=1` on toggle, drops `m` on toggle-back; gallery capture stored `material=1`, and restoring the entry brought the hash back to `m=1`. Palette preserved through every toggle, no console errors.

**Browse-harness note (not a bug):** `goto` to the same origin only changes the hash (same-document nav), so the app doesn't reload and stale idle state fires auto-pilot. Force a real reload with a cache-buster (`?r=1#...`) when verifying share-link loads.

---

### Phase 5 — dynamic resolution downgrade (adaptive tier on jank)

**Files changed:** `src/sim/perfMonitor.ts` (new), `src/sim/config.ts`, `src/sim/FluidSim.ts`, `src/main.ts`, `src/dev/DevOverlay.ts`, `tests/unit/perfMonitor.test.ts` (new), `tests/unit/config.test.ts`

Weak GPUs now stay smooth: on sustained jank the sim drops a resolution tier (HIGH 768 → MID 512 → LOW 256) instead of grinding.

**`PerfMonitor`** (`src/sim/perfMonitor.ts`) — the "when" decision, pure and unit-tested. Averages a 90-frame window and reports over-budget when the mean exceeds 22ms (~45fps). Skips outlier deltas (>100ms: tab switches, stalls) and a 45-frame warmup, so a single GC pause or refocus can't trigger a downgrade. Verdict clears the window; `reset()` restarts warmup after a downgrade.

**Tier ladder** (`config.ts`) — `TIERS = [HIGH, MID, LOW]` + `lowerTierFor(resolution)` returns the next tier down or null at the floor. Matched by resolution so it reads off a FluidSim's live config.

**`FluidSim.rebuildAt(resolution, jacobi)`** — the "how". Destroys + rebuilds only the FBOs (programs and the quad VAO are resolution-independent); updates the sim's config. The caller preserves the painting around it: `readDyeField()` → `resampleField()` to the new size → `rebuildAt()` → `restoreDyeField()`.

**Shared-object trap fixed.** `getConfig()` returns the module-level `HIGH`/`MID`/`LOW` templates. Mutating `config.resolution` in place would corrupt the tier ladder (two tiers reading the same resolution). Fix: `FluidSim` now copies config in its constructor (`{ ...config }`) and owns resolution via `getResolution()`. `main` switched its gallery-restore resample target from `config.resolution` to `sim.getResolution()` so it stays correct after a downgrade.

**Wiring** (`main.ts`) — the rAF loop feeds raw frame delta (pre-100ms-cap) to `PerfMonitor`; over-budget + a lower tier exists → `downgradeTier()`. One-way, floors at LOW, no oscillation. `DevOverlay.updateDevConfig()` refreshes the FPS overlay's res/jacobi labels on downgrade.

**Verification.** Real jank is hard to induce in headless (rAF ~4fps → every delta is an outlier, correctly ignored), so a DEV-only `window.__fluxForceDowngrade()` hook exercises the rebuild path. Confirmed tree-shaken from the prod bundle (`grep dist/` finds nothing). Via `browse`: painted an arch stroke on a MID (512) device → forced downgrade returned 256 → the stroke was preserved (resampled, slightly softer, still live/paintable) → further forces stayed at 256 (floor), no console errors.

**Verified:** type-check clean, 58 unit tests pass (12 new: 7 PerfMonitor + 5 tier-ladder), build clean.

---

### Phase 5 — gallery (last 5 paintings, localStorage, live restore)

**Files changed:** `src/gallery/gallery.ts` (new), `src/ui/GalleryOverlay.ts` (new), `src/sim/FluidSim.ts`, `src/main.ts`, `src/ui/ShortcutOverlay.ts`, `tests/unit/gallery.test.ts` (new)

Press **G** to summon a grid of your last 5 paintings; press **1–5** or click to restore one as a *live* simulation you can keep painting on; any other key / backdrop click dismisses.

**Storage design.** We do not store the rendered image. We store the raw dye ink-concentration field (the sim's R channel) packed into the **alpha** channel of a grayscale PNG. Ink is sparse, so PNG compresses each painting to ~30KB (measured) — five fit easily in the ~5MB localStorage budget. That one PNG does double duty: it's the restore data *and* the overlay thumbnail (used as a CSS `mask` filled with the entry's palette primary over paper, so no separate render pass). Concentration maps to alpha via a fixed ceiling `CONCENTRATION_MAX = 4.0` (render saturates ~1.5, so 8-bit is visually lossless). Blank canvases are skipped below `MIN_COVERAGE` (0.4% inked).

**Row-order contract.** FBO read/upload works in GL order (row 0 = bottom); PNGs are image order (row 0 = top). `encodeField`/`decodeEntry` own the single paired Y-flip, so `FluidSim` never thinks about it. Verified upright in the browser (painted a U, thumbnail + restore both showed U, not ∩).

**FluidSim additions.** `readDyeField()` — `readPixels` the dye FBO, return the R channel at sim resolution. `restoreDyeField(field, size)` — upload the field back into the dye texture (FLOAT → RGBA16F) and clear velocity/pressure/divergence so the painting resumes calm and paintable rather than mid-motion. Cross-tier safety: `main` resamples (`resampleField`, bilinear) if a saved painting's resolution differs from the current sim resolution.

**Capture triggers.** On **R** (archive then clear) and on **pagehide** (navigate-away). Auto-pilot's internal resets do *not* capture — only user-initiated clears and navigate-away.

**main.ts wiring.** Gallery open/close state; when open the overlay owns the keyboard (1–N select, else close) so digits don't leak to palette selection. `selectGalleryEntry` decodes → resamples → `restoreDyeField` → restores the saved palette too → hides overlay.

**Verified:** type-check clean, 46 unit tests pass (18 new), build clean. Full loop driven via `browse`: painted a stroke → **R** captured a 33KB/512px/palette-0 entry and cleared → **G** rendered the animated overlay with correctly-oriented palette-tinted thumbnails → **1** restored the live dye field with no console errors. `pagehide` capture also confirmed (count reached 2 across a navigation).

**Note (unit-test scope):** encode/decode use canvas `toDataURL`/`getImageData`, which jsdom doesn't implement, so those are covered by the browse run, not Vitest. Vitest covers the pure helpers (quantize, coverage, capEntries, resampleField, loadGallery JSON-safety).

---

### Phase 5 — shareable link (URL hash → palette + auto-pilot sequence)

**Commit:** `858e3b8`

**Files changed:** `src/share/shareLink.ts` (new), `src/sim/FluidSim.ts`, `src/main.ts`, `src/ui/ShortcutOverlay.ts`, `tests/unit/shareLink.test.ts` (new)

The URL hash now encodes viewer state so a link reproduces what the sender sees:
`#p=<paletteIndex>&s=<sequenceName>` (e.g. `#p=3&s=enso`).

- **`src/share/shareLink.ts`** — pure, testable module. `parseShareHash()` uses `URLSearchParams`, validates the palette index against `PALETTES.length` and the sequence name against `SEQUENCES` (unknown/out-of-range values are dropped, never thrown — a stale or hand-edited link degrades gracefully). `buildShareHash()` is the inverse; `sequenceIndexByName()` maps a name → SEQUENCES index.
- **`FluidSim.getPaletteIndex()`** — new getter so `main.ts` can read the current palette when building the hash (palette index was private).
- **`main.ts`** — on load (interactive path only, after the headless early-return) parses `location.hash`: applies the palette, and if a sequence is named, sets `autoPilotSeqIdx` and calls `startAutoPilot()` immediately (non-forced, so the visitor's first interaction hands control back). The hash live-updates via `history.replaceState` (not `location.hash =`, to avoid history spam and hashchange events) on every palette change (`applyPalette`/`cyclePalette` wrappers) and on sequence start (in `startAutoPilot`). New `C` shortcut copies `location.href` to the clipboard and flashes "link copied." (`flashSaved` generalized to `flashToast(text)`).
- **`ShortcutOverlay`** — added the `C · copy link` row.

**Verified:** type-check clean, 28 unit tests pass (14 new), production build clean. Drove the live app via `browse` at `#p=3&s=enso`: hash round-tripped, ink rendered in Vermilion, auto-pilot started with no user input; pressing `1`/`p` live-updated the hash to `p=0`/`p=1`; `C` produced the correct `location.href`.

**Note:** in headless Chromium the auto-pilot renders as scattered dots rather than a smooth arc — that's the documented ~4fps rAF throttling (sequence samples at wall-clock time), not a bug. Real 60fps browsers draw a continuous stroke.

---

## 2026-06-30

### Phase 5 — deploy to Vercel

**Live URL:** https://flux-indol-gamma.vercel.app/

Deployed via Vercel GitHub integration (no CLI). Auto-deploys on every push to `main`. Framework auto-detected as Vite; no `vercel.json` needed. Build: `npm run build` → `dist/`.

---

### Phase 5 — palette crossfade animation

**Files changed:** `src/sim/FluidSim.ts`

Four `Float32Array(3)` fields track `currentPrimary/Secondary` (what the render pass sees) and `targetPrimary/Secondary` (the selected palette). Each `step()` call advances current toward target via exponential approach: `alpha = 1 - exp(-6 * dt_sec)`, giving ~95% completion in 500ms. Frame-rate-independent.

Spam behavior: each `setPalette()` call only redirects `target`; `current` continues from wherever it is — no debounce, no broken state. Pressing 4→5→6 rapidly produces a smooth color drift to Prussian Blue.

`exportHighRes()` untouched — it reads `PALETTES[paletteIndex].primary` directly (the target color), so exports always use the final settled color.

---

### Phase 5 — three additional ink palettes (keys 4/5/6)

**Files changed:** `src/sim/config.ts`, `src/main.ts`, `src/ui/ShortcutOverlay.ts`

**New palettes added to `PALETTES` array (indices 3/4/5):**

- **Vermilion** (#6E1208 primary / #C03418 secondary): Chinese cinnabar red. Dark seal-impression red at full concentration; bright orange-red bleed at thin edges. Physical reference: traditional 印章 (seal ink).
- **Pine** (#1E3A24 primary / #3D7045 secondary): Japanese pine-shadow green (松緑). Deep forest green at full concentration; lighter moss-needle at edges. Cool blue undertone separates it from generic green.
- **Prussian Blue** (#0E1F3A primary / #1A4870 secondary): Classic printmaking pigment (first synthetic, 1704). Near-black at full concentration; steel-blue bleed at edges. Reference: Hokusai's _The Great Wave_ blue.

**Keyboard routing:** keys `4`, `5`, `6` in `main.ts` wired to `setPalette(3/4/5)`. ShortcutOverlay row changed from `'1 · 2 · 3'` to `'1–6'` (fits 56px column).

**Architecture unchanged:** `setPalette(index)` already wraps modulo `PALETTES.length` — no changes needed to FluidSim or the render shader.

---

## 2026-06-29

### Phase 4 — resolution auto-scaling (256 / 512 / 768)

**Files changed:** `src/sim/config.ts`, `src/main.ts`

**Three GPU tiers:**
- LOW (256, 20 Jacobi): mobile OR legacy GPU with MAX_TEXTURE_SIZE ≤ 4096
- MID (512, 40 Jacobi): desktop default — modern integrated GPU, unrecognized renderer
- HIGH (768, 40 Jacobi): confirmed discrete GPU or Apple Silicon

**Detection (`gpuTier()` in config.ts):**
1. `WEBGL_debug_renderer_info.UNMASKED_RENDERER_WEBGL` — primary signal (available Chrome/Firefox)
   - Matches `geforce|quadro|radeon|rtx|gtx|rx \d|tesla|apple m[0-9]` → HIGH
   - Matches `intel (hd|uhd) [0-9]{3}|intel gma` → MID
2. Fallback: `navigator.deviceMemory ≥ 8` AND `MAX_TEXTURE_SIZE ≥ 16384` → HIGH

**Why 40 Jacobi at 768:** pressure solve is slightly under-converged vs the theoretical ~60 for 768×512 ratio, but the visual difference in an ink sim is imperceptible. 40 iters at 768² is already 2.25× the work of 512², which is well within discrete GPU headroom.

**Config refactor:** `BASE` object holds all non-resolution/Jacobi fields; LOW/MID/HIGH spread from it — single source of truth for tuning values. `getConfig(gl?)` is backwards compatible (no gl = returns MID, used by tests).

---

### Phase 4 — keyboard shortcut overlay + high-DPI export

**Files changed:** `src/ui/ShortcutOverlay.ts` (new), `src/sim/FluidSim.ts`, `src/main.ts`

**ShortcutOverlay (`src/ui/ShortcutOverlay.ts`):**
- New class, same structure as HintOverlay
- Appears 2s after load, auto-dismisses after 8s or immediately on any key/touch/mouse input
- Shows: `1·2·3 palette`, `P cycle palette`, `R reset canvas`, `S save PNG`, `A auto-pilot`
- Hidden entirely on touch-primary mobile devices (no keyboard to discover)
- Session-only: once dismissed it removes itself from the DOM, never returns
- Positioned bottom-right in serif type matching the app aesthetic

**High-DPI export (`FluidSim.exportHighRes(size=2048)`):**
- `gl.readPixels` reads current dye and velocity FBOs as Float32Array from the main context
- Creates an offscreen 2048×2048 canvas with a fresh WebGL2 context
- Uploads float data as RGBA32F textures (no extension needed for upload/sample)
- Compiles the full render shader (paper FBM + Worley grain computed natively at 2048×2048)
- Re-renders: paper texture detail is 4× finer than the display canvas
- Falls back to 2D `drawImage` scale-up if offscreen WebGL2 is unavailable
- `flashSaved()` in main.ts shows a brief "saved." label bottom-center after download

**main.ts:** S key now calls `sim.exportHighRes(2048)`, removed old `saveCanvas()` helper

---

### Phase 4 — ink-dry animation

**Files changed:** `src/shaders/render.frag.glsl`, `src/sim/FluidSim.ts`, `src/main.ts`

After 60s of user idle, ink visually "settles" — edges sharpen and color deepens — like sumi ink drying on rice paper. Fully dry at 120s. Resets immediately on next user input.

**Shader (`render.frag.glsl`):**
- Added `uniform float u_idleTime` (seconds since last user input)
- `dryFactor = smoothstep(60.0, 120.0, u_idleTime)` — 0 at 60s, 1 at 120s
- `driedPrimary = u_inkPrimary × 0.88 + vec3(-0.006, -0.003, +0.010)` — 12% darker, subtle cool shift (settled carbon)
- `effectivePrimary = mix(u_inkPrimary, driedPrimary, dryFactor)` — smooth transition
- `kFactor = mix(3.0, 3.8, dryFactor)` — feather exponent tightens, edges crisp up as moisture evaporates
- Secondary edge hue now mixes against `effectivePrimary` instead of `u_inkPrimary`

**FluidSim.ts:** `render(idleSeconds: number = 0)` — binds `u_idleTime`

**main.ts:** passes `(now - lastInputTime) / 1000` to `render()`

---

### Phase 4 — wet-on-wet tuning

**Files changed:** `src/shaders/splat.frag.glsl`, `src/sim/FluidSim.ts`, `src/sim/config.ts`

**Mechanism:** When a new brushstroke lands on existing wet ink, the velocity injection is amplified proportional to the local ink concentration. This makes existing ink bleed and spread outward at crossing points — the defining behavior of wet-on-wet sumi-e technique.

**Shader (`splat.frag.glsl`):**
- Added `uniform sampler2D u_dye` (texture unit 1 — existing ink field)
- Added `uniform float u_wetFactor` (0 = dry splat; >0 = wet-on-wet)
- `boost = 1.0 + existingInk × u_wetFactor` — velocity injection scaled up at ink intersections
- Guard `if (u_wetFactor > 0.0)` so dye pass never samples u_dye (avoids feedback on dye ping-pong)

**FluidSim.ts (`runSplat`):**
- Velocity pass: u_dye bound to unit 1 (dye.read), u_wetFactor = config.wetOnWetStrength
- Dye pass: u_wetFactor = 0.0 — ink addition stays additive; spreading is handled by the amplified velocity

**Config (`config.ts`):**
- Added `wetOnWetStrength: number` to SimConfig interface
- Default: 1.8 → at full ink overlap, velocity boost is 2.8× (visible bleed, not chaotic)

**Tuning notes:** wetOnWetStrength 0 = disabled, 1.0 = subtle, 1.8 = natural, 3.0+ = strong/chaotic.

---

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
