# Beautiful by default: aurora makes small models produce beautiful interfaces

## Why

An eval on 2026-11-06 gave Claude Haiku one prompt, "explain how a V8 car engine works, and visualize it on aurora", twice. Both runs worked (no errors, correct firing order) and both looked bad: eight rectangles in two rows, no V, no rods, a stack of small boxes in a card. The same aurora, driven by a stronger model, produced a lit, shadowed, rotatable 3D engine, so aurora can already show it. The gap is that the skill steers models to flat SVG ("draw visuals with SVG", flat examples), and a small model copies what it is shown.

Prompt wording alone does not fix this ("distributional convergence", Anthropic's frontend-design post). What works for production generative UI is a set of already-beautiful parts the model assembles, plus checks that reject output that falls below the bar.

## Goals

1. Any model connected to aurora, including Haiku and local Ollama models, produces interfaces that look designed: depth, light, motion and one coherent house style.
2. A mechanism ("how X works") becomes a full-screen 3D scene by default, not a diagram of boxes.
3. aurora tells the model when its output is ugly, in the same way it already reports errors, so the model fixes it.

## Non-goals

- Per-view aesthetic variety (distinctive fonts, themes). aurora keeps **one house style** applied consistently; consistency is what small models can hit.
- Replacing the catalog components (kpi, chart, table…). They stay as they are.
- Physically exact simulations. Scenes are explanatory, not CAD.

## Anti-goals (a failure even if it works)

- A breaking change to the published view format or the existing design sandbox: every existing view must render as before.
- Network access from the sandbox (no CDN fonts, HDRs or models).
- A kit so rigid that a design can only be one of a few templates. The kit is the easy path; plain three.js, SVG and Tailwind stay available.

## Decided

- **3D in React:** add `@react-three/fiber` (v8, React 18) and `@react-three/drei` (v9) to the sandbox, served offline like the other libraries.
- **`aurora/kit`:** a new importable module of house-style building blocks: a lit, shadowed, orbitable `Scene` that needs no setup; materials (metal, glass, glow); 3D labels; a full-bleed stage with glass panels; a play/pause/speed/step control bar with a clock hook; staggered reveals; a phase dial and legend. It uses aurora's tokens so it follows the theme.
- **`display: "hero"`:** a design shown full width with no card frame at the top of its view, with ordinary sections below it. `page` stays as it is.
- **Design checks:** after a design renders, the sandbox measures it and reports **warnings** (never errors): text overflowing its box, a WebGL scene shown as a card, a drawing made only of flat boxes and lines, too many small bordered boxes. Warnings reach the model through `problems`, like render errors do.
- **Skill as recipes:** the skill routes each kind of request to a recipe (mechanism → full-screen 3D scene, process → scroll story, product → landing page, data → catalog components), each with a complete example built on the kit, plus a short list of banned defaults.
- **Measure:** rerun the V8 and heart prompts on Haiku after the work and compare screenshots against a written rubric.

## Left to the builder

Exact kit component names beyond those the plan fixes, check thresholds within the ranges the plan gives, and the visual details of the house style within the existing tokens.
