# genui Plan 2c — Design Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The calling LLM can build anything on the genui screen: whole websites, interactive pages, animations, games, 3D scenes, mockups. It writes HTML, or React plus Tailwind, as a multi-file project that runs in a sandbox with a generous bundled library set. It can show it full screen, iterate cheaply with file edits, offer 2–3 alternatives side by side for the person to pick, and receive what the person clicks back as events.

**Architecture:**
- **New components.** Two components, `design` (a multi-file project) and `custom` (one HTML file), run in a sandboxed iframe (`allow-scripts`, opaque origin, CSP with no network).
- **Compiling.** The screen compiles the project in the parent: Sucrase transpiles the files and es-module-lexer finds their imports.
- **Inside the frame.** A small runtime served from genui's `/lib/` links the modules through blob URLs. Bare imports resolve to locally bundled libraries through an import map.
- **Bridge.** A `window.genui` bridge carries data, theme, height, errors and `send()` events across postMessage.
- **Server.** The server gains `/lib/*`, a per-view event log (long-pollable, so an LLM can wait for the person's choice) and variants: pending alternatives that are not versions until one is picked.

**Tech Stack:**
- Plan 2b stack, plus `sucrase` 3.35, `es-module-lexer` 1.x and `@tailwindcss/browser` 4.x.
- Bundled for the sandbox: `react`/`react-dom` 18, `motion`, `lucide-react`, `three` 0.18x, `d3` 7, `gsap` 3.
- Fonts: `@fontsource-variable/inter`.

**Spec:** `docs/specs/2026-10-31-genui-canvas-design.md`: §7 (design canvas), D8, D11 (pick and variants), §4.4 (render-time problems) and §10 (sandbox security). Built on branch `plan-2b`; this plan works on `plan-2c`.

**Kush's direction (2026-10-31):** "in a dynamic UI the LLM should get the freedom to make websites or anything to showcase anything it wants with freedom. It should be like unlocking another dimension." That drives three calls beyond the spec's letter: full-screen **page** display, a generous bundled library set, and `genui.send()` events back to the caller.

## Global Constraints

- The calling LLM composes; genui validates, renders, animates and reports problems (D1).
- Design canvas: HTML/CSS/JS or React + Tailwind, transpiled in the browser, run in a sandbox, libraries bundled locally (works offline). Every iteration is a saved version; variants side by side (D8).
- Sandboxed frames for `design`/`custom`: no network and no access to the parent page (§10). The frame is `sandbox="allow-scripts allow-forms"` and **never** `allow-same-origin`. Its CSP allows scripts only inline, `blob:` and `<origin>/lib/`; images and video only from `<origin>/media/`, `data:` and `blob:`; `connect-src 'none'`; `form-action 'none'`.
- No CDN: every library, font and runtime file is served by genui from `/lib/*` (D8).
- Picking a variant or an older version on screen makes it the current version; history is linear and nothing is lost (D11).
- Runtime and console errors from inside the frame reach the caller as render-time problems; a failing design never breaks the rest of the view (§4.4, §7).
- Media is displayed, not generated: designs show local files only through media token URLs (D6, §8).
- Engines stay behind adapters (D5): the sandbox runtime and compiler live under `packages/renderer/src/design/` and nothing outside imports their internals.
- Motion follows Plan 2a springs; reduced motion gives fades.

## Review Focus

1. **A design that never finishes** (an infinite loop or a hung promise in the entry): after 8 s without `ready` the item reports `design: did not finish loading`, and the rest of the screen still works. → Task 5 e2e `stuck design reports a problem`.
2. **A design reaching for the network** (`fetch("https://…")`, `<img src="https://…">`): the request is blocked and the page still renders. The caller gets a problem naming the blocked URL and the fix (bundle the data with `genui.data` or `assets`). → Task 5 e2e `network is blocked and reported`.
3. **Escape attempts** (`window.top.location = …`, `parent.document`, `localStorage`): the screen is unaffected and storage works in memory, so ordinary sites don't crash. → Task 5 e2e `the frame cannot touch the screen`.
4. **A file edit whose `find` text appears 0 or 2+ times:** the whole patch is rejected atomically with a message naming the file and the count. → Task 1 test `editFile find must match exactly once`.
5. **A page flooding `genui.send()`** (thousands per second, or huge payloads): the frame drops sends over 20/s, the server rejects payloads over 16 KB, and the event log keeps the last 500. → Task 2 test `event log limits` and Task 5 e2e `send is rate-limited`.

---

## File Structure

```
packages/spec/src/
  components/design.ts        design + custom defs (schema, check, media, doc)
  ops.ts                      + editFile, deleteFile
  events.ts                   + ViewEvent variants; ScreenMessage event, pickVariant; GenuiEvent
packages/server/src/
  events.ts                   EventLog (ring buffer, long-poll waiters)
  variants.ts                 buildVariants(): apply + validate alternatives
  intake.ts                   + events, variants, pickVariant
  server.ts                   + /lib/*, /api/views/:id/events, /api/views/:id/variants
  mcp.ts                      + tools `events`, `variants`
  skillGuide.md               + design canvas section
packages/renderer/
  vite.sandbox.config.ts      builds dist/lib/* (vendor ESM entries, runtime, tailwind, fonts)
  sandbox/                    entry files for the vendor build + frameRuntime.ts
  src/design/compile.ts       compileProject(): transpile + resolve imports (pure)
  src/design/srcdoc.ts        buildSrcdoc(): CSP, import map, project JSON (pure)
  src/design/bridge.ts        parent side of postMessage
  src/components/Design.tsx   design + custom renderer (iframe, viewport switcher, fullscreen)
  src/components/PageView.tsx full-bleed page display
  src/components/Variants.tsx side-by-side variants / version compare
```

---

### Task 1: Spec: design and custom components, file ops, events

**Files:**
- Create: `packages/spec/src/components/design.ts`
- Modify: `packages/spec/src/components/index.ts`, `packages/spec/src/ops.ts`, `packages/spec/src/events.ts`
- Test: `packages/spec/test/design.test.ts`

**Interfaces:**
- Produces:
  - `design` schema:
    ```
    { type: "design";
      framework: "react" | "html";
      files: Record<string, string>;     // path → content; 1..100 files, ≤ 2 MB total
      entry?: string;                    // default "App.tsx" (react) or "index.html" (html)
      viewport?: "desktop" | "tablet" | "phone";
      display?: "card" | "page";         // page = full screen when it's the view's only item
      height?: number;                   // card height in px; omitted = fit content (200..2400)
      data?: Id[];                       // query ids → window.genui.data[id] (rows)
      assets?: Record<string, string> }  // name → absolute path or URL → genui.asset(name)
    ```
    - Paths match `^[\w./-]+$` and contain no `..`.
    - Extensions are tsx, ts, jsx, js, css, json, html, svg or md.
    - `check`: the entry exists; limits; `data` ids are listed. `dataBound` → `data`. `media` → `Object.values(assets)`.
  - `custom` schema: `{ type: "custom"; html: string (1..500 KB); height?; display?; data?: Id[]; assets? }`. It is the same runtime with `files: {"index.html": html}`, framework html.
  - Ops:
    - `{op:"editFile", id, path, content}`: create or replace a file.
    - `{op:"editFile", id, path, edits: {find: string; replace: string}[]}`: each `find` must occur exactly once in the current file. Edits apply in order.
    - `{op:"deleteFile", id, path}`: deleting the entry is rejected.
    - All three target a `design` item (on `custom`, `editFile` path `index.html` edits `html`). They are atomic like the other ops, and the item id goes into `changed`.
  - Events:
    - `GenuiEvent = { seq: number; at: string; itemId?: string; name: string; payload: unknown }`.
    - `ScreenMessage` adds `{t:"event", viewId, itemId, name, payload}` and `{t:"pickVariant", viewId, index}`.
    - `ViewEvent` adds `{t:"variants", viewId, baseVersion, variants: {label: string; view: View}[]}`. An empty list means none are pending.
- [ ] **Step 1: Write failing tests**:
  - `design example validates and renders nothing from data`: the doc example (a small React landing page using Tailwind, motion and lucide) passes the schema and `check`.
  - `design check catches missing entry and bad paths`: no `App.tsx` → message contains `App.tsx`; path `../x.js` → rejected; 101 files → message contains `100`.
  - `custom wraps one html file`.
  - `editFile find must match exactly once`:
    - Zero matches → problem containing `App.tsx` and `0 times`.
    - Two matches → `2 times`.
    - Either way the view is unchanged.
  - `editFile content replaces, edits apply in order, deleteFile removes, deleting the entry is rejected`.
  - `media returns asset paths`.
- [ ] **Step 2: Run** `npx vitest run packages/spec` → FAIL.
- [ ] **Step 3: Implement.**
  - The doc guidance is where Kush's direction lives. It says this is the component for anything beyond the catalog: websites, landing pages, interactive explainers, games, 3D, mockups.
  - It lists the importable libraries and the `genui` bridge API (Task 5), and covers `display: "page"`, editing with `editFile` edits rather than resending files, and using `variants` to offer options.
- [ ] **Step 4: Run** `npx vitest run` → all PASS.
- [ ] **Step 5: Commit** `feat(spec): design canvas components and file ops`.

---

### Task 2: Server: /lib, event log, variants

**Files:**
- Create: `packages/server/src/events.ts`, `packages/server/src/variants.ts`
- Modify: `packages/server/src/{intake,server,mcp}.ts`
- Test: `packages/server/test/events.test.ts`, `packages/server/test/variants.test.ts`, `packages/server/test/api.test.ts` (add)

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  - `class EventLog`:
    - `add(viewId, e: Omit<GenuiEvent,"seq"|"at">): GenuiEvent | { problem: Problem }`. Names are 1..64 characters and payloads at most 16 KB as JSON; otherwise it returns a problem. It keeps the last 500 per view, in memory only.
    - `since(viewId, after = 0): GenuiEvent[]`
    - `wait(viewId, after, ms ≤ 60000): Promise<GenuiEvent[]>`: resolves as soon as an event arrives, or with `[]` at timeout.
  - Intake:
    - `screenMessage({t:"event"})` → log add.
    - `events(viewId, after?, waitMs?)`.
    - `status()` adds `events: { count, lastSeq }`.
  - `buildVariants(view: View, alts: {label: string; ops: PatchOp[]}[], validate): {label; view; problems}[] | { problem }`:
    - 2–3 alternatives, labels 1..40 characters.
    - Ops that change data (`addQuery`, `addDataset`, `addParam`, `removeParam`) are rejected; variants reuse the view's data.
    - Each alternative goes through `applyOps`, then `validateView` against the current results.
  - Intake:
    - `variants(viewId, alts, baseVersion?)` → emits `{t:"variants"}` and returns `{viewId, version, url, variants: [{label, problems}]}`.
    - Any commit to that view clears pending variants (it emits `variants: []`).
    - `pickVariant(viewId, index)` commits the chosen view as a new version (source `screen`, note `picked "<label>"`). It logs the event `{name: "genui:variant-picked", payload: {index, label, version}}` and clears the variants.
    - `snapshot` includes pending variants.
  - HTTP:
    - `GET /api/views/:id/events?after=N&wait=ms` → `{events}`.
    - `POST /api/views/:id/variants {variants, baseVersion?}`.
    - `GET /lib/<path>` serves `renderer/dist/lib/` with `Access-Control-Allow-Origin: *`, nosniff and long cache.
    - `allowed()` accepts `Origin: null` for `GET /lib/*` and `GET /media/*` only (sandboxed frames send `null`).
  - MCP tools:
    - `events {viewId, after?, waitMs?}`: "wait for what the person does on screen: clicks sent by your page with genui.send, and variant picks".
    - `variants {viewId, variants: [{label, ops}], baseVersion?}`.
    - The existing `ScreenMessageSchema` adds both new messages.
- [ ] **Step 1: Write failing tests**:
  - `event log limits`: a 17 KB payload → problem; a 65-character name → problem; after 600 adds only 500 remain and `seq` keeps increasing.
  - `wait resolves on the next event and times out empty`.
  - `variants apply and validate without creating versions`: 3 alternatives on a view at v2 give 3 views, and the store is still at v2.
  - `variant ops cannot change data`: `addQuery` → problem.
  - `pickVariant commits, logs and clears`: the version goes to v3 with the picked title, the event log has `genui:variant-picked`, and the last `variants` event is empty.
  - `a commit clears pending variants`.
  - api tests:
    - `lib is served cross-origin to sandboxed frames`: `Origin: null` GET `/lib/x.js` → 200 with `access-control-allow-origin: *`; `Origin: null` POST `/api/views` → 403.
    - `events long-poll returns the screen's click`: a WS `event` message during a `wait=2000` request is returned.
- [ ] **Step 2: Run** `npx vitest run packages/server` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` → PASS.
- [ ] **Step 5: Commit** `feat(server): event log, variants and the sandbox lib route`.

---

### Task 3: Sandbox library build

**Files:**
- Create: `packages/renderer/vite.sandbox.config.ts`, `packages/renderer/sandbox/{react,react-dom-client,jsx-runtime,motion-react,lucide-react,three,d3,gsap}.ts`, `packages/renderer/sandbox/frameRuntime.ts` (placeholder exporting nothing, filled in Task 5), `packages/renderer/test/sandboxBuild.test.ts`
- Modify: `packages/renderer/package.json` (script `build` = `vite build && vite build --config vite.sandbox.config.ts`), `packages/renderer/playwright.config.ts` (`webServer.command` runs `npm run build`)

**Interfaces:**
- Produces:
  - `dist/lib/` with stable, unhashed entry names:
    - `react.js`, `react-dom-client.js`, `jsx-runtime.js`, `motion-react.js`, `lucide-react.js`, `three.js`, `d3.js`, `gsap.js`: each re-exports its package, and the entries share one React chunk.
    - `runtime.js`
    - `tailwind.js`, copied from `@tailwindcss/browser/dist/index.global.js`
    - `fonts/inter.css` plus the woff2 from `@fontsource-variable/inter`, with relative URLs.
  - `IMPORT_MAP: Record<string, string>` exported from `src/design/libs.ts`: bare specifier → lib file. It maps `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`, `react/jsx-dev-runtime`, `motion`, `motion/react`, `framer-motion` (→ motion-react), `lucide-react`, `three`, `d3` and `gsap`. Task 4 consumes it.
- [ ] **Step 1: Write failing test** `sandboxBuild.test.ts` (it runs the sandbox build into a temp `outDir` once, then checks):
  - Every file named by `IMPORT_MAP` exists.
  - `tailwind.js`, `runtime.js` and `fonts/inter.css` exist.
  - React's internals string appears in exactly one emitted chunk (a single React instance).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: Vite library mode with multiple ESM entries, `preserveEntrySignatures: "strict"`, `entryFileNames: "[name].js"` and shared chunks under `lib/chunks/`. Copy tailwind and fonts with a small inline plugin.
- [ ] **Step 4: Run** the test and `npm run build -w @genui/renderer` → PASS; `ls dist/lib` shows the files.
- [ ] **Step 5: Commit** `build(renderer): bundle sandbox libraries for the design canvas`.

---

### Task 4: Compiler and frame document (pure)

**Files:**
- Create: `packages/renderer/src/design/{compile,srcdoc,libs}.ts`
- Test: `packages/renderer/test/{compile,srcdoc}.test.ts`

**Interfaces:**
- Consumes: `IMPORT_MAP` (Task 3), `design` schema (Task 1).
- Produces:
  - `compileProject(c: { framework; files; entry? }): Promise<CompiledProject | { error: string }>`, where `CompiledProject = { entry: string; modules: Record<string, { code: string }>; order: string[]; html?: string; css: string[] }`.
    - Sucrase transforms `["typescript", "jsx"]` with `jsxRuntime: "automatic"` and `production: true` on ts/tsx/jsx/js.
    - Import specifiers come from `es-module-lexer` (`init` awaited once).
    - **Relative** specifiers resolve against the importing file. It tries the exact path, then `.tsx`, `.ts`, `.jsx`, `.js`, then `/index.*`. The specifier text is rewritten to the token `__genui__/<resolved path>`.
    - **Bare** specifiers must be keys of `IMPORT_MAP`. Otherwise the result is `{error: "cannot import \"<x>\" in <file>: available libraries are react, react-dom, motion, lucide-react, three, d3, gsap"}`.
    - `import "./x.css"` becomes a module that appends a `<style>`. JSON becomes `export default <json>`. svg/md become `export default <string>`.
    - `order` is a dependency-first topological order. A cycle gives `{error: "circular import: a.tsx → b.tsx → a.tsx"}`.
    - A Sucrase syntax error gives `{error: "<file>:<line>:<col> <message>"}`.
    - **html:** `html` is the entry document. Its `<script type="module" src="./x">` and `<link rel="stylesheet" href="./y.css">` refer to files; scripts compile as modules, and CSS is inlined into `css`.
  - `buildSrcdoc(p: CompiledProject, o: { origin: string; framework: "react" | "html"; mode: "light" | "dark"; data: Record<string, unknown[]>; assets: Record<string, string> }): string`. The document contains:
    - the CSP meta from Global Constraints, with `<origin>` substituted;
    - `<script type="importmap">` with absolute `<origin>/lib/…` URLs;
    - `<script src="<origin>/lib/tailwind.js">` and the `inter.css` link;
    - `<script type="application/json" id="genui-project">` with `{framework, entry, order, modules, css, data, assets, mode}`, where `</` in the JSON is escaped;
    - `<script type="module" src="<origin>/lib/runtime.js">`;
    - for react, a `<div id="root">` body; for html, the author's body.
- [ ] **Step 1: Write failing tests**:
  - **`compile resolves relative imports and orders dependencies`:** `App.tsx` imports `./components/Hero` (tsx), which imports `./hero.css`. The order is `["components/hero.css"?, "components/Hero.tsx", "App.tsx"]`, dependency first, and App's code contains `__genui__/components/Hero.tsx`.
  - `compile keeps bare library imports`: `import { motion } from "motion/react"` is unchanged.
  - `compile rejects unknown packages`: `import _ from "lodash"` → error naming `lodash` and the available list.
  - **`compile reports cycles and syntax errors with file and line`.**
  - `compile html project`: `index.html` with `<script type="module" src="./main.js">` and `<link href="./style.css">` → `main.js` is in modules and the CSS is inlined.
  - `srcdoc carries the sandbox CSP and import map`:
    - It contains `connect-src 'none'`, `form-action 'none'` and `<origin>/lib/react.js`.
    - `</script>` inside a file's content doesn't terminate the JSON script.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(renderer): design project compiler and sandbox document`.

---

### Task 5: The sandbox runtime and the Design component

**Files:**
- Modify: `packages/renderer/sandbox/frameRuntime.ts`, `packages/renderer/src/registry.tsx`, `styles.css`
- Create: `packages/renderer/src/design/bridge.ts`, `packages/renderer/src/components/Design.tsx`
- Test: `packages/renderer/e2e/design.spec.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - **Frame runtime** (`/lib/runtime.js`), in this order:
    1. Reads `#genui-project`.
    2. Installs an in-memory `localStorage`/`sessionStorage` shim, because the opaque origin throws.
    3. Defines `window.genui`:
       - `data` (object of rows) and `onData(cb)`: re-called when the parent sends new data.
       - `theme` (`"light" | "dark"`) and `onTheme(cb)`; it also sets `<html class="dark">` for Tailwind's dark variant.
       - `asset(name): string | undefined`
       - `send(name: string, payload?: unknown)`: at most 20 per second, extras dropped with one console warning.
    4. Reports errors to the parent: `window.onerror`, `unhandledrejection`, `console.error` and `securitypolicyviolation`. The last becomes `blocked network request to <blockedURI> (the sandbox has no network: pass data with "data", files with "assets")`.
    5. Links modules: for each path in `order`, it substitutes `__genui__/<dep>` tokens with the dep's blob URL, makes a blob URL, then dynamically imports the entry.
    6. For react, the entry's default export is mounted with `createRoot(#root).render(<Default />)`.
    7. Posts `ready` after mount (react) or after the entry module evaluates (html), then posts content height via a ResizeObserver, throttled to animation frames.
  - **Bridge (parent):** `mountFrame(iframe, srcdoc, handlers: { onReady; onError(msg); onHeight(px); onSend(name, payload) }): { setData(d); setTheme(m); destroy() }`. It accepts messages only when `e.source === iframe.contentWindow`.
  - **`Design` renderer** (lazy, self-reporting) for both `design` and `custom`:
    - It compiles in the parent; a compile error → `ctx.report(false, "design: <error>")`, and a code-styled error panel shows inside the card.
    - It builds the srcdoc with `origin = location.origin`, data from `ctx.results[q].rows` for each `c.data`, and assets mapped through `ctx.media`.
    - The iframe uses `sandbox="allow-scripts allow-forms"`, `referrerpolicy="no-referrer"` and `loading="eager"`.
    - **Reporting:**
      - `ready` → `ctx.report(true)`.
      - Every error → `ctx.report(false, "design: <message>")`, plus a small red badge on the card with the latest message; the page stays visible.
      - No `ready` within 8 s → `ctx.report(false, "design: did not finish loading (an infinite loop or a promise that never settles?)")`.
    - **Updates:**
      - When results change, it calls `setData` without reloading.
      - Theme changes call `setTheme`.
      - A file change rebuilds the srcdoc and crossfades the new frame over the old one (the old one stays until the new one is ready, then fades 200 ms).
    - `genui.send` → screen message `{t:"event", viewId, itemId, name, payload}` via a new `ctx.send(name, payload)` on `RenderCtx`.
    - **Card toolbar:**
      - viewport switcher: desktop is 100% width, tablet 820 px and phone 390 px (with rounded device frames); the default is `c.viewport`;
      - an "Open full screen" button that opens the page display (Task 6) for this item;
      - a "custom" badge when the item reads data (Plan 1 rule).
    - **Height:** fit content (clamped 200..2400), or `c.height`.
- [ ] **Step 1: Write failing e2e tests** (`design.spec.ts`):
  - **`react design renders with tailwind, motion and lucide`:**
    - A two-file project: `App.tsx` imports `./Hero`, which uses `motion.div`, a lucide icon and Tailwind classes.
    - The frame's text contains the hero title, and an element with class `bg-indigo-600` has a non-transparent computed background.
    - Status is clean and `unverified` is `[]`.
  - `html custom renders`.
  - **`three and d3 load offline`:** a design imports `three` (renders a canvas) and `d3` (draws an svg). Both appear while every request outside localhost is aborted.
  - **`runtime error becomes a problem`:** `throw new Error("boom")` in a click handler, after clicking a button in the frame, gives a status problem `render failed: design: boom`; the frame stays visible.
  - **`network is blocked and reported`:** a design with `fetch("https://example.com")` gives a problem containing `blocked network request to https://example.com`, and the page still renders its heading.
  - **`the frame cannot touch the screen`:**
    - The design runs `try { window.top.location = "about:blank" } catch {}` and reads `parent.document`, inside a try that sends the outcome with `genui.send("probe", …)`. It also uses `localStorage.setItem` / `getItem`.
    - The screen URL is unchanged and its `h1` is still the view title.
    - The probe event says access was denied, and storage round-trips.
  - **`send reaches the caller`:** clicking a button that calls `genui.send("chose", {plan: "pro"})` makes `GET /api/views/<id>/events?wait=3000` return it with the item id.
  - **`send is rate-limited`:** a loop of 1000 sends in one tick logs at most 20 events.
  - **`stuck design reports a problem`:** an entry with `await new Promise(() => {})` before the export → within 10 s, status has `did not finish loading`, and a sibling text item is visible.
  - **`data and theme reach the page live`:**
    - A design with `data: ["q"]` renders `genui.data.q.length`.
    - A param change updates the number without a frame reload (a tagged `window` inside the frame survives).
    - Toggling dark mode adds `dark` to the frame's `<html>`.
  - `editFile patch updates the page`: an `edits` op changing the hero title text → the frame shows the new title.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx playwright test` and `npx vitest run` → PASS. Check the entry chunk: with asset paths stripped, the main `index-*.js` contains no `sucrase` or `es-module-lexer` code.
- [ ] **Step 5: Commit** `feat(renderer): design canvas runtime and component`.

---

### Task 6: Page display (full screen)

**Files:**
- Create: `packages/renderer/src/components/PageView.tsx`
- Modify: `packages/renderer/src/App.tsx`, `styles.css`
- Test: `packages/renderer/e2e/page.spec.ts`

**Interfaces:**
- Produces:
  - **When it applies:** a view whose only item is a `design`/`custom` with `display: "page"` renders as a page, or any design item after its "Open full screen" button (with Escape to leave).
  - **Layout:** the frame fills the viewport beside the sidebar; the sidebar collapses to a 56 px rail in page mode. A floating glass bar (top centre, auto-hides after 2 s idle and returns on mouse move) holds the title, the version chip, the viewport switcher, a variants indicator and an exit button for opened items.
  - **Viewports:** they work as in Task 5; tablet and phone centre a device frame on a neutral backdrop.
  - **Entering:** the design morphs from its card into the page with a shared `layoutId` (SPRING); reduced motion fades.
- [ ] **Step 1: Write failing e2e**:
  - `page display fills the screen`: the frame's bounding box is at least 90% of the viewport height and at least 85% of the width; there's no section title.
  - `card opens full screen and Escape returns`.
  - `phone viewport is 390 wide`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(renderer): full-screen page display for designs`.

---

### Task 7: Variants side by side, and version compare

**Files:**
- Create: `packages/renderer/src/components/Variants.tsx`
- Modify: `packages/renderer/src/{store.ts,App.tsx}`, `components/VersionStrip.tsx`, `styles.css`
- Test: `packages/renderer/test/store.test.ts` (add), `packages/renderer/e2e/variants.spec.ts`

**Interfaces:**
- Consumes: the `variants` ViewEvent and `pickVariant` (Tasks 1–2).
- Produces:
  - **Store:** `State.variants: Record<viewId, { baseVersion: number; items: { label: string; view: View }[] }>`. An empty list deletes the entry.
  - **`Variants` overlay:** it opens automatically when variants arrive for the current view.
    - It shows 2–3 columns, each with the label, a "Choose" button and a `VariantFrame`.
    - `VariantFrame` lays out the variant's view body (sections, or the page frame for a page design) at 1280 px width and scales it to the column with a transform, setting its height accordingly. Clicking a column zooms it to full size, and Escape returns.
    - Reports from items inside variants are not sent (they aren't versions).
    - "Choose" sends `pickVariant`; the overlay closes when the empty `variants` event arrives, and the picked view morphs into place.
  - **Version compare:** the version list gains "Compare…": tick up to 3 versions → the same overlay with labels `v3`, `v5`, … and "Use this version" (the existing `pick`).
- [ ] **Step 1: Write failing tests**:
  - `variants events stored and cleared` (store).
  - **e2e `three options, pick one`:**
    - Render a view with a page design, then `POST /variants` with 3 alternatives whose hero texts are A, B and C.
    - Three columns show A, B and C; click "Choose" on B.
    - Status gives the version +1 and the hero text B on screen. `GET /events` contains `genui:variant-picked` with label B.
  - e2e `compare two versions`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(renderer): variants side by side and version compare`.

---

### Task 8: Skill, gallery, and a real run

**Files:**
- Modify: `packages/server/src/skillGuide.md`, `packages/server/src/gallery.ts`, `README.md`
- Create: `docs/screenshots/2c-*.png`
- Test: `packages/server/test/skill.test.ts` (add), gallery e2e (existing, now includes design/custom)

**Interfaces:**
- Produces:
  - A skill section, **"The design canvas: build anything"**. It covers:
    - when to reach for it: anything the catalog doesn't express, and anything that should feel like a product or site;
    - the file layout and libraries, Tailwind with the `dark:` variant, the bridge API, and `display: "page"`;
    - iterating with `editFile` edits;
    - offering options with `variants`, then waiting with `events` (waitMs) for the pick or for `genui.send` clicks;
    - no network: pass data via `data`/`assets`;
    - reading problems (compile errors with file:line, runtime errors, blocked requests).
  - The gallery adds the design and custom examples.
- [ ] **Step 1: Write failing test** `skill covers the design canvas`: the skill contains `display`, `editFile`, `variants`, `genui.send`, `events`, and each library name.
- [ ] **Step 2–4:** FAIL → implement → PASS. Regenerate the skill (`npm run genui -- skill`).
- [ ] **Step 5:** Restart the server on the new build. In a scratch folder, run real `claude -p` sessions (allowed tools `mcp__genui__*,Read,Glob,Grep`):
  - "Using genui, build a landing page for genui itself, full screen, as if it were a product launch. Then offer me three different hero designs as variants and wait for my pick."
    - Pick one on screen and confirm the run continues with the picked one.
  - "Using genui, make an interactive 3D solar system I can click planets in; when I click a planet, tell me about it in the terminal."
    - This exercises `send` and `events`.
  - Take screenshots: `2c-landing.png`, `2c-variants.png`, `2c-solar.png`. Look at them and fix what you see.
- [ ] **Step 6:** Run the full suites: `npx vitest run` and `npx playwright test`.
- [ ] **Step 7: Commit** `docs: design canvas usage and screenshots`.

---

## Self-review notes

- **Spec coverage:**
  - §7 component shape (T1), projects not snippets / imports / hash routing / media / fonts (T1, T3, T4, T5)
  - Sandbox and CSP (T4, T5), local libs (T3)
  - Iteration with file edits (T1), versions + variants + pick (T2, T7, D11)
  - Viewport switcher (T5, T6), runtime/console errors (T5)
  - `custom` and its badge (T1, T5), skill (T8)
  - Hash routing needs nothing special: it works inside the frame, because `location.hash` in a srcdoc frame is allowed.
- **Calls beyond the spec** (from Kush's direction):
  - page display (T6);
  - three, d3 and gsap in the bundle (T3);
  - `genui.send` + event log + long-poll `events` tool (T2, T5);
  - variants exclude data ops (T2), to keep variants cheap and side-effect free.
- **Types:**
  - `GenuiEvent`, `pickVariant` and the `variants` event are defined in T1 and used in T2/T7.
  - `IMPORT_MAP` comes from T3 and is used in T4.
  - `CompiledProject` and `buildSrcdoc` come from T4 and are used in T5.
  - `ctx.send` (T5) is added to `RenderCtx`.
