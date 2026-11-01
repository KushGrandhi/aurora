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

- **Libraries**, bundled and offline: `react`, `react-dom`, `motion` / `motion/react`, `lucide-react`, `three`, `d3`, `gsap`. Nothing else can be imported: no `@/` paths, no other npm packages.
- **Tailwind** (v4) with aurora's tokens: `bg-surface`, `text-ink-2`, `ring-hair`, `bg-accent`, `fill-s1`… and CSS variables `var(--accent)` etc. The Inter font is loaded.
- **No network.** `fetch`, external images, fonts and CDNs are blocked and come back as problems. Draw visuals with SVG, CSS and icons.
- **Data:** `"data": ["queryName"]` puts that query's rows in `window.aurora.data.queryName`; `window.aurora.onData(cb)` fires when filters change them.
- **Local media:** `"assets": {"logo": "/abs/path/logo.png"}`, then `window.aurora.asset("logo")` gives the URL.
- **Theme:** `window.aurora.theme` is `"light"` or `"dark"` and `onTheme(cb)` reports changes. You rarely need these: the tokens already switch.
- **Clicks back to you:** `window.aurora.send("chose", { plan: "pro" })`; read them with `mcp__aurora__events` (`after` = the last seq you saw, `waitMs` up to 60000 to wait).

## Build it in steps

1. **Start from the closest example** (`examples/explainer.md` or `examples/landing.md`). Keep its structure, layout and controls, and change the content.
2. **Split by role:** `model.ts` (the state and its math), `Drawing.tsx` (the SVG), `App.tsx` (layout and controls). Keep each file under about 200 lines.
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

## Problems you may see

- `design: <file>:<line>:<col> …`: a compile error. Fix that line with `editFile`.
- `design: <message>`: a runtime error, often reading `undefined`. Look for an index or value out of range.
- `blocked network request to …`: something tried to load from the internet. Remove it.
- `did not finish loading`: an infinite loop or a promise that never settles.
