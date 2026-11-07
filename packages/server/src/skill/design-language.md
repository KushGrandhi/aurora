# aurora design language

aurora's screen is calm, warm-neutral and precise: soft off-white (or near-black) surfaces, hairline borders, one blue accent, a small fixed palette for categories, Inter type, and motion that explains rather than decorates. A design you build should feel like it belongs on that screen, and like a finished product: **depth, light and motion**, never a wireframe. There is one house style; don't invent a new look per view.

## Five principles

1. **Answer first.** The headline says the point ("It moves heat out; it doesn't make cold"), not the topic ("Refrigerators"). The most important thing is the biggest thing.
2. **Calm surfaces, meaningful color.** Neutrals carry the layout. Color appears only where it means something: an action, a category, a state.
3. **Label the thing itself.** Names sit next to what they name. Don't make the reader match colors against a legend.
4. **Motion explains.** Animate to show cause and effect, flow or a change of state, never as decoration.
5. **Let them touch it.** If something changes over time or has parts, let the reader play, pause, step, scrub and select.
6. **Depth over boxes.** Physical things are lit 3D objects (`aurora/kit`): metal, glass, glow, real shadows. The main visual is big and edge to edge; text sits straight on it as type (bare `Panel`, `Stat`), never in cards. Glass only for dense controls.

## Banned defaults

These are what an interface looks like when nobody designed it. Each has a replacement.

| Instead of | Do this |
|---|---|
| a machine, organ or process drawn as rectangles in rows | a 3D scene with `aurora/kit`: `Scene`, `Metal`, `Glass`, `Glow`, `Label` |
| a 3D scene or big visual in a card | `display: "hero"` with sections below it, or `display: "page"` |
| eight small stat boxes around the visual | one `Panel` with two to four readouts |
| text and numbers in frosted cards over a scene | bare `Panel` and `Stat`: large type on the scene |
| a title inside a hero design | nothing: the screen shows the view's title and summary on the hero |
| a flat solid background behind a visual | `Stage`'s soft radial backdrop |
| motion scattered over every element | one `Stagger` entrance, plus the mechanism's own motion |
| labels on top of moving parts | `Label` with its leader line, set off to one side |
| a legend you have to match colours against | colour on the object itself, named by a `Label` or the panel |

## Tokens

Every design sandbox has these as Tailwind colors and as CSS variables. They switch with aurora's light/dark theme, so **don't write `dark:` variants** and **don't use Tailwind's palette** (`slate-*`, `gray-*`, `indigo-*`…), `white`, `black` or hex values.

| Token | Tailwind | CSS | Use for |
|---|---|---|---|
| page | `bg-page` | `var(--page)` | the page background |
| surface | `bg-surface` | `var(--surface)` | cards and panels |
| raised | `bg-raised` | `var(--raised)` | controls, inputs, things on a card |
| ink | `text-ink` | `var(--ink)` | headings, primary text, dark strokes |
| ink-2 | `text-ink-2` | `var(--ink-2)` | body text, secondary strokes |
| muted | `text-muted` | `var(--muted)` | captions, small labels, inactive things |
| hair | `ring-hair`, `border-hair`, `divide-hair` | `var(--hair)` | hairline borders |
| line | `stroke-line`, `bg-line` | `var(--line)` | grid lines, leader lines, light structure |
| accent | `bg-accent`, `text-accent`, `ring-accent` | `var(--accent)` | the primary action, focus, selection |
| good / bad / warn | `text-good`, `bg-bad`… | `var(--good)`… | state: success, failure or danger, caution |
| s1…s8 | `bg-s1`, `fill-s3`, `stroke-s2`… | `var(--s1)`… | categories, always in this order |
| shadow | `shadow-card` | `var(--shadow)` | the one card shadow |

Series colors in order: s1 blue, s2 orange, s3 green, s4 amber, s5 pink, s6 deep green, s7 violet, s8 red. Natural meanings: **cold/water/in = s1**, **heat/energy = s2 or s4**, **danger/burn = bad**, **spent/inactive = muted**.

Mixing: `color-mix(in oklab, var(--s1), var(--s4) 40%)` blends two tokens and still follows the theme. Fading: use the `opacity` attribute or class, or Tailwind's `/` modifier (`bg-accent/10`).

On a filled accent or category color, text is `text-white`. On `bg-ink` (an inverted block), text is `text-page`.

## Type

Inter is loaded. Use these and nothing in between:

| Role | Classes |
|---|---|
| Display (page hero) | `text-4xl md:text-6xl font-semibold tracking-tight` |
| Title | `text-3xl font-semibold tracking-tight` |
| Heading | `text-xl font-semibold tracking-tight` |
| Card heading | `font-semibold` |
| Body | `text-base` or `text-sm`, `leading-relaxed text-ink-2` |
| Label / eyebrow | `text-xs font-medium uppercase tracking-wider text-muted` (or `text-accent` for an eyebrow) |
| Numbers | add `tabular-nums` |
| SVG labels | `fontSize={12}` with `fill="var(--ink-2)"`; small notes `fontSize={11}` with `fill="var(--muted)"` |

Sentence case everywhere. Keep body lines under about 70 characters (`max-w-xl` for paragraphs).

## Space and shape

- 4px grid: `gap-2`, `gap-4`, `gap-6`, `p-4`, `p-6`, `py-20`. Prefer more space to less.
- Page width: `mx-auto max-w-6xl px-6`. Sections on a page: `py-20`.
- **Card:** `rounded-2xl bg-surface p-6 shadow-card ring-1 ring-hair`.
- **Inset or tile on a card:** `rounded-xl bg-raised px-3 py-2 ring-1 ring-hair`.
- **Primary button:** `rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90`.
- **Secondary button:** `rounded-xl bg-raised px-4 py-2 text-sm font-medium ring-1 ring-hair hover:bg-surface`.
- **Segmented control:** a `grid grid-cols-N gap-1 rounded-xl bg-raised p-1 ring-1 ring-hair`; the selected segment gets its color as background and `text-white`. Labels must fit: one short word each (at most about 10 letters for 4 segments in a 320px panel), or use `grid-cols-2` for long names.
- **Button rows:** `flex flex-wrap gap-2`, so they wrap on a phone instead of overflowing.
- **Pill / badge:** `rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-2 ring-1 ring-hair`.
- **Slider:** `<input type="range" className="w-full" style={{ accentColor: "var(--accent)" }} />`.
- Icons: `lucide-react` at `size={16}` (inline) to `18` (feature tiles), colored `text-accent` or `text-ink-2`.

## Motion

- Easing: `[0.22, 1, 0.36, 1]` (motion) or `var(--ease)` (CSS).
- Enter: fade and rise 8 to 12px, 0.3 to 0.5 s, staggered by about 0.08 s.
- State change (a panel swapping content): 0.2 s with `AnimatePresence mode="wait"`.
- Continuous animation only for a mechanism or flow. Drive it from one `requestAnimationFrame` loop holding a single number (time or angle); compute everything else from that number.
- Respect reduced motion: start paused when `matchMedia("(prefers-reduced-motion: reduce)").matches`.

## 3D scenes

- Build with `aurora/kit` (`references/kit.md`): `Scene` already has studio light, reflections, soft shadow and orbit controls. Don't add your own lights or cameras.
- Materials say what a part is: `Metal` for moving mechanical parts, `Glass` for walls you need to see through, `Glow` (with a token colour) for what is hot, live or flowing, `Paint` for the one part to look at.
- Make the inside visible: glass walls, cut-aways, a translucent shell. The reader came to see how it works.
- Label four to six parts with `Label`. Put the explanation in panels, not on the model.
- Frame it: camera about 30° above and to one side, so depth reads. The object fills most of the stage.

## Drawings (SVG)

For abstract things with no physical form (a protocol, an algorithm, a timeline you draw yourself). Not for machines or organs: those are 3D.


- `<svg viewBox="0 0 W H" className="h-auto w-full">`: it scales to any width. **Make W close to the width it is shown at** (about 400 to 600 for a drawing beside a 320px panel) and fill it: a wide viewBox shown small shrinks every label and stroke. Draw the parts big; leave at most about 10% empty margin.
- Parts: `fill="var(--raised)"` with `stroke="var(--ink-2)"` (strokeWidth 1.5 to 2), or `fill="var(--line)"` for structure such as walls and frames.
- Labels go **outside** the parts, connected by a 1px `stroke="var(--line)"` leader line. Keep them at fixed positions away from anything that moves.
- Flow: small dots (r 2 to 3) moving along a path, colored by meaning. Show flow only while it's actually happening.
- State: show it through color (token by meaning), density (more dots = more pressure), and fill level.
- Deterministic: no `Math.random()` during render; precompute positions.

## Layout recipes

**Physical mechanism** (see `examples/mechanism.md`): `display: "hero"` (the view's `title` and `summary` become the hero's headline, so write them well), a `Stage` whose `Scene` fills it, `Panel at="top-right"` (what just happened, then the part being followed: `PhaseDial`, state, one sentence), `Panel at="bottom" glass` (`ControlBar` plus selector chips). Below the hero, as ordinary sections: `steps` and a `callout`.

**2D interactive explainer** for an abstract process (see `examples/explainer.md`):
```
[ drawing card (wide)                    ] [ panel 320px          ]
[                                        ] [ Play  Next step      ]
[   labelled parts, animated mechanism   ] [ Speed slider         ]
[                                        ] [ stage switcher       ]
[                                        ] [ current step card    ]
[                                        ] [ live readouts (2x2)  ]
```
`grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]`: on a phone the panel drops below the drawing.

**Landing page** (see `examples/landing.md`), top to bottom: sticky nav; hero (pill, display headline, one-sentence promise, primary and secondary button, **a visual**: a product mockup built from divs and tokens); proof strip; three feature cards; how it works (3 numbered steps on a `bg-surface` band); pricing (3 tiers, the middle one featured with `ring-accent`); FAQ accordion; a closing call to action on `bg-ink text-page`; footer.

**Concept with parts** (no time element): one labelled drawing (span 12), then catalog `steps` and a `callout` beside each other.

## Words

- Specific beats generic: "Flights land Friday 9:40" not "Lorem ipsum"; "Ships every two weeks" not "Fast delivery".
- Buttons are verbs: "Start writing free", "Next step".
- One idea per card. Cut every sentence the reader doesn't need.
