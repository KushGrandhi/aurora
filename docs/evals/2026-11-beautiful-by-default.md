# Haiku before and after "beautiful by default"

**Question:** given only a one-line prompt, does a small model (Claude Haiku) produce a beautiful interface on aurora?

**Setup:** fresh Haiku subagents, with the aurora skill and tools installed as for any session. Each got the prompt verbatim, plus a view id and a scratch folder so parallel runs could not overwrite each other:

- "explain how a V8 car engine works, and visualize it on aurora." (two runs)
- "explain how the human heart pumps blood, and visualize it on aurora." (two runs, after only)

**Before:** aurora and skill at `00ffab2` (2026-11-06 morning). **After:** `a4527a0` (stages 1–6 of `docs/superpowers/plans/2026-11-06-beautiful-by-default.md`). Screenshots are 1440 px wide.

## Rubric (0–2 per row)

| Row | 0 | 1 | 2 |
|---|---|---|---|
| Depth | flat boxes and lines | some layering or shading | lit 3D or equally rich visual |
| Motion that explains | static | moves, but doesn't show cause and effect | the mechanism itself animates, with controls |
| Layout | visual boxed in a card among many small boxes | mixed | the main visual leads (hero/page), few panels |
| Correctness | wrong mechanism | simplified in a misleading way | right mechanism, honest simplifications |
| Clean status | errors | warnings | no errors and no warnings |

## Results

| Run | Depth | Motion | Layout | Correct | Status | Total |
|---|---|---|---|---|---|---|
| Before · V8 run 1 | 0 | 2 | 0 | 1 (no V, no rods) | 2 | **5** |
| Before · V8 run 2 | 0 | 2 | 0 | 1 (no V, no rods) | 2 | **5** |
| After · V8 run a | 2 | 2 | 2 | 2 | 2 | **10** |
| After · V8 run b | 2 | 2 | 2 | 2 | 2 | **10** |
| After · heart run a | 2 | 2 | 1 (a label sits on a panel) | 2 | 2 | **9** |
| After · heart run b | 2 | 2 | 2 | 2 | 1 (false warning, see below) | **9** |

**Before:** both V8 runs were eight rectangles in two rows inside a card, surrounded by eight small readout boxes. Haiku said itself that it drew "the banks as rows rather than a true V, and the connecting rods are not drawn". See `img/before-v8-run1.png`, `img/before-v8-run2.png`.

**After, V8:** both runs are a full-width 3D engine: glass bores with pistons and glowing gas, a turning crank, labels, three floating panels, and steps and a callout below. `img/after-v8a-dark.png`, `img/after-v8b-dark.png`. **Caveat:** the skill's worked example *is* a V8. Run a's `Engine.tsx` is byte-identical to the example, so the V8 prompt measures whether the model finds and uses the recipe, not whether it can design.

**After, heart (the real test, a subject with no example):** both runs built a new 3D scene with the kit: glass chambers whose blood swells and shrinks with volume, red and blue blood moving along vessels, valves, labels on the chambers, a phase dial and live readouts. The two runs are different designs. Run b's valve rings turn green when open and grey when shut, and it adds "jump to phase" chips. `img/after-hearta-*.png`, `img/after-heartb-*.png`.

## What still goes wrong

1. **False "many small boxed panels" warning.** The kit's own 3D labels (rounded pills with a ring) count as boxes, so a scene with six labels trips the check. Heart run b got this warning for doing the right thing. → Stage 4's check must skip kit labels and controls.
2. **The model reads `status` before the design checks arrive.** Checks report about 2 s after a design draws; both heart runs called `status` once, saw nothing, and said "no design warnings". → The skill should tell the model to check `status` again after a few seconds, or `status` should say checks are still pending.
3. **Labels can land on a panel.** Heart run a's "aorta to the body" label sits over the top-left panel's text. → A check for labels overlapping panels, or kit labels that sit below panels in stacking order.

## Fixed after the review

A fresh reviewer then read the whole change. It found what the eval missed: token colours in 3D materials never updated (`useToken` mutated one Color in place, and React Three Fiber compares props by reference). So the V8 example's gas kept the colour of the stroke it started in. All of these now have a test that failed first:

- 3D materials recolour on a colour change and on a theme switch.
- Design checks always report. A frame that is never painted is checked after a timeout, and a design stays `unverified` until its checks arrive. The skill now tells models to check `status` again after a few seconds (eval finding 2).
- The box check ignores kit labels, controls, legends and pills, and Tailwind's transparent shadow layers (eval finding 1). The flat-drawing check ignores filled bar charts.
- 3D labels sit below panels (eval finding 3). On phones the stage grows so panels and controls stay reachable.
- Variant previews no longer overwrite the live view's warnings. A bug inside a 3D scene is reported as itself, not as "WebGL is off".
