# Creative Frontend — Contrast Map

## What Each Project Is, In One Sentence

- **Chronicle:** Scroll through a page and the entire visual language of the browser
  changes around you — seven eras of computing design, each with its own color,
  type, motion grammar, and a custom GLSL shader for the transition between them.

- **Flux:** Drag your cursor across a warm paper-colored canvas and inject real
  fluid-simulated ink that bleeds, feathers, and settles the way physical sumi ink does.

- **Kinotype:** A short phrase hangs in space; click it and the letters scatter under
  real physics, each one getting heavier in its variable font weight as it moves faster,
  then drifting home over twelve slow seconds.

- **Resonance:** Drop in any audio file and sixty seconds later you have a single
  circular image — a mandala built from the song's actual audio mathematics — that
  looks the same every time you drop in that song, and different from every other song.

---

## Axis Comparison

| Axis | Chronicle | Flux | Kinotype | Resonance |
|------|-----------|------|----------|-----------|
| **Core medium** | DOM + SVG + GLSL chapter shaders | Raw WebGL 2 fluid on paper-colored canvas | DOM letter physics + variable font API | Canvas 2D radial rendering + offline FFT analysis |
| **Primary user action** | Scroll | Drag cursor / touch | Click / hover | Drop an audio file |
| **Output** | A cinematic experience | An ink painting session | A choreographed physics sequence | A printable circular image |
| **Shareable artifact** | Screenshot of any chapter | 2x PNG of the painted canvas | 3-second GIF of scatter and return | 2048×2048 song fingerprint PNG |
| **Dominant emotion** | Awe at visual era contrast | Meditative, tactile satisfaction | Delight at unexpected physics-type coupling | "That image IS that song" recognition |
| **Color** | Entirely different per chapter (7 palettes) | One ink color per session, warm paper background | Near-monochrome, one accent, day-of-week assignment | Generated from the song's audio data — different every time |
| **The innovation nobody has done** | Per-transition GLSL shaders tied to historical content | Fluid sim styled as sumi ink on paper, not electric fluid | Variable font axis driven by physics velocity in real time | Whole-file audio analysis → deterministic song fingerprint image |
| **Hardest technical challenge** | 6 unique GLSL transition shaders, each semantically meaningful | Paper texture render pass that makes digital fluid look physical | Velocity → font axis mapping that feels subtle at low speed, dramatic at high | Krumhansl-Schmuckler key detection offline via Web Worker on raw audio samples |
| **Performance bottleneck** | Shader transitions profiled per device | Jacobi pressure solve iteration count | Variable font mutations on 50+ DOM elements at 60fps | FFT loop in Web Worker for long audio files |
| **Design genre** | Cinematic Documentary | Wabi-sabi / Japanese ink painting | Typographic precision + physical chaos | Scientific visualization made beautiful |
| **Non-technical reaction** | "This feels like a real documentary" | "How is this a website, it looks like a painting" | "I can't stop clicking it" | "That circle looks exactly like that song" |
| **Technical reaction** | "Those GLSL transitions are custom authored?" | "The paper texture is a shader, not an image?" | "The font weight changes with physics velocity?" | "You're doing Navier-Stokes? No, FFT and Krumhansl?" |

---

## Why These Four Together

The category claims range. Together, the four projects demonstrate:

- **Chronicle** → Narrative design, per-chapter visual identity, GLSL, animation as content
- **Flux** → GPU fluid simulation, physically accurate rendering, post-processing pipeline
- **Kinotype** → DOM mastery, variable font API, physics engine integration, typography
- **Resonance** → DSP algorithms, offline audio analysis, data-to-visual translation, radial math

No library covers all of these. No tutorial teaches any of them. A recruiter sees four
projects that require four completely different areas of deep technical knowledge, all
producing results that look nothing like each other and nothing like anything else online.

---

## Adversarial Check — What Would Kill Each

| Project | Honest risk |
|---------|-------------|
| Chronicle | The content (facts, writing, era research) takes as long as the engineering. Bad writing kills a good animation. This requires editorial discipline, not just code. |
| Flux | The paper illusion lives and dies in the render shader. If the texture is too subtle, it reads as a regular fluid sim. Too strong, it looks like Photoshop. The tuning window is narrow and requires visual judgment, not just engineering. |
| Kinotype | The resting state must be beautiful before the physics are written. If the typography isn't gallery-quality when still, the scatter is a distraction from a mediocre poster. Design the still state first. |
| Resonance | Key detection accuracy is ~80% on tonal music and lower on everything else. If the fingerprint for a minor-key song looks the same as a major-key song, Ring 1 is not doing its job. The algorithm accuracy sets a ceiling on how meaningful the image can be. |

---

## Starting Order

Build in this order. Reasoning after each:

1. **Kinotype** — Fastest path to something visually impressive that does not
   exist anywhere else. The variable-font-to-physics coupling is the innovation;
   the foundation (Matter.js + DOM) is well-documented. Proof of concept in 4–6 weeks.

2. **Flux** — The paper illusion is one focused engineering challenge (the render
   shader). Once that's solved, the rest is refinement. High reward for focused effort.

3. **Resonance** — The audio pipeline is the gating item. Building the Web Worker
   FFT analysis is week 1; everything after is building the visual on top of data
   that's already flowing. Start this in parallel with Flux if capacity allows.

4. **Chronicle** — The most content-dependent. The engineering is solvable; the
   editorial work (research, writing, per-chapter design decisions) requires
   sustained non-engineering effort. Start this last, when the engineering
   patterns from projects 1–3 are established.
