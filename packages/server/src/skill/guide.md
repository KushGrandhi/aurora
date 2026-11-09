# aurora: show it on a screen

aurora is a local screen (http://localhost:4317). You send it a **view** (JSON). It draws the view, animates it, keeps every version and tells you what broke. Use it whenever seeing beats reading: data, how something works, how a system is built, a page or product idea.

This file is the whole method. The files under `references/` and `examples/` hold detail; each section below says when to open one.

## The loop

Follow these steps in order, every time.

1. **Choose the form, then its look.** Ask what the reader will do with this (`references/forms.md`): get an answer, understand a finding, watch, explore, compare, try what-ifs, look things up, be persuaded. For a story or an explainer, outline it with `references/story.md`. Then decide its look with `references/design-language.md`. Never default to the look of the last view or the example.
2. **Build it as a page.** Beyond a one-number answer, the view is one whole-page `design` that reads your queries and owns its layout, type, surface and interactions (**Build a page** below). Catalog components are for a quick answer or a quick look.
3. **Render** the frame with `mcp__aurora__render`: title, one-line summary and sections (with the first item, or with `"items": []`).
4. **Add** the remaining items with `mcp__aurora__patch`, **one call at a time**. Each call passes `baseVersion` = the `version` the previous call returned. Two patches sent together collide.
5. **Check** with `mcp__aurora__status`. Fix every `error` with a patch, then check again.
6. **Look** at it with `mcp__aurora__look`: pictures of the view as a person sees it. Is what the reader needs on the first screen? Anything overlapping, cut off, too small, hard to read or empty? Fix and look again (two or three rounds). Add `"sizes": ["desktop", "phone"]` once, before you finish, to check the phone layout; pass `"section"` to look at just one part.
7. **Review** your work against **Before you finish** at the end of this file.
8. **Tell** the user the URL in one line. Don't repeat the content in the terminal.

`unverified` in a result means no screen has drawn and checked the item yet. A `design` stays `unverified` for a few seconds after it draws, while aurora runs its design checks: call `status` again after about 3 seconds and fix any `design:` warning. If it is still `unverified` after that, no screen is open: `look` still works (it draws the view itself), so use it to check your work, and give the URL to the user.

## Build a page (the default)

Generic tiles, default charts and tables in boxes look machine-made. A page you design doesn't. Open `examples/inspector.md` and copy how it works:

- **The view:** your `datasets`, `queries` and `params` as usual, then one section holding one `design` with `"display": "page"` and `"data": [the queries it reads]`.
- **Numbers from the queries:** in `App.tsx`, `useQuery("name")` gives a query's rows and updates when params change. Never type a figure from the data.
- **The reader acts:** make what they change a param (the picked case, a cutoff, a scenario) and `const [v, setV] = useParamState("name")`: setting it re-runs the queries that read it. Give the job the controls it needs: pick a case, drag a value, switch views. A page with nothing to change is a poster.
- **Parts:** `aurora/kit` has `Picker` (a rail, a select on a phone), `Bars` (with a threshold line), `SearchTable`, `Tabs`, `fmt` and `Surface`; draw anything else with SVG or d3.
- **A surface, not a flat page:** `<Surface kind="contour" />` behind content (`grain`, `paper`, `blueprint`, `dots`, `contour`, `halftone`, `thermal`, `clouds`, `iridescent`), coloured from the palette; add `scrim` when text sits on it. A section can take one too: `"surface": "blueprint"`.
- **Phone:** rails become selects, grids use `md:`, nothing spills sideways.

## Catalog components (a quick answer or a quick look)

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

Before using a component for the first time, read its fields and example in `references/components.md`.

**Examples.** Before a story or a `design`, open the closest one (and, for a design, `references/design-canvas.md` and `references/kit.md`). Copy how it works, never its look: each chose a different one on purpose.
- `examples/inspector.md`: **start here for data.** One case through its steps, a cutoff to drag, a searchable list.
- `examples/data-story.md`: a story from data, catalog parts only. `examples/monitor.md`: a monitor, exception first. `examples/tool.md`: a what-if with inputs in the sentence.
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
- The screen reads like an article: the view `title` and `summary` are the page headline (on a hero they sit on the stage), and each section `title` is a large heading. Write headlines that say the point ("East leads, barely"), not labels ("Data").
- **Everything is linked.** Pointing at a value anywhere (a bar, a row, a part in a design) lights it up in every item. Use the same names across items (the chart's category, the table's column, the design's part) and in prose.
- `fonts` (optional): `{"display": "Fraunces", "body": "Inter", "mono": "JetBrains Mono"}`, any Google Fonts families by exact name, for the headline and headings, the prose and the code, on the screen and in designs. Choose them with the look (`references/design-language.md`).
- `palette` (optional): `{"page": "#hex", "ink": "#hex", "accent": "#hex", "series": ["#hex", …]}` sets the whole stage from its subject (`page` background, `ink` text); everything follows it. See `references/design-language.md`.
- `immersive: true` (view) makes one designed page: full-screen opening, edge-to-edge sections. Sections can then take `height: "screen"`, `background` (`page`, `surface`, `ink`, `accent`) and `layout: "reel"` (panels sliding sideways); see `references/story.md`.
- `layout: "grid"` places items on 12 columns with `span`. `layout: "tabs"` shows each item as a tab named by its `title`.
- `layout: "story"` is a guided explanation, the best way to explain a process: the **first item stays pinned** (a design, a chart, a diagram) while the other items scroll past as steps. Each step can carry `"story": {"focus": "compression", "state": {"phase": 1}}`: when it reaches the middle of the screen, `focus` lights that value up across the view and `state` reaches a design as `aurora.story.state` (kit: `useStory()`). Steps are two or three sentences; between them the design hears a continuous position (kit `useScroll`).
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

1. **Decide a direction from the subject** before building: its world, a mood, a genre to borrow from, colours, type, motion. Don't repeat the example's look or your last view's.
2. **Set the stage with the `palette` and `fonts`** (any Google Fonts families), drawn from the subject, and a surface that fits it.
3. **Colours come from the palette.** In a design, `bg-page`, `text-ink`, `text-muted`, `ring-hair`, `bg-accent`, `var(--s1)`… follow it and the theme. Raw colours only when the view sets `palette.page` (the stage is then fixed); never `dark:`.
4. **Contrast in scale.** One enormous headline or number, the main visual full screen or edge to edge, then quiet body text. Never a small visual boxed in a card among small boxes.
5. **Direct the motion.** Tie it to what the reader does; one thing leads. Continuous animation only for a mechanism or a living scene.
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
- [ ] The form fits the reader's job (`references/forms.md`); a story has a hook, one idea per beat, a signature moment and an ending.
- [ ] The look was chosen for this subject: a `palette` (stage, accent, series), type and motion that fit it, and it doesn't copy the example's or the last view's look.
- [ ] A physical mechanism is a 3D `aurora/kit` scene pinned in a `story` section with steps that drive it (or a `hero`), not a flat drawing in a card, and the view has a `palette` from its subject.
- [ ] Beyond a one-number answer, the view is a page `design` that reads the queries, with a surface and controls the job needs.
- [ ] Raw colours only if the view sets `palette.page`; otherwise tokens.
- [ ] Nothing animated or absolutely positioned overlaps text.
- [ ] Every part of a drawing is labelled where it is.
- [ ] An explainer has play/pause, next step and speed controls, a current-step card and live readouts.
- [ ] No `height` on a design card.
- [ ] `steps` marks `done`/`current` only when it tracks real progress; an explanation leaves `status` out.
- [ ] Wording is specific and plain; numbers that come from data come from queries.
