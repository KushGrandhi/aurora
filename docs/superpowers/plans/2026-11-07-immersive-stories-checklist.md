# Immersive stories: checklist

Goal: aurora makes unique, cinematic, interactive stories from data (in the spirit of bmwf3.com and Apple's product
pages), not one design language on a rigid page. The story covers who, what, when, where, why and how without naming
them; the model chooses the shape.

Ordered from most impact for least work to least impact for most work. Claude ticks an item when it is done and
verified, with the commit. Each technical item passes a discriminator review before it is built.

Decision (Claude's call, open to change): stories stay inside aurora through an immersive mode (item 7), so versions,
patches, queries and linked focus keep working; a story can drop aurora's chrome and look like its own page.

## Quick wins (skill and config, days)

- [x] 1. Art direction instead of rules: rewrite `design-language.md` so the model picks mood, type pairing, palette
  and motion personality from the subject; keep only real guardrails (contrast, legibility, honest data, no motion over
  text). Remove the fixed type scale, the one entrance, the bans, the section-by-section landing script.
  Done in `5648fb5`. Haiku eval on the Jarvis Inspector data (2026-11-07, before = main, after = items 1-4): the
  after story has a point-making headline, a clear arc with an ending, its own paper palette and Fraunces/Inter;
  but it is still catalog-only (KPI hook, no visual, no story section) and one callout contradicts its numbers.
  Not cinematic yet: that needs items 5-7 and 10.
- [x] 2. A story-shaping step: before any component, the model writes a short outline that covers the 5 Ws and H
  silently, picks an opening hook, one signature moment, pacing and an ending.
  Done in `5648fb5` (`references/story.md`, loop step 1). Same eval (above).
- [x] 3. Palette sets the whole stage: background, ink and surfaces, not just accent and series (dark cinematic,
  paper editorial…).
  Done in `a329fd9`: `palette.page`/`ink`, contrast-solved stage in OKLab, reaches screen, charts, Mermaid, maps,
  code, designs and variants; unit and browser tests pass.
- [x] 4. More fonts: Kush chose Google Fonts. Any of 1,957 families by name (`fonts: {display, body, mono, extra}`),
  fetched once by the server and cached in `~/.aurora/fonts`; the three bundled faces stand in offline.
  Done in `b05b06c`; unit and browser tests pass, live fetch checked (4 families in 0.9 s).

## Core capability (a week or two each)

- [ ] 5. Eyes: `status` returns screenshots of the drawn view at a few scroll positions and two sizes; the model
  critiques against its outline and refines.
- [ ] 6. Scroll as a continuous value: story sections send 0→1 progress (per step and whole section) to designs every
  frame (`useScrollProgress`), with kit helpers binding a GSAP timeline or camera to it.
- [ ] 7. Immersive mode: a view flag hides the sidebar and article chrome; sections bleed edge to edge with their own
  backgrounds; more story layouts (visual full-screen behind text, centred text, horizontal scroll, split).
- [ ] 8. Varied reference stories: 3–4 deliberately different examples (dark cinematic, editorial data journalism,
  technical blueprint, playful) so the model sees range, not one template.
  Note from the eval: no example is a data story, and Haiku built a data story from catalog parts only.
- [ ] 9. Sameness check: warn when a view's fonts, palette and layout match recent views too closely.

## Cinematic depth (weeks)

- [ ] 10. Kit cinematic pieces: scroll-driven camera path, kinetic type, parallax layers, mask reveals, scale
  comparisons, data-to-3D (bars, globe, particles from query rows).
- [ ] 11. Charts that move with scroll: bars grow, lines draw, one chart morphs into the next, still bound to queries.
- [ ] 12. One scene for the whole story: a stage stays mounted while sections scroll over it; the camera travels
  between beats; catalog components overlay it.

## Long tail

- [ ] 13. Scroll-scrubbed video and image sequences from files the person provides.
- [ ] 14. Performance and access: frame budget, reduced-motion fallbacks for every scroll effect, phone version of
  every layout (ships alongside 6, 7 and 12).
- [ ] 15. Local, open-source image generation for subjects with no pictures.
