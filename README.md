# Creative Frontend — Project Archive

## What This Is

This folder contains the full design and engineering specs for Kenny Nguyen's
**Creative Frontend** portfolio category. Each project in this category is a
standalone frontend engineering showcase — not a utility, not a CRUD app, not
a side tool. These are art pieces that happen to be written in code.

The category exists for two reasons:

1. **Non-technical signal.** A recruiter or hiring manager who can't read a
   diff can still feel the difference between a website that's ordinary and one
   that makes them stop scrolling. These projects do that.

2. **Technical signal.** These projects require knowledge that you cannot
   prompt your way to — GLSL shaders, GPU compute pipelines, physics simulation,
   variable font APIs, Web Audio FFT analysis. The implementation depth is the
   point.

Anyone can generate a React dashboard with Claude in an afternoon. These
projects are what happens when you use Claude and Codex as amplifiers on top of
deep technical taste.

---

## Philosophy

**Each project must be radically different from the others.** Different design
language, different technical core, different emotional register. A recruiter
scrolling through all four should feel like they're looking at four different
studios' best work — not four variations of the same scroll animation.

**Each project is a months-to-years commitment.** Not because it's hard to get
started, but because the difference between "good" and "the best thing I've ever
seen online" is 200 hours of tuning. The goal is the second one.

**Nothing generic ships.** If a feature looks like it came from a tutorial or a
template, it gets cut or rebuilt from scratch until it doesn't.

---

## Projects

| # | Name | Design Language | Technical Core | Status |
|---|------|----------------|----------------|--------|
| 01 | [Chronicle](./01-chronicle/SPEC.md) | Editorial / Cinematic / Narrative | GSAP ScrollTrigger, SVG animation, custom chapter shaders | Planning |
| 02 | [Flux](./02-flux/SPEC.md) | Generative / Scientific / Dark-ambient | WebGL Navier-Stokes fluid sim, GLSL compute shaders | Planning |
| 03 | [Kinotype](./03-kinotype/SPEC.md) | Typographic / Brutalist / Physics | CSS Houdini, variable fonts, Matter.js letter physics | Planning |
| 04 | [Resonance](./04-resonance/SPEC.md) | Synesthetic / Kinetic / Reactive | Web Audio API, FFT analysis, AI song fingerprinting | Planning |

---

## How to Use These Specs

Each `SPEC.md` is written so that a fresh Claude or Codex instance — with no
prior context — can read it and immediately understand:

- What is being built and why
- The design intent (not just the feature list)
- The technical decisions already made and why
- What phases exist and what's in scope for each
- What open questions still need a decision before work starts

When starting a new work session on any of these projects, READ THE SPEC FIRST.
Do not infer intent from the code. The spec is the source of truth for design
decisions; the code is the source of truth for what's currently implemented.

When you make a decision that isn't in the spec, ADD IT TO THE SPEC before
committing code. These specs are living documents.

---

## Target Audience for the Projects Themselves

- Non-technical recruiters who need to feel impressed immediately
- Technical hiring managers who want to see depth
- Frontend engineers who know what they're looking at and will recognize the craft
- Anyone who shares cool websites with friends

The projects live on the portfolio under the "Creative Frontend" category
alongside the other project categories (AI/ML, Full-Stack Web, Systems & Data,
Native & Mobile).
