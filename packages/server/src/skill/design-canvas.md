# The design canvas

A `design` item is a small React + Tailwind (or plain HTML/JS) project that runs in a sandbox on the screen. Use it for anything the catalog components can't show: mechanisms, simulations, games, landing pages, product mockups. The design language (`references/design-language.md`) says how it should look; this file says how it works.

## Shape

```json
{ "id": "engine", "span": 12, "c": { "type": "design", "framework": "react",
  "files": { "App.tsx": "…", "Engine.tsx": "…", "model.ts": "…" } } }
```

- `App.tsx` default-exports the root component. Other files import each other with relative paths: `import Engine from "./Engine"`. `.css`, `.json` and `.svg` files can be imported too.
- `framework: "html"` runs `index.html` instead (with `<script type="module" src="./main.js">`). `custom` is one HTML document in a single field: fine for something tiny.
- `display: "page"`: when the design is the view's **only** item, it fills the whole screen like a real website. Use it for landing pages and apps.
- Leave out `height`: the card grows and shrinks with the content. Set it only for a fixed stage, such as a full-bleed canvas or 3D scene.

## What's available

- **Libraries**, bundled and offline: `react`, `react-dom`, `motion` / `motion/react`, `lucide-react`, `three`, `@react-three/fiber`, `@react-three/drei`, `d3`, `gsap`, and **`aurora/kit`** (aurora's own building blocks: 3D scenes, materials, labels, panels, controls; see `references/kit.md`). Nothing else can be imported: no `@/` paths, no other npm packages.
- **Tailwind** (v4) with aurora's tokens: `bg-surface`, `text-ink-2`, `ring-hair`, `bg-accent`, `fill-s1`… and CSS variables `var(--accent)` etc. Hanken Grotesk is the font (`font-sans`), with Newsreader as `font-serif`; a view's `palette` sets `--accent` and `--s1…`.
- **No network.** `fetch`, external images, fonts, 3D models and CDNs are blocked and come back as problems. Build visuals yourself: physical things as 3D scenes from `aurora/kit` and three.js shapes, abstract diagrams as SVG.
- **Data:** `"data": ["queryName"]` puts that query's rows in `window.aurora.data.queryName`; `window.aurora.onData(cb)` fires when filters change them.
- **Local media:** `"assets": {"logo": "/abs/path/logo.png"}`, then `window.aurora.asset("logo")` gives the URL.
- **Theme:** `window.aurora.theme` is `"light"` or `"dark"` and `onTheme(cb)` reports changes. You rarely need these: the tokens already switch.
- **Story and params:** in a `story` section the pinned design gets `aurora.story` (`{ index, state }` of the step being read; `aurora.onStory(cb)`), and every design gets the view's param values as `aurora.params` (`aurora.onParams(cb)`).
- **Linked focus:** `window.aurora.focus` is what the reader is pointing at anywhere on the view (a region in a chart, a table row, a word in prose); `aurora.onFocus(cb)` hears changes and `aurora.setFocus("West")` / `setFocus(null)` points and lets go. Charts dim the rest, tables mark the row, prose highlights the word. In a kit scene use `useFocus()`. Focus by the same values your data uses (the region name, the part name) so everything lines up.
- **Clicks back to you:** `window.aurora.send("chose", { plan: "pro" })`; read them with `mcp__aurora__events` (`after` = the last seq you saw, `waitMs` up to 60000 to wait).

## Build it in steps

1. **Start from the closest example** (`examples/mechanism.md` for anything physical, `examples/landing.md` for a page, `examples/explainer.md` for an abstract process). Keep how it works (the model, the story hooks, the controls), then give it the look you chose for this subject: its palette, type, composition and motion.
2. **Split by role:** `model.ts` (the state and its math), `Engine.tsx` or `Drawing.tsx` (the 3D scene or the SVG), `App.tsx` (stage, panels and controls). Keep each file under about 200 lines.
3. **Render a working version first**, then improve it with `editFile`. Never resend every file to change a few lines.
4. After each change, call `mcp__aurora__status`. Problems come with `file:line:col`.

## Iterate

```json
{ "op": "editFile", "id": "engine", "path": "Engine.tsx", "edits": [{ "find": "r={2.2}", "replace": "r={3}" }] }
```

- Each `find` must occur **exactly once** in the file: include enough surrounding text to make it unique.
- `"content": "…"` replaces a whole file or creates a new one. `deleteFile` removes one.
- To offer choices, use `mcp__aurora__variants` with 2 or 3 `{label, ops}`; they show side by side. Then call `mcp__aurora__events` with `waitMs` and wait for the `aurora:variant-picked` event.

## Known mistakes

| Mistake | What happens | Do this |
|---|---|---|
| Animation loop uses `now - last` directly | The first frame can be negative, the state goes out of range and something reads `undefined` | `const dt = Math.max(0, Math.min(0.05, (now - last) / 1000))` |
| State wraps with `x % n` | A negative number stays negative | `((x % n) + n) % n` |
| `STAGES[i]` with a computed `i` | Crash when `i` is -1 or n | Clamp: `Math.max(0, Math.min(n - 1, i))` |
| Setting `height` on the card | Content is cut off or leaves empty space | Leave it out |
| Labels placed where things move | Moving parts cover the text | Labels outside the drawing with leader lines |
| Raw colors and `dark:` | Half the design is wrong in one theme | Tokens only |
| `Math.random()` in render | Positions jump on every frame | Precompute a fixed array |
| Importing an unlisted package or an image URL | Compile error or blocked request | Use the listed libraries; draw it |
| One giant file | Hard to fix with `editFile`, and easy to break JSON escaping | Several small files |
| A static drawing for something that moves | The reader can't see cause and effect | Animate it, with play/pause and step controls |
| A physical thing drawn as SVG rectangles | Warning `the drawing is flat boxes and lines`; it looks like a wireframe | Build it in 3D: `Scene` with `Metal`, `Glass`, `Glow` (copy `examples/mechanism.md`) |
| A 3D scene in a normal card | Warning `a 3D scene is shown in a card`; it looks small and boxed | `display: "hero"` (first item, sections below) or `"page"` (only item) |
| A row of fixed-width buttons or long labels | Warning `text overflows its box`; text spills out | `flex flex-wrap`, `min-w-0`, shorter labels |
| Many small stat boxes | Warning `many small boxed panels`; the page looks like a form | One `Panel` with a few readouts; let the main visual carry the page |
| drei helpers that download (`Environment preset`, `Text`/`Text3D` fonts, `useGLTF(url)`, HDR skies) | Blocked network request | `Scene` already has lighting; build shapes from three.js geometry; put text in panels or `Label` |
| Motion set from `clock.t` inside 3D | Movement stutters at 20 steps a second | Move meshes in `useFrame` from `clock.ref.current`; use `clock.t` for text and colours |

## Problems you may see

- `design: …` **warnings** are aurora's design checks, measured on the drawn page: `text overflows its box`, `a 3D scene is shown in a card`, `the drawing is flat boxes and lines`, `many small boxed panels`. The design still rendered; fix it as the warning says and check `status` again.

- `design: <file>:<line>:<col> …`: a compile error. Fix that line with `editFile`.
- `design: <message>`: a runtime error, often reading `undefined`. Look for an index or value out of range.
- `blocked network request to …`: something tried to load from the internet. Remove it.
- `did not finish loading`: an infinite loop or a promise that never settles.
