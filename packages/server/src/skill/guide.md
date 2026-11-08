# aurora: show it on a screen

aurora is a local screen (http://localhost:4317). You send it a **view** (JSON). It draws the view, animates it, keeps every version and tells you what broke. Use it whenever seeing beats reading: data, how something works, how a system is built, a page or product idea.

This file is the whole method. The files under `references/` and `examples/` hold detail; each section below says when to open one.

## The loop

Follow these steps in order, every time.

1. **Shape** the story and choose its look. Anything bigger than a one-number answer is a story: read `references/story.md` and outline it (the one sentence, the hook, the beats, the signature moment), then read `references/design-language.md` and decide its direction (the stage colours, type and motion that fit this subject). Never default to the look of the last view or the example.
2. **Pick** the components for each beat with the table below. Catalog components show data and structure well with little effort; use a `design` for the beats that need their own visual, above all the hook and the signature moment.
3. **Render** the frame with `mcp__aurora__render`: title, one-line summary and sections (with the first item, or with `"items": []`).
4. **Add** the remaining items with `mcp__aurora__patch`, **one call at a time**. Each call passes `baseVersion` = the `version` the previous call returned. Two patches sent together collide.
5. **Check** with `mcp__aurora__status`. Fix every `error` with a patch, then check again.
6. **Look** at it with `mcp__aurora__look`: pictures of the view as a person sees it, top to bottom, one per story step. Judge them against your outline and the look you chose: is the hook on the first screen and does it grab? One idea per beat? Is the signature moment there? Anything overlapping, cut off, too small, hard to read or empty? Fix it with patches and look again (two or three rounds at most). Add `"sizes": ["desktop", "phone"]` once, before you finish, to check the phone layout; pass `"section"` to look at just one part.
7. **Review** your work against **Before you finish** at the end of this file.
8. **Tell** the user the URL in one line. Don't repeat the content in the terminal.

`unverified` in a result means no screen has drawn and checked the item yet. A `design` stays `unverified` for a few seconds after it draws, while aurora runs its design checks: call `status` again after about 3 seconds and fix any `design:` warning. If it is still `unverified` after that, no screen is open: `look` still works (it draws the view itself), so use it to check your work, and give the URL to the user.

## Pick components

| The user wants to see | Use | span |
|---|---|---|
| headline numbers from data | `kpi` row (read `references/data.md` first) | 3 or 4 each |
| a trend, comparison or distribution | `chart` | 12 |
| the rows themselves | `table` | 12 |
| how a system is built: parts and what talks to what | `architecture` | 12 |
| a flow, a sequence of messages, a state machine | `diagram` (Mermaid) | 12 |
| an ordered process, setup steps, stages | `steps` | 6 to 12 |
| the one point not to miss: a decision, risk or tip | `callout` | 4 to 12 |
| history, a schedule, milestones | `timeline` | 12 |
| places | `map` | 12 |
| many relationships (dozens of nodes and up) | `graph` | 12 |
| real code or a diff | `code` | 12 |
| a collection: projects, people, files | `cards` | 12 |
| images or video that already exist | `media` | 12 |
| prose, or JSON to inspect | `text`, `json` | 6 to 12 |
| **how something physical works: an engine, a heart, a machine, the solar system** | a `story` section: a 3D `aurora/kit` scene pinned, with steps that drive it, and a `palette` from the subject (copy `examples/mechanism.md`) | — |
| **a landing page or product mockup** | `design` with `display: "page"` (copy `examples/landing.md`) | 12 |
| **an abstract process with no physical shape (an algorithm, a protocol), a simulation, a game** | `design` | 12 |

Good combinations:
- **Explain how something physical works:** a `story` section: the 3D scene pinned, one short `text` step per moment (each with `"story": {"state": …}`), the last setting it running; then a `callout`. The story *is* the steps: no `steps` list under the scene.
- **Explain a system:** `architecture`, then a `diagram` for its main request, then a `callout` for the key decision.
- **Analyse data:** for a quick look, a row of `kpi`, then a `chart`, then a `table`, with filters when the reader will want to slice it. For a story about the data, shape it first (`references/story.md`) and start from `examples/data-story.md`.
- **A page or product:** one `design` with `display: "page"`, as the only item in the view.

Before using a component for the first time, read its fields and example in `references/components.md`.

**Examples.** Before a story or a `design`, open the closest one (and, for a design, `references/design-canvas.md` and `references/kit.md`). Copy how it works, never its look: each chose a different one on purpose.
- `examples/data-story.md`: a story from data with catalog parts only: a screen-sized number, a pinned chart that lights up, a reel.
- `examples/cinematic.md`: a dark 3D scene behind the steps that moves with the scroll.
- `examples/blueprint.md`: a drawing that builds itself, split screen.
- `examples/mechanism.md`: a 3D machine whose steps freeze it on each moment, with a scrubber and a part to grab.
- `examples/explainer.md`: a 2D process with play, step and speed controls. `examples/landing.md`: a whole website.

## The view

```json
{
  "v": 2, "id": "fridge", "title": "How a refrigerator works", "summary": "It moves heat out; it doesn't make cold.",
  "sections": [
    { "id": "cycle", "title": "The cycle", "layout": "grid", "items": [
      { "id": "loop", "span": 12, "c": { "type": "diagram", "source": "flowchart LR\n  A[Evaporator] --> B[Compressor]" } }
    ] }
  ]
}
```

- Every id (view, section, item, query, dataset) matches `^[A-Za-z_]\w*$` and is unique in the view. Patches find things by id, so keep ids stable.
- The screen reads like an article: the view `title` and `summary` are the page headline (on a hero they sit on the stage), and each section `title` is a large heading. Write them as short headlines that say the point ("East leads, barely"), not labels ("Data"). Items sit on the page without boxes.
- **Everything is linked.** Pointing at a value anywhere (a bar, a row, a part in a design) lights it up in every item. Use the same names across items (the chart's category, the table's column, the design's part) and in prose.
- `fonts` (optional): `{"display": "Fraunces", "body": "Inter", "mono": "JetBrains Mono"}`, any Google Fonts families by exact name, for the headline and headings, the prose and the code, on the screen and in designs. Choose them with the look (`references/design-language.md`).
- `palette` (optional): `{"page": "#hex", "ink": "#hex", "accent": "#hex", "series": ["#hex", …]}` sets the view's whole stage from its subject: `page` is the background, `ink` the text, and aurora derives every surface and line from them; the screen, charts and designs all follow it. Read `references/design-language.md` before choosing.
- `immersive: true` (view) makes one designed page: full-screen opening, edge-to-edge sections. Sections can then take `height: "screen"`, `background` (`page`, `surface`, `ink`, `accent`) and `layout: "reel"` (panels sliding sideways); see `references/story.md`.
- `layout: "grid"` places items on 12 columns with `span`. `layout: "tabs"` shows each item as a tab named by its `title`.
- `layout: "story"` is a guided explanation, the best way to explain a process: the **first item stays pinned** (a design, a chart, a diagram) while the other items scroll past as steps. Each step can carry `"story": {"focus": "compression", "state": {"phase": 1}}`: when it reaches the middle of the screen, `focus` lights that value up across the view and `state` reaches a design as `aurora.story.state` (kit: `useStory()`). Write each step as two or three sentences about one moment; let the visual show it. Between steps the design hears a continuous position (kit `useScroll`), so the scene moves with the scroll.
- A section may start with `"items": []`; you fill it with patches.
- `c.type` picks the component. All other fields of `c` belong to that component.

## Patch ops

A patch is a list of ops. They apply together or not at all, and a bad op names itself in `problems`.

| op | shape |
|---|---|
| `add` | `{"op":"add","section":"<sectionId>","item":{…},"after"?:"<itemId>"}` |
| `update` | `{"op":"update","id":"<itemId>","item":{"span"?,"title"?,"c"?:{fields to merge}}}` |
| `replace` | `{"op":"replace","id":"<itemId>","item":{…a whole new item}}` |
| `remove` | `{"op":"remove","id":"<itemId>"}` |
| `move` | `{"op":"move","id":"<itemId>","section":"<sectionId>","after"?:"<itemId>"}` |
| `editFile` | `{"op":"editFile","id":"<designId>","path":"App.tsx","edits":[{"find":"…","replace":"…"}]}` (each `find` occurs exactly once) or `"content":"…"` to replace or create the file |
| `deleteFile` | `{"op":"deleteFile","id":"<designId>","path":"Old.tsx"}` |
| `set` | `{"op":"set","title"?,"summary"?}` |
| `addSection` | `{"op":"addSection","section":{…},"after"?:"<sectionId>"}` |
| `removeSection` | `{"op":"removeSection","id":"<sectionId>"}` |
| `moveSection` | `{"op":"moveSection","id":"<sectionId>","after"?:"<sectionId>"}` |
| `addQuery`, `addDataset`, `addParam`, `removeParam` | see `references/data.md` |

**To add at the end, leave `after` out.** `"after": "<id>"` places it right after that item or section, and `"after": null` puts it **first**. If a result says `"rebased": true`, the person picked an older version on screen; call `status` to see what is current.

## Art direction, in brief

Each view gets its own look; the full method is in `references/design-language.md`. These matter most:

1. **Decide a direction from the subject** before building: its world, a mood in two or three words, a genre to borrow from, the stage colours, the type and the motion personality. Don't repeat the example's look or your last view's.
2. **Set the stage with the `palette`** (`page`, `ink`, `accent`, `series`) and the type with `fonts` (any Google Fonts families), drawn from the subject. A dark stage for cinema, a light one for editorial calm, a tint for a place of its own.
3. **Use the tokens, never raw colours.** In a design, `bg-page`, `text-ink`, `text-ink-2`, `text-muted`, `ring-hair`, `bg-accent`, `var(--s1)`… carry the palette and follow the theme. No `slate-*`, `gray-*`, `white`, `black`, hex or `dark:`.
4. **Contrast in scale.** One enormous headline or number, the main visual full screen or edge to edge, then quiet body text. Never a small visual boxed in a card among small boxes.
5. **Direct the motion.** Tie it to what the reader does (scrolling a story, dragging a value); one thing leads, the rest follow; match the personality you chose. Continuous animation only for a mechanism or a living scene.
6. **Colour means something**, and keeps that meaning everywhere in the view.
7. **Label on the drawing**, never with a legend to decode.
8. **Nothing moves over text.**
9. **Physical things are 3D** (`aurora/kit`), never rectangles in rows.
10. **No fixed height** on a design card, and it works on a phone.
11. **Real content**, specific and believable.

## Problems

Every result carries `problems`: `{itemId?, severity, message, hint?}`.
- `error`: the item failed. Read the message (design errors include `file:line:col`), fix it with `editFile`, `update` or `replace`, and check `status` again.
- `warning`: it rendered, but something needs attention: a missing media file, or a design check (`design: text overflows…`, `design: the drawing is flat…`, `design: a 3D scene is shown in a card…`). Fix design warnings the way the message says.
- `unverified`: no screen has drawn and checked it yet. Not a failure; for a `design`, check `status` again in a few seconds.

## Without the MCP tools

The same operations work over HTTP: `POST localhost:4317/api/views {view}`, `POST /api/views/<id>/patch {ops, baseVersion}`, `GET /api/views/<id>/status`, and `POST /api/views/<id>/look {sizes?, section?}`, which saves the pictures and returns their file paths with a caption each: open them to look. Or append JSON lines to `<project>/.aurora/views/<name>.ndjson`: the first line is a view, each later line is `{"ops": [...], "baseVersion": N}`. aurora writes problems to `<name>.problems.json` next to it after every line. The folder is watched only when aurora's MCP server runs in that project, or after `aurora watch <project>`.

## Before you finish

Go through every line. Fix what fails, then check `status` once more.

- [ ] `status` shows no `error` and no `design:` warning.
- [ ] You looked at the latest version with `look` (desktop and phone) and fixed what you saw: nothing cut off, overlapping, too small or spilling sideways on a phone.
- [ ] The story has a hook on the first screen, one idea per beat, a signature moment and an ending that lands the one sentence; it answers who, what, when, where, why and how without naming them.
- [ ] The look was chosen for this subject: a `palette` (stage, accent, series), type and motion that fit it, and it doesn't copy the example's or the last view's look.
- [ ] A physical mechanism is a 3D `aurora/kit` scene pinned in a `story` section with steps that drive it (or a `hero`), not a flat drawing in a card, and the view has a `palette` from its subject.
- [ ] Every item uses the component the table above suggests; a `design` is used only where no catalog component fits.
- [ ] Designs use only token colors (`bg-surface`, `text-ink-2`, `var(--s1)`…): no `slate`, `gray`, `white`, `black`, hex or `dark:`.
- [ ] Nothing animated or absolutely positioned overlaps text.
- [ ] Every part of a drawing is labelled where it is.
- [ ] An explainer has play/pause, next step and speed controls, a current-step card and live readouts.
- [ ] No `height` on a design card.
- [ ] `steps` marks `done`/`current` only when it tracks real progress; an explanation leaves `status` out.
- [ ] Wording is specific and plain; numbers that come from data come from queries.
