# Art direction

Every view gets its own look, decided from its subject and its story. A story about Formula 1 should not look like a story about coral reefs, and neither should look like the last thing you made. aurora gives you the means to make any direction coherent (a palette that sets the whole stage, tokens that follow it everywhere, fonts, 3D, motion). You choose the direction.

Shape the story first (`references/story.md`). Then decide the look, then build.

## Decide a direction before you build

Write these down in your own reasoning, in a line each:

1. **The subject's world.** What does this subject look and feel like in real life? Racing is carbon fibre, speed and night. The ocean is depth, cold light and slow movement. Money is paper, ink and precision. A history is archival print and the colour of old photographs.
2. **The mood**, in two or three words: "hushed, precise, expensive", "loud, kinetic, proud", "warm, curious, hand-made".
3. **A genre to borrow from**: a product film, a newspaper data story, a museum placard, an engineering blueprint, a sports broadcast, a field guide, a magazine feature, a mission control screen.
4. **The stage**: dark, light or tinted, and its colours, set with the view's `palette` (below).
5. **The type**: a display face and a body face that fit the mood (the fonts are listed in `references/design-canvas.md`).
6. **The motion personality**: "heavy and slow, like a camera on a crane", "snappy and exact", "springy and playful", "still, so only the data moves".
7. **The signature moment** from your story outline, and how the look serves it.

**Don't repeat yourself.** The examples show how things work, not what things should look like. If your direction matches the example you started from, or the last view you made, change it. Two subjects that differ should look different.

## Colour

A view's `palette` sets the stage. `page` is the background, `ink` is the text, and aurora derives every other surface, line and muted tone from those two, for the screen, the charts and every design, so they always agree. `accent` is the one colour that marks action and emphasis, and `series` are the colours for categories, in order.

```json
"palette": { "page": "#0b0d10", "ink": "#e9e6df", "accent": "#e8590c", "series": ["#e8590c", "#5b8def", "#d9a441"] }
```

- **Draw it from the subject.** Hot orange for combustion, oxygen red and venous blue for blood, chlorophyll green on warm paper for a forest, signal yellow on asphalt black for a road story. Not the default blue.
- **A dark stage** feels cinematic and makes light, glow and colour sing. **A light stage** feels editorial and calm. **A tinted stage** (deep navy, warm paper, forest green) gives a story its own place.
- **Colour means something.** Once a colour stands for a thing, it stands for that thing everywhere in the view: the chart, the 3D part, the word in the prose.
- In a design, use the tokens (`bg-page`, `text-ink`, `var(--accent)`, `var(--s1)`…), never hard-coded colours: the tokens carry your palette, and they keep working when the person switches theme. Blend with `color-mix(in oklab, var(--s1), var(--page) 60%)`; fade with Tailwind's `/` (`bg-accent/10`). Gradients, glows and vignettes are fine when they come from the palette and play a part (light falling on the subject, depth behind it).

## Type

Type carries the voice. Pick a display face for headlines and the hook, and a body face for reading (they can be the same family).

- **Contrast in scale is what makes a page feel cinematic.** One enormous line (`text-[clamp(3rem,9vw,9rem)] leading-[0.9] tracking-tight`) or one gigantic number beats ten medium ones. Then drop straight down to quiet body text.
- **Body text stays readable:** 16 to 20px, `leading-relaxed`, lines under about 70 characters (`max-w-xl` or `max-w-prose`), in `text-ink` or `text-ink-2`.
- **Small labels** are `text-sm`, in sentence case. Use uppercase tracking only when the genre calls for it (a mission control readout, a blueprint title block), never on autopilot over every heading.
- **Numbers** get `tabular-nums`. A huge number can take the display face.
- **Headlines say the point** ("It moves heat out; it doesn't make cold"), never the topic ("Refrigerators").

## Composition

- **The main visual is big.** Full screen or edge to edge, with the text set on it or beside it. A visual boxed in a card is small.
- **Asymmetry and empty space.** A column of text on the left third, a visual bleeding off the right edge; a full screen holding one sentence. Generous space reads as confidence.
- **Rhythm.** Alternate big moments (a full-screen scene, one huge number) with quiet reading moments. Vary the layout from beat to beat; a page of identical blocks reads as a form.
- **Depth.** Layers: something far (a backdrop, a soft gradient), the subject, and type in front. A 3D scene, a photograph or a drawing can all give it.
- **Text never fights the visual.** Over a busy area, put the text in a calm spot, or give it a halo or a scrim from the palette.

## Motion

Motion is where a page feels alive, so direct it like a film.

- **Tie it to the reader.** Things move because the reader scrolled, dragged, hovered or reached a beat. A `story` section moves its visual as the steps pass.
- **Choreograph.** In each moment, one thing leads and the rest follow with a short delay. Don't animate everything at once, and don't give every section the same entrance.
- **Match the motion personality you chose.** Heavy and cinematic: 0.8 to 1.6 s, slow ease-out (`[0.16, 1, 0.3, 1]`), long travel, camera moves. Precise: 0.2 to 0.4 s, `[0.22, 1, 0.36, 1]`, short travel. Playful: springs (`type: "spring", stiffness: 260, damping: 20`).
- **Techniques to reach for:** a camera that flies in or orbits to the next part, parallax layers, a mask or clip-path that reveals an image or a line of type, kinetic type (words arriving one by one), a chart that grows and then morphs into the next one, a scale comparison that zooms out until the number makes sense.
- **Continuous animation** is for a mechanism or a living scene (an engine running, water flowing). Drive it from one `requestAnimationFrame` loop holding one number, and compute everything else from that number.
- **Respect reduced motion:** when `matchMedia("(prefers-reduced-motion: reduce)").matches`, show each state without the travel.

## Defaults nobody chose

These are what an interface looks like when nobody made a decision. Each is fine if you chose it for this story; reject it when it's just the default.

- a purple-to-blue gradient, glow blobs or gradient text with no reason in the subject
- the same fade-and-rise on every section
- a small uppercase tracked label over every heading
- a row of identical cards, or eight small stat boxes around the visual
- numbers counting up from zero for decoration (counting is fine when the count is the point, such as years passing)
- glass on everything
- the default blue
- a physical thing drawn as rectangles in rows (build it in 3D with `aurora/kit`)

## The guardrails

These hold whatever direction you choose:

1. **Legible.** Text keeps strong contrast against whatever is behind it, including over images and 3D. aurora rejects a palette whose `ink` is hard to read on its `page`.
2. **Honest.** Numbers come from queries. Motion never distorts a quantity.
3. **Nothing moves over text being read.** Moving things travel in their own space, clear of labels.
4. **Labelled on the thing.** Names sit next to what they name, with a thin leader line if needed, not in a legend you have to match colours against.
5. **Works everywhere.** It works on a phone (grids use `md:` breakpoints, rows use `flex-wrap`, SVGs use `viewBox` with `className="w-full h-auto"`) and in both themes (tokens only, no `dark:` variants).
6. **Real content.** Specific, believable words. No lorem ipsum and no empty image boxes.

## Tokens

Every design sandbox has these as Tailwind colours and as CSS variables. They carry the view's palette and switch with the theme, so **don't write `dark:` variants** and **don't use Tailwind's own palette** (`slate-*`, `gray-*`, `indigo-*`…), `white`, `black` or hex values.

| Token | Tailwind | CSS | Use for |
|---|---|---|---|
| page | `bg-page` | `var(--page)` | the stage background |
| surface | `bg-surface` | `var(--surface)` | a panel or card, when you need one |
| raised | `bg-raised` | `var(--raised)` | controls, inputs, things on a panel |
| ink | `text-ink` | `var(--ink)` | headlines, primary text, dark strokes |
| ink-2 | `text-ink-2` | `var(--ink-2)` | body text, secondary strokes |
| muted | `text-muted` | `var(--muted)` | captions, small labels, inactive things |
| hair | `ring-hair`, `border-hair`, `divide-hair` | `var(--hair)` | hairline borders |
| line | `stroke-line`, `bg-line` | `var(--line)` | grid lines, leader lines, light structure |
| accent | `bg-accent`, `text-accent`, `ring-accent` | `var(--accent)` | the primary action, emphasis, selection |
| good / bad / warn | `text-good`, `bg-bad`… | `var(--good)`… | state: success, failure or danger, caution |
| s1…s8 | `bg-s1`, `fill-s3`, `stroke-s2`… | `var(--s1)`… | categories, in order |
| shadow | `shadow-card` | `var(--shadow)` | a soft shadow |

Without a `series`, the categories are s1 blue, s2 orange, s3 green, s4 amber, s5 pink, s6 deep green, s7 violet and s8 red. Natural meanings: cold, water or input = s1; heat or energy = s2 or s4; danger = `bad`; spent or inactive = `muted`.

On a filled accent or category colour, text is `text-white`. On `bg-ink` (an inverted block), text is `text-page`.

## Craft notes

**3D scenes** (`references/kit.md`). `Scene` has studio light, reflections, a soft shadow and orbit controls. Materials say what a part is: `Metal` for moving mechanical parts, `Glass` for walls you need to see through, `Glow` for what is hot, live or flowing, `Paint` for the one part to look at. Show the inside (glass walls, cut-aways, a translucent shell). Label four to six parts with `Label`. Frame the object about 30° above and to one side so depth reads, filling most of the stage. Put readouts on the stage as plain type (`Panel`, `Stat`, at most three panels); glass only for dense controls.

**Drawings (SVG)** for things with no physical form (a protocol, an algorithm):
- `<svg viewBox="0 0 W H" className="h-auto w-full">`, with W close to the width it shows at (a wide viewBox shown small shrinks every label). Fill it; leave at most about 10% empty margin.
- Parts: `fill="var(--raised)"` with `stroke="var(--ink-2)"`, or `fill="var(--line)"` for structure. Labels outside the parts with a 1px `stroke="var(--line)"` leader line, at fixed positions away from anything that moves. Labels `fontSize={12}` `fill="var(--ink-2)"`.
- Flow: small dots (r 2 to 3) moving along a path, coloured by meaning, only while the flow is happening.
- Deterministic: no `Math.random()` during render; precompute positions.

**Interactive explainers** let the reader play, pause, step, scrub and change speed, show the current step, and give live readouts of what is true right now.

**Controls** (when you need them): buttons are verbs ("Next step"), button rows `flex flex-wrap gap-2`, segmented controls with labels short enough to fit, sliders with `style={{ accentColor: "var(--accent)" }}`. `lucide-react` icons at 16 to 18px.

**No fixed height** on a design card: it grows with its content. Set a height only for a stage that fills the screen.

## Starting points

These show the mechanics of three common kinds of design. Copy how they work, then give them your own look.

- **Something physical** (`examples/mechanism.md`): a `story` section whose first item is a 3D `Stage` that reads `useStory()` and freezes on each step's `state`, with a `Scrubber` and a grabbable part for exploring. The steps are two or three sentences per moment. After the story, a `callout`.
- **An abstract process** (`examples/explainer.md`): a wide drawing beside a 320px panel of controls, a current-step card and readouts (`grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]`).
- **A page** (`examples/landing.md`): a whole website as one design with `display: "page"`. Its sections are one possible order, not a required one; a product story may want a single scrolling film instead.
