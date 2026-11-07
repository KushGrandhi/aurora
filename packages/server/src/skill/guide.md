# aurora: show it on a screen

aurora is a local screen (http://localhost:4317). You send it a **view** (JSON). It draws the view, animates it, keeps every version and tells you what broke. Use it whenever seeing beats reading: data, how something works, how a system is built, a page or product idea.

This file is the whole method. The files under `references/` and `examples/` hold detail; each section below says when to open one.

## The loop

Follow these steps in order, every time.

1. **Pick** the components with the table below. Catalog components look polished with little effort; use a `design` only for what they can't show.
2. **Render** the frame with `mcp__aurora__render`: title, one-line summary and sections (with the first item, or with `"items": []`).
3. **Add** the remaining items with `mcp__aurora__patch`, **one call at a time**. Each call passes `baseVersion` = the `version` the previous call returned. Two patches sent together collide.
4. **Check** with `mcp__aurora__status`. Fix every `error` with a patch, then check again.
5. **Review** your work against **Before you finish** at the end of this file. You cannot see the screen, so this checklist is your eyes.
6. **Tell** the user the URL in one line. Don't repeat the content in the terminal.

`unverified` in a result means no screen has drawn the item yet. It is not an error: give the URL to the user and stop.

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
| **how something physical works: an engine, a heart, a machine, the solar system** | `design`: a 3D scene built with `aurora/kit`, `display: "hero"` (copy `examples/mechanism.md`) | 12 |
| **a landing page or product mockup** | `design` with `display: "page"` (copy `examples/landing.md`) | 12 |
| **an abstract process with no physical shape (an algorithm, a protocol), a simulation, a game** | `design` | 12 |

Good combinations:
- **Explain how something physical works:** the mechanism first, as a 3D `aurora/kit` scene with `display: "hero"`, then `steps` (span 7) and a `callout` (span 5) side by side below it.
- **Explain a system:** `architecture`, then a `diagram` for its main request, then a `callout` for the key decision.
- **Analyse data:** a row of `kpi`, then a `chart`, then a `table`; add filters when the reader will want to slice it.
- **A page or product:** one `design` with `display: "page"`, as the only item in the view.

Before using a component for the first time, read its fields and example in `references/components.md`.

**Before writing any `design`:** read `references/design-canvas.md`, `references/design-language.md` and `references/kit.md`, then open the closest example and copy its structure:
- `examples/mechanism.md`: **start here for anything physical.** A 3D V8 engine built from `aurora/kit`: glass cylinders, glowing gas, labels, floating panels and controls, shown as a hero.
- `examples/explainer.md`: a 2D interactive drawing with play, step and speed controls, for a process that has no physical shape.
- `examples/landing.md`: a full landing page with nav, hero, proof, features, how it works, pricing, FAQ and a closing call to action.

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
- `layout: "grid"` places items on 12 columns with `span`. `layout: "tabs"` shows each item as a tab named by its `title`.
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

## Design language, in brief

aurora's screen is calm, warm-neutral and precise. Everything you build should look like part of it. The full rules and recipes are in `references/design-language.md`. These ones matter most:

1. **Use the tokens, never raw colors.** Inside a design, use `bg-page`, `bg-surface`, `bg-raised`, `text-ink`, `text-ink-2`, `text-muted`, `ring-hair`, `bg-accent`, and `var(--s1)` to `var(--s8)` for categories. They switch to dark mode by themselves. Don't write `slate-*`, `gray-*`, `white`, `black` or hex values, and don't write `dark:` variants.
2. **Color means something.** `accent` marks the action, `s1` to `s8` mark categories in that order, and `good`/`bad`/`warn` mark state. Everything else is neutral.
3. **Label on the drawing.** Put names next to the parts, with a thin leader line if needed. Don't use a separate legend.
4. **Nothing moves over text.** Moving things travel in their own lanes, at least 8px clear of every label.
5. **An explainer is interactive.** Give it play/pause, next step and speed controls, a card for the current step, and readouts of what is true right now.
6. **One type scale.** `text-4xl`/`text-6xl font-semibold tracking-tight` for the headline, `text-xl font-semibold` for headings, `text-sm text-ink-2 leading-relaxed` for body, and `text-xs uppercase tracking-wider text-muted` for small labels.
7. **Generous space.** Cards are `rounded-2xl bg-surface p-6 ring-1 ring-hair shadow-card`, gaps are `gap-4` or `gap-6`, and page sections are `py-20`.
8. **Motion explains.** Things enter with a fade and an 8px rise over 0.3 to 0.5 s; state changes take 0.2 s. Continuous animation is only for showing a mechanism.
9. **No fixed height.** A design card grows and shrinks with its content. Leave out `height`.
10. **Real content.** Use specific, believable words and numbers. No lorem ipsum and no empty image boxes.
11. **Depth, not boxes.** A physical thing is a 3D scene built with `aurora/kit` (metal, glass, glow, light and shadow), never rectangles in rows. The scene carries the page; readouts live in at most three floating panels.

## Problems

Every result carries `problems`: `{itemId?, severity, message, hint?}`.
- `error`: the item failed. Read the message (design errors include `file:line:col`), fix it with `editFile`, `update` or `replace`, and check `status` again.
- `warning`: it rendered, but something needs attention: a missing media file, or a design check (`design: text overflows…`, `design: the drawing is flat…`, `design: a 3D scene is shown in a card…`). Fix design warnings the way the message says.
- `unverified`: no screen has drawn it yet. Not a failure.

## Without the MCP tools

The same operations work over HTTP: `POST localhost:4317/api/views {view}`, `POST /api/views/<id>/patch {ops, baseVersion}`, `GET /api/views/<id>/status`. Or append JSON lines to `<project>/.aurora/views/<name>.ndjson`: the first line is a view, each later line is `{"ops": [...], "baseVersion": N}`. aurora writes problems to `<name>.problems.json` next to it after every line. The folder is watched only when aurora's MCP server runs in that project, or after `aurora watch <project>`.

## Before you finish

Go through every line. Fix what fails, then check `status` once more.

- [ ] `status` shows no `error` and no `design:` warning.
- [ ] A physical mechanism is a 3D `aurora/kit` scene shown with `display: "hero"` or `"page"`, not a flat drawing in a card.
- [ ] Every item uses the component the table above suggests; a `design` is used only where no catalog component fits.
- [ ] Designs use only token colors (`bg-surface`, `text-ink-2`, `var(--s1)`…): no `slate`, `gray`, `white`, `black`, hex or `dark:`.
- [ ] Nothing animated or absolutely positioned overlaps text.
- [ ] Every part of a drawing is labelled where it is.
- [ ] A drawing fills its card: the SVG `viewBox` width is close to the width it shows at, so 12px labels stay 12px.
- [ ] Segment and button labels fit; button rows use `flex-wrap`.
- [ ] An explainer has play/pause, next step and speed controls, a current-step card and live readouts.
- [ ] Layout works on a phone: grids use `md:grid-cols-*`, rows use `flex-wrap`, and SVGs use `viewBox` with `className="w-full h-auto"`.
- [ ] No `height` on a design card.
- [ ] `steps` marks `done`/`current` only when it tracks real progress; an explanation leaves `status` out.
- [ ] Wording is specific and plain; numbers that come from data come from queries.
