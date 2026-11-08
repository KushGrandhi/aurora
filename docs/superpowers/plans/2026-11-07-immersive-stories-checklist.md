# Immersive stories: checklist

Goal: aurora makes unique, cinematic, interactive stories from data (in the spirit of bmwf3.com and Apple's product
pages), not one design language on a rigid page. The story covers who, what, when, where, why and how without naming
them; the model chooses the shape.

**Two dimensions, improved and measured separately (Kush, 2026-11-07):**
1. **Diversity:** the model picks the form that fits the reader's job (an answer, a story, a monitor, an explorer,
   a comparison, a tool, a reference, a pitch…) and blends forms across sections when that serves the reader.
2. **Quality:** whatever form it picked looks designed and is intuitive, never AI-generated.
Each has its own rubric: a view can pass one and fail the other. Diversity first (quality is judged per form).

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

- [x] 5. Eyes: `status` returns screenshots of the drawn view at a few scroll positions and two sizes; the model
  critiques against its outline and refines.
  Done in `cb4d112` as a separate `look` tool (pictures on every status would cost too many tokens): headless
  system Chrome, opening screen + one shot per story step, desktop ~6 shots (~7k tokens), phone on request;
  the skill's loop has a Look step. Unit and browser tests pass.
- [x] 6. Scroll as a continuous value: story sections send 0→1 progress (per step and whole section) to designs every
  frame (`useScrollProgress`), with kit helpers binding a GSAP timeline or camera to it.
  Done in `09b3024`: one scheduler, story `position` (1.37 = between steps), eased live `aurora.scroll` in the frame,
  kit `useScroll`/`span`/`useScrub`/`useScrollStep`, reduced motion snaps. Unit and browser tests pass.
- [x] 7. Immersive mode: a view flag hides the sidebar and article chrome; sections bleed edge to edge with their own
  backgrounds; more story layouts (visual full-screen behind text, centred text, horizontal scroll, split).
  Done in `e61b4f6` (story variants behind/side/split, keep-clear contract for kit) and `e2c8e22` (immersive
  flag, section grounds, `height: "screen"`, `layout: "reel"`, look per panel, long-step warning). Unit and
  browser tests pass, including the two story tests that had been waiting.
- [x] 8. Varied reference stories: 3–4 deliberately different examples (dark cinematic, editorial data journalism,
  technical blueprint, playful) so the model sees range, not one template.
  Note from the eval: no example is a data story, and Haiku built a data story from catalog parts only.
  Done in `ca1f177`: data-story (editorial, catalog only), cinematic (dark 3D, scroll-driven), blueprint (split,
  self-drawing SVG); each checked and corrected with look; tests keep them valid and clean.
## Track 1: Diversity (the right form for the reader's job)

- [x] D1. Choose the form: the skill's first decision is the reader's job, not the request's wording; a table of
  jobs → forms → aurora parts; forms blend per section (e.g. a story opening that hands over to an explorer).
  Replaces "anything bigger than one number is a story".
  Done in `0030512` (`references/forms.md`: nine forms, blending, the look follows the form).
- [x] D2. The parts non-story forms lack: a dense mode for monitors and explorers (tighter spacing, filters that stay
  on screen), and whatever the eval shows comparisons, tools and references need.
  Done in `314ca7e`: `density: "compact"`, balanced tile rows, sticky filters in the first compact section, unknown
  fields named as warnings. Revisit after D3 for what comparisons, tools and references need.
- [ ] D3. Eval matrix: Haiku on ~8 requests that need different forms (one answer, monitor, explorer, comparison,
  finding, mechanism, what-if, pitch), scored only on whether the form fits the job (blind to looks).

## Track 2: Quality (every form looks designed, never AI-generated)

- [ ] Q1. A quality rubric per form, and a concrete list of AI tells, so "beautiful and intuitive" is checkable.
- [ ] Q2. Reference examples for the non-story forms (monitor, explorer, comparison, tool), each with its own look.
- [ ] Q3 (was 9). Sameness check: warn when a view's fonts, palette and layout match recent views too closely.
- [ ] Q4. Eval: the same matrix scored on the quality rubric (a blind judge on look screenshots, plus Kush).

### Cinematic depth (quality, weeks)

- [ ] 10. Kit cinematic pieces: scroll-driven camera path, kinetic type, parallax layers, mask reveals, scale
  comparisons, data-to-3D (bars, globe, particles from query rows).
- [ ] 11. Charts that move with scroll: bars grow, lines draw, one chart morphs into the next, still bound to queries.
- [ ] 12. One scene for the whole story: a stage stays mounted while sections scroll over it; the camera travels
  between beats; catalog components overlay it.

### Long tail (quality)

- [ ] 13. Scroll-scrubbed video and image sequences from files the person provides.
- [ ] 14. Performance and access: frame budget, reduced-motion fallbacks for every scroll effect, phone version of
  every layout (ships alongside 6, 7 and 12).
- [ ] 15. Local, open-source image generation for subjects with no pictures.
