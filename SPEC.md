# Flux — Digital Sumi-e

## Concept

Flux is a fluid simulation that looks like ink painting on paper. Not digital
fluid with glowing neon colors — ink. Dark, physical, permanent-feeling. You
drag your cursor across the canvas and inject colored ink into a fluid field
that behaves like water. The ink bleeds, diffuses, swirls, and slowly settles.
What remains is a unique painting.

The underlying simulation is a real Navier-Stokes fluid solver running on the
GPU. But the visual output layer is tuned to look like physical media: a warm
paper texture underneath, ink that feathers at its edges, color that bleeds
slightly into adjacent wet areas, a subtle vignette at the canvas border. On
first view, it should look like a photograph of a painting. On second look,
you notice it's moving.

The experience is silent, meditative, and generative. Every session produces
a unique artifact. The point is not interactivity for its own sake — it's
giving someone the experience of painting without skill being a barrier.

---

## The 10-Second Test

The page loads to a warm cream canvas. Center of screen, one line of text:
`drag to paint.` Nothing else.

The user moves their cursor. A thread of dark indigo ink follows it, blooming
slightly as it spreads into the paper. It's slow. It doesn't snap to the
cursor — it flows behind it, catching up, the way ink really behaves.

They stop moving. The ink continues to diffuse for three seconds, then settles.
The painting they made in ten seconds looks better than it should.

They forget to close the tab. That is the goal.

---

## Design Language

**Overall register:** Wabi-sabi. Japanese ink painting. Things that look made
by hand, that have imperfection, that improve when left alone for a moment.

**The "ink on paper" illusion has five components — all five must be present:**

1. **Paper texture layer:** A high-frequency noise texture rendered in a
   fragment shader, simulating paper grain. Warm off-white (`#F2EDD7`). Visible
   in unainted areas. The grain must be subtle — perceptible under inspection,
   invisible at a glance. If someone notices the texture immediately, it's too
   strong. If it's not there, the fluid looks digital.

2. **Ink color palette — not neon, not default:** Three curated ink palettes,
   selectable. No random rainbow.
   - **Sumi (default):** Near-black `#1A1209` with deep blue undertones.
      Bleeds slightly warm. Matches traditional sumi ink.
   - **Indigo:** Deep blue-violet `#1B2A4A`. Bleeds cooler. More dramatic.
   - **Sepia:** Dark amber-brown `#3D2008`. Warmest option. Historical.
   
   Colors are never pure. Each has a slight secondary hue that appears only
   where the ink is thinnest (feathered edge = lighter + cooler secondary tone).

3. **Edge feathering:** The boundary of an ink stroke must not have a hard
   digital edge. The dye concentration in the simulation is remapped through a
   soft curve that produces a long, low-opacity feather on all ink edges. This
   is achieved in the render shader, not in the simulation itself.

4. **Wet-on-wet bleeding:** When two strokes cross, the ink does not just
   layer — the newer stroke slightly displaces the older one, and both bleed
   into each other. This is a property of the real fluid simulation (velocity
   injection displaces existing dye) but must be tuned to look like paper
   absorption, not like mixing food coloring in water.

5. **Canvas vignette:** A radial gradient darkens the edges of the canvas.
   Not heavily — just enough that the center feels like the lit area and the
   edges feel like shadow. This makes the canvas feel physical, like a paper
   sheet on a table rather than a screen.

**What it does NOT look like:**
- It does not look like Pavel Dobryakov's sim (no neon, no rainbow, no
  dark background with glowing colors)
- It does not look like a lava lamp
- It does not look like a watercolor app (watercolor is soft and diffuse;
  sumi ink is dark, decisive, high-contrast)

**Auto-pilot mode (when idle):** After 8 seconds of no interaction, Flux
begins painting itself. Not random splats — a choreographed sequence that
produces something resembling a specific reference: a branch, a mountain,
a character. The autopilot uses a pre-authored sequence of cursor positions
replayed through the fluid engine. The result always looks slightly different
because the accumulated ink state is different each time. The autopilot can
run indefinitely and the painting always evolves.

**Session artifact:** A "Save" button (appears after 30 seconds) captures the
current canvas state as a PNG at 2x resolution, with the paper texture baked
in. The download is a real painting file. People will frame these.

---

## What Makes It Unrecognizable

**From Pavel's sim:** Night and day. Pavel's is neon electric fluid on a black
background — visually spectacular but immediately recognizable as a digital
fluid sim. Flux looks like a photograph of paper with ink on it. The underlying
algorithm is the same family, but the visual output layer is completely
reimagined. Someone who has seen Pavel's sim will not recognize that Flux is
"that same thing."

**From watercolor/painting apps (Procreate, etc.):** Procreate is a tool. Flux
is an experience. There are no brushes, no layers, no UI panels. One gesture.
One surface. One material.

**The thing that makes it feel impossible:** The wet-on-wet bleeding at the
stroke intersection combined with the paper grain and edge feathering produces
a result that most people assume cannot come from a browser. The visual
evidence says "this is a photo of a painting." The fact that it's running at
60fps in a browser tab is the reveal.

---

## Technical Stack

| Layer | Technology | Reason |
|-------|------------|--------|
| Fluid simulation | Raw WebGL 2, custom GLSL | Direct FBO control needed for ping-pong architecture |
| Fluid algorithm | Stam's Stable Fluids | Real-time stable, well-understood, visually excellent |
| Paper texture | GLSL fragment shader (procedural) | FBM noise + Worley noise combination produces convincing paper grain |
| Render pipeline | Custom FBO chain | Sim → dye advection → edge feather → paper composite → vignette → output |
| Dye concentration curve | GLSL remap in render shader | Converts raw dye values to "ink opacity" with a soft feather falloff |
| Auto-pilot | Pre-authored JSON keyframe sequences → replayed as pointer events into the sim | Choreographed but fluid because it runs through the real physics |
| Export | Canvas `toDataURL` + programmatic download | 2x pixel ratio, paper texture baked into final PNG |
| Audio | None | Intentional. The silence is part of the experience. |
| Framework | Vanilla TS, Vite | Nothing between the code and the WebGL context |

**Render pipeline in order (per frame):**
1. Splat: inject velocity + dye at cursor position
2. Velocity advection
3. Velocity diffusion
4. Divergence computation
5. Pressure solve (Jacobi, 20 iterations desktop / 10 mobile)
6. Gradient subtraction (makes field divergence-free)
7. Dye advection
8. Render pass A: map dye concentration → ink opacity (feather curve)
9. Render pass B: composite ink over paper texture
10. Render pass C: vignette overlay
11. Output to screen

Passes A and B are what make Flux look different from every other fluid sim.
They are not a simple "display the dye texture" — they transform the dye data
into something that looks like physical ink on physical paper.

---

## Visual Quality Targets

1. **The paper must read as paper.** Show a screenshot of the empty canvas to
   five people. Ask them what they see. If any of them say "a blank screen" or
   "a white rectangle," the texture is too subtle. If any of them immediately
   say "paper texture," it's too heavy. The target response is "a canvas" or
   "paper" — noticed but not commented on.

2. **The ink edge feathering must be asymmetric.** Real ink feathers more in
   the direction of flow and less against it. The render shader's feather curve
   should be slightly directional — read the velocity field at each pixel and
   bias the feather toward the velocity direction. This is a detail that nobody
   consciously notices but everyone subconsciously feels.

3. **The save artifact must look good printed at 8x10 inches at 300dpi.** This
   sets the resolution requirement: the canvas and simulation must run at a
   minimum of 1024×1024 and export at 2048×2048. The paper texture must be
   high-frequency enough that it reads at print scale.

4. **Auto-pilot must be beautiful, not random.** When you walk away from Flux
   and come back 5 minutes later, the painting should look intentional — like
   something a person made. The choreographed sequences must be carefully
   designed. They are creative work, not a technical feature. Plan at least
   10 distinct autopilot sequences (branch, mountain, bird, wave, etc.).

5. **60fps on a MacBook Air M-series. 30fps on mobile.** Profile every pass.
   The paper texture pass is cheap. The pressure solve is the expensive one —
   Jacobi iteration count is the primary tuning lever.

---

## Feature Breakdown

### Phase 1 — Core Simulation (Weeks 1–5)
- [ ] WebGL 2, FBO ping-pong, velocity + dye fields
- [ ] Stam's Stable Fluids: advection, diffusion, Jacobi pressure solve
- [ ] Mouse/touch splat: inject velocity + dye
- [ ] Basic render: show the dye texture directly (no paper layer yet)
- [ ] Performance baseline: 60fps at 512×512 sim resolution on target hardware

### Phase 2 — The Visual Layer (Weeks 6–10)
- [ ] Paper texture shader: FBM + Worley noise composite, warm color
- [ ] Ink feather render pass: dye concentration → opacity curve
- [ ] Ink-on-paper composite: ink over paper texture, multiplicative blend
- [ ] Vignette pass
- [ ] Palette system: Sumi, Indigo, Sepia — selectable via keyboard shortcut (no visible button)
- [ ] At this point, screenshots should look like ink paintings

### Phase 3 — Polish and Depth (Weeks 11–18)
- [ ] Edge feathering asymmetry: directional bias from velocity field
- [ ] Wet-on-wet tuning: velocity injection parameters to produce convincing
      bleed-through at stroke intersections
- [ ] Auto-pilot: first 3 choreographed sequences authored (branch, wave, character)
- [ ] Save feature: PNG export with paper texture baked in
- [ ] Idle detection: after 8s no input, fade in "drag to paint" hint, begin autopilot after 30s
- [ ] Touch support: multi-touch for simultaneous strokes

### Phase 4 — Refinement (Weeks 19–28)
- [ ] Auto-pilot: full 10 sequences
- [ ] Resolution scaling: auto-detect device, set sim resolution accordingly
- [ ] High-DPI export: 2048×2048 PNG for print quality
- [ ] Subtle ambient sound option (paper scratch, optional, off by default)
- [ ] "Ink dry" animation: when idle for 60s, ink subtly darkens and loses
      its sheen (simulating drying). Visual cue only, not a real sim change.
- [ ] Keyboard shortcuts: R to reset canvas, S to save, P for palette cycle,
      1/2/3 for palette direct select, A to toggle autopilot

### Phase 5 — The Depth Layer (Months 6+)
- [ ] WebGPU upgrade: compute shaders allow 50+ Jacobi iterations, dramatically
      improving fluid incompressibility. Abstract the solver so WebGPU is used
      when available.
- [ ] Second material mode: "watercolor" — lighter, more transparent, warm
      bleeds. Different palette, different feather curve. Same sim, different
      render pipeline.
- [ ] Gallery: last 5 sessions stored in localStorage as compressed image data,
      accessible from a minimal gallery overlay
- [ ] Shareable link: encode auto-pilot sequence + palette as URL hash. Share a
      specific painting session.

---

## Key Design Decisions

1. **No UI chrome on the canvas.** No toolbar, no color picker, no visible
   buttons. Palette changes via keyboard. Save via keyboard. The canvas is
   the entire experience. Any visible UI ruins the illusion.

2. **The sim background is paper-colored, not black.** This is the departure
   from every other fluid sim. The paper IS the background. Ink goes on top.
   Black background makes fluid look electric. Paper background makes it look physical.

3. **One ink color per session.** Not multi-color. The interaction of one
   ink concentration value with the paper texture produces enough visual
   complexity. Multi-color is tempting but makes it look like a digital toy,
   not a painting instrument.

4. **Auto-pilot sequences are creative work and get a design review.** Each
   sequence must produce a painting that looks good when complete. An AI
   agent cannot author these alone — they require iteration, visual judgment,
   and feedback from looking at the actual rendered output.

5. **Silence is default.** No ambient music, no sound effects by default.
   Sound ruins the meditative quality. An optional ambient pass (paper scratch
   on stroke) is a Phase 4 addition, off by default.

---

## Open Questions

- **Sim resolution on mobile:** 512×512 is fine for desktop. On mobile,
  256×256 may be necessary. Does the paper texture still read well at this
  resolution? Need to test on real devices.
- **Paper texture tiling:** A procedural paper texture is seamless. An image-
  based texture tiles and the repeat is visible at certain zoom levels. Stick
  with procedural (GLSL noise) or import a high-resolution paper scan?
  Procedural is more portable; a scanned paper might look better.
- **Auto-pilot start delay:** 30 seconds idle before auto-pilot seems right.
  Could be shorter (15s) on desktop where the idle state is obvious, longer
  (60s) on mobile where a user might just be reading. Consider per-device.

---

## Estimated Investment

Minimum shippable, impressive version: **4–6 months**
WebGPU upgrade, full gallery, all auto-pilot sequences: **12–18 months**
