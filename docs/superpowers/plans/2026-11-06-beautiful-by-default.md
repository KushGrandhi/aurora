# Beautiful by Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make any model connected to aurora, Haiku and local models included, produce beautiful, 3D-capable interfaces by giving it beautiful parts to assemble, recipes to copy, and warnings when its output falls short.

**Architecture:** The sandbox gains React Three Fiber, drei and a house-style kit (`aurora/kit`) served offline from `/lib/`. A new `display: "hero"` shows a design full width with no card frame above normal sections. The frame runtime measures each rendered design and reports warnings, which flow through the existing `rendered` screen message to `problems`. The skill is rewritten around recipes built on the kit. Each stage ends in a commit on `main`.

**Tech Stack:** TypeScript, React 18, three 0.187, @react-three/fiber 8, @react-three/drei 9, Vite library build, Vitest, Playwright, zod.

**Spec:** `docs/superpowers/specs/2026-11-06-beautiful-by-default-design.md`

## Global Constraints

- No breaking change to the view format: every existing e2e and unit test passes unchanged at the end of every stage.
- The sandbox never touches the network: no CDN, HDR, font or model URLs (drei `Environment` only with `Lightformer` children or `preset` removed; no `useGLTF` from URLs).
- React stays at 18.3.1; therefore `@react-three/fiber@^8` and `@react-three/drei@^9` (exact versions pinned in package.json).
- Kit colors come from aurora's tokens (`var(--accent)` etc.); no raw hex in kit UI code. Material base colors for metal and glass may be numeric (they are physical, not themed).
- Design-check findings are `severity: "warning"`, never `"error"`: a warned design still renders and still counts as rendered.
- After each stage: `npx vitest run` passes, `(cd packages/renderer && npm run build)` succeeds, `(cd packages/renderer && npx playwright test)` passes, then commit to `main` with the message given in the stage, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Reinstall the skill after the skill stage: `npx tsx packages/server/src/cli.ts skill`.

## Review Focus

- A WebGL context that fails to start (headless, old GPU) must leave the page readable: the kit `Scene` shows a token-styled fallback message, not a blank or crashed frame. Test in Task 2.
- Two kit scenes on one view (two design items) must each get their own canvas and both render. Test in Task 2.
- A hero design followed by sections must keep version history, variants and "open full screen" working as for a card. Test in Task 3.
- Design checks must not fire on the catalog's own doc examples (the gallery): no false warnings on `design`/`custom` examples. Test in Task 4.
- Theme switch while a kit scene runs must recolor kit UI and token-driven materials without remounting the scene. Test in Task 2.

---

## Stage 1: React Three Fiber and drei in the sandbox

### Task 1: Serve `@react-three/fiber` and `@react-three/drei` offline

**Files:**
- Modify: `packages/renderer/package.json` (dependencies)
- Create: `packages/renderer/sandbox/r3f.ts`, `packages/renderer/sandbox/drei.ts`
- Modify: `packages/renderer/vite.sandbox.config.ts` (`ESM_ENTRIES`)
- Modify: `packages/renderer/src/design/libs.ts` (`IMPORT_MAP`)
- Modify: `packages/renderer/src/design/compile.ts` (`LIBRARIES` message)
- Modify: `packages/spec/src/components/design.ts` (`DESIGN_LIBRARIES`)
- Test: `packages/renderer/e2e/design.spec.ts`

**Interfaces:**
- Produces: bare imports `@react-three/fiber` → `/lib/r3f.js`, `@react-three/drei` → `/lib/drei.js`. Both share the single React and three chunks of the sandbox build.

- [ ] **Step 1: Write the failing e2e test** `test("react three fiber and drei render a lit scene offline", …)`: a design whose `App.tsx` renders `<Canvas><ambientLight/><mesh><boxGeometry/><meshStandardMaterial color="orange"/></mesh><OrbitControls/></Canvas>` importing `Canvas` from `@react-three/fiber` and `OrbitControls` from `@react-three/drei`. Assert: frame contains one `canvas`; `status(...).problems` equals `[]`; no `blocked network request` problem.
- [ ] **Step 2: Run it:** `cd packages/renderer && npx playwright test e2e/design.spec.ts -g "react three fiber"`. Expected: FAIL with a compile problem naming the unknown import.
- [ ] **Step 3: Add the dependencies and entries.** `npm i -w @aurora/renderer @react-three/fiber@^8 @react-three/drei@^9` (pin the resolved versions). `sandbox/r3f.ts`: `export * from "@react-three/fiber";`. `sandbox/drei.ts`: `export * from "@react-three/drei";`. Add `"r3f"`, `"drei"` to `ESM_ENTRIES`; add both to `IMPORT_MAP`; add `"@react-three/fiber", "@react-three/drei"` to `DESIGN_LIBRARIES` and the `LIBRARIES` string. Confirm in `dist/lib/chunks` that React and three each appear once (no second copy inside `r3f.js`/`drei.js`): `grep -c "__SECRET_INTERNALS" dist/lib/*.js dist/lib/chunks/*.js` shows React internals in one chunk only.
- [ ] **Step 4: Build and run:** `(cd packages/renderer && npm run build && npx playwright test e2e/design.spec.ts)`. Expected: PASS, including all existing design tests.
- [ ] **Step 5: Full verification and commit** (Global Constraints checks), message: `feat(sandbox): react three fiber and drei, served offline`.

---

## Stage 2: The house-style kit, `aurora/kit`

### Task 2: Kit module with Scene, materials, labels, stage, panels, controls

**Files:**
- Create: `packages/renderer/sandbox/kit/index.ts` (re-exports)
- Create: `packages/renderer/sandbox/kit/Scene.tsx`, `materials.tsx`, `Label.tsx`, `Stage.tsx`, `controls.tsx`, `Reveal.tsx`, `PhaseDial.tsx`, `tokens.ts`
- Modify: `vite.sandbox.config.ts` (entry `kit` → `sandbox/kit/index.ts`), `libs.ts` (`"aurora/kit": "kit.js"`), `compile.ts`, `design.ts` (`DESIGN_LIBRARIES` gets `"aurora/kit"`)
- Test: `packages/renderer/e2e/kit.spec.ts`

**Interfaces (exact exports of `aurora/kit`):**
- `Scene(props: { children: ReactNode; camera?: [number, number, number]; target?: [number, number, number]; autoRotate?: boolean /*default true*/; shadows?: boolean /*default true*/; className?: string }): JSX.Element` — fills its parent; R3F `Canvas` with ACES tone mapping, sRGB output, studio environment built from drei `Environment` + `Lightformer`s (no network), key light with soft shadows, drei `ContactShadows` under the scene, drei `OrbitControls` (damped; auto-rotate resumes 3 s after the last drag). Transparent background so the page token shows. If WebGL fails, renders `<div data-kit-fallback>` with a token-styled message.
- `Metal(props: { tone?: "steel" | "dark" | "brass" | "aluminium"; rough?: number })`, `Glass(props: { opacity?: number /*0.12*/ })`, `Glow(props: { color?: string /*CSS var name like "--bad"*/; intensity?: number /*0..1*/ })`, `Paint(props: { color?: string /*default "--accent"*/ })` — each renders a material element for use as a mesh child. `Glow` sets emissive and a matching point light is NOT included (keep it a material).
- `useToken(name: string): THREE.Color` — reads a CSS variable, updates on `window.aurora.onTheme`, returns a stable Color instance mutated in place (no remount).
- `Label(props: { at: [number, number, number]; children: ReactNode; side?: "left" | "right" })` — drei `Html` pinned to a point, offset to `side` with a thin leader line, styled `text-xs text-ink-2 bg-surface/80 backdrop-blur rounded-md ring-1 ring-hair px-2 py-1`, never intercepts drags.
- `Stage(props: { children: ReactNode; scene: ReactNode; className?: string })` — full-bleed `relative h-screen min-h-[560px]` (or `h-full` when inside a fixed-height parent) with a radial token background; `scene` fills it, `children` are overlays.
- `Panel(props: { children: ReactNode; at: "top-left" | "top-right" | "bottom" | "bottom-left" | "bottom-right"; className?: string })` — glass panel `rounded-2xl bg-surface/75 ring-1 ring-hair shadow-card backdrop-blur-xl`, positioned with the 24 px inset; stacks at the bottom on widths < 640 px.
- `useClock(opts?: { speed?: number /*units per second, default 1*/; playing?: boolean; period?: number /*wrap value, optional*/ }): { t: number; playing: boolean; speed: number; setPlaying(b: boolean): void; setSpeed(n: number): void; step(by: number): void }` — rAF loop with `dt` clamped to `[0, 0.05]` s, positive modulo wrap when `period` given; React state updated at most every 50 ms; `tRef` exposed as `clock.ref` (`MutableRefObject<number>`) for per-frame reads inside `useFrame`.
- `ControlBar(props: { clock: ReturnType<typeof useClock>; speeds?: { label: string; value: number }[]; onStep?: () => void; stepLabel?: string; children?: ReactNode })` — play/pause, optional step button, segmented speed control, `children` slot for extra chips; `flex flex-wrap`.
- `Reveal(props: { children: ReactNode; delay?: number; y?: number })` and `Stagger(props: { children: ReactNode; gap?: number /*s, default 0.06*/ })` — motion entrance with ease `[0.22, 1, 0.36, 1]`.
- `PhaseDial(props: { phases: { name: string; color: string /*CSS var*/ }[]; value: number /*0..1 through the whole cycle*/; size?: number })` — ring of equal arcs, active arc full opacity, needle.
- `Legend(props: { items: { name: string; color: string; active?: boolean; onClick?: () => void }[] })`.

- [ ] **Step 1: Write the failing e2e tests** in `e2e/kit.spec.ts` (reuse the `show`/`frame` helpers pattern from `design.spec.ts`):
  - `test("a kit scene renders with labels, panels and controls", …)`: App uses `Stage`, `Scene` with a `<mesh><cylinderGeometry/><Metal/></mesh>`, a `Label at={[0,1,0]}>piston</Label>`, a `Panel at="top-left"` with an `h2`, and `ControlBar clock={useClock({ period: 720 })}`. Assert: one `canvas`; label text "piston" visible; clicking the pause button changes its `aria-label` to "Play"; `problems` equals `[]`.
  - `test("two kit scenes on one view both render", …)`: two design items each with a `Scene`; both frames contain a `canvas`.
  - `test("a kit scene without webgl shows its fallback", …)`: launch the page with `--disable-webgl` via a `test.use({ launchOptions: { args: ["--disable-webgl", "--disable-3d-apis"] } })` describe block; frame shows `[data-kit-fallback]`.
  - `test("kit colors follow the theme without remounting", …)`: `Panel` text color equals `--ink` in light; toggle the screen theme; color changes; a `data-mount-count` attribute the test App increments in `useEffect(() => …, [])` stays `1`.
- [ ] **Step 2: Run:** `npx playwright test e2e/kit.spec.ts`. Expected: FAIL (cannot resolve `aurora/kit`).
- [ ] **Step 3: Implement the kit** to the interfaces above. Keep each file under ~150 lines. The studio environment: four `Lightformer`s (a wide top softbox intensity ~4, two side strips ~2, a low front fill ~1) inside `<Environment resolution={256}>`.
- [ ] **Step 4: Build and run:** `(cd packages/renderer && npm run build && npx playwright test e2e/kit.spec.ts e2e/design.spec.ts)`. Expected: PASS.
- [ ] **Step 5: Full verification and commit**, message: `feat(sandbox): aurora/kit, house-style 3D scenes, panels and controls`.

---

## Stage 3: Hero display

### Task 3: `display: "hero"` — full width, no card frame, sections below

**Files:**
- Modify: `packages/spec/src/components/design.ts` (`display: z.enum(["card", "page", "hero"])`, guidance sentence)
- Modify: `packages/renderer/src/components/Section.tsx`, `ItemFrame.tsx`, `Design.tsx`, `styles.css`
- Test: `packages/spec/test/design.test.ts`, `packages/renderer/e2e/page.spec.ts`

**Interfaces:**
- Produces: a design item with `display: "hero"` renders edge to edge across the content column with no `.card` chrome, no viewport switcher, height `min(88vh, 900px)` unless `height` is set; the open-full-screen button stays (top-right, floating). Rules: only meaningful as the first item of the first section; elsewhere it renders as a card and the server adds a warning `hero only applies to the first item of the first section; shown as a card`.

- [ ] **Step 1: Write the failing tests.**
  - Spec: `test("design display accepts hero", …)` parses `{ type: "design", framework: "react", display: "hero", files: { "App.tsx": "…" } }` successfully.
  - e2e `test("a hero design spans the page with sections below", …)`: view with section 1 item `display: "hero"` and section 2 a `text` item. Assert: hero `[data-item]` has no `.card` ancestor class, its bounding width ≥ the text card's width, text item renders below it; the open-full-screen button opens page mode; after a patch that edits the hero's file, the version strip shows v2 and picking v1 restores the old hero; `problems` equals `[]`.
  - e2e `test("a hero that is not first renders as a card with a warning", …)`: hero as second item; it has `.card`; status contains a `warning` whose message includes `hero only applies`.
- [ ] **Step 2: Run** both test files. Expected: FAIL.
- [ ] **Step 3: Implement.** Spec enum + guidance ("`display: \"hero\"` shows the first item full width with no frame, with the rest of the view below it: use it for a 3D scene or a striking visual that leads an explainer"). Renderer: `Section` passes `hero` to the first item when its `c.display === "hero"`; `ItemFrame` renders the bare body for it; `Design` treats hero like page for chrome (no bar) but keeps a fixed stage height. Server: the warning lives where intake builds item problems (`packages/server/src/intake.ts`, next to the existing per-item checks).
- [ ] **Step 4: Run** `npx vitest run packages/spec && (cd packages/renderer && npm run build && npx playwright test e2e/page.spec.ts)`. Expected: PASS.
- [ ] **Step 5: Full verification and commit**, message: `feat: hero display, a full-width design above the view's sections`.

---

## Stage 4: Design checks reported as warnings

### Task 4: Measure rendered designs and report warnings to the model

**Files:**
- Create: `packages/renderer/sandbox/lint.ts`
- Modify: `packages/renderer/sandbox/frameRuntime.ts` (run lint after ready), `packages/renderer/src/design/bridge.ts` (`onLint`), `packages/renderer/src/components/Design.tsx`, `packages/renderer/src/registry.tsx` (`RenderCtx.warn`), `packages/renderer/src/reports.ts`, `packages/renderer/src/App.tsx` (`useReports`)
- Modify: `packages/spec/src/events.ts` (`rendered` gains optional `warnings: { itemId: string; message: string }[]`), `packages/server/src/server.ts:91` (zod schema), `packages/server/src/intake.ts` (`Report.warnings`, `problems()` maps them to `severity: "warning"`)
- Test: `packages/renderer/test/reports.test.ts` (or the existing reports test file), `packages/server/test/intake.test.ts`, `packages/renderer/e2e/design.spec.ts`, `packages/renderer/e2e/gallery.spec.ts`

**Interfaces:**
- `lintDocument(doc: Document, opts: { display: "card" | "page" | "hero" }): string[]` in `sandbox/lint.ts` — returns messages, each exact text below, at most one per kind:
  - overflow: an element with visible text whose `scrollWidth > clientWidth + 2` and computed `overflow` is not `auto|scroll` → `"text overflows its box in <tag>.<first class> (\"<first 30 chars>\"): let it wrap (flex-wrap, min-w-0) or give it room"`
  - 3D in a card: a `canvas` with a WebGL context covering ≥ 40% of the body and `display === "card"` → `"a 3D scene is shown in a card: use display \"hero\" (with sections below) or \"page\" so it fills the screen"`
  - flat drawing: every `svg` larger than 200×150 px contains only `rect`, `line`, `circle`, `text`, `g`, `path` with no `linearGradient`/`radialGradient`/`filter`, and there is no `canvas` → `"the drawing is flat boxes and lines: for a mechanism, build it as a 3D scene with aurora/kit (Scene, Metal, Glass, Glow)"`
  - box soup: more than 8 visible elements with both a border/ring and a border-radius each smaller than 260×140 px → `"many small boxed panels: group related readouts into one panel and let the main visual carry the page"`
- Frame posts `{ type: "lint", warnings: string[] }` once, 1500 ms after `ready`.
- `RenderCtx.warn(messages: string[]): void`; `mergeReport` keeps `warnings: Map<itemId, string[]>`; `rendered` sends `warnings` flattened to `{ itemId, message }[]`.
- Server `problems()`: for the current version, each warning → `{ itemId, severity: "warning", message: "design: " + message }`.

- [ ] **Step 1: Write failing tests.**
  - Unit (renderer, Vitest): `mergeReport` with warnings for version 3 then a newer version 4 discards version 3 warnings; warnings for an item do not move it out of `ok`.
  - Unit (server): `screenMessage({ t: "rendered", …, warnings: [{ itemId: "d", message: "x" }] })` then `status` includes `{ itemId: "d", severity: "warning", message: "design: x" }`; a `rendered` without `warnings` still parses (backward compatible).
  - e2e: `test("design checks warn about overflow, flat drawings and 3D in a card", …)` — three designs: a `w-24 whitespace-nowrap overflow-visible` button with long text; an SVG of 8 rects 400×300; a kit `Scene` with `display: "card"`. Poll status until each item has its matching warning (substring match on the message starts above). Also assert none of them is in `unverified` and none has an `error`.
  - e2e (gallery): extend the gallery test: after it renders, status has no `warning` for the `design` and `custom` example items.
  - e2e: the existing V8 kit design from Stage 5's example rendered with `display: "hero"` has no warnings (add this assertion in Task 5 once the example exists).
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement** to the interfaces. The lint runs inside the frame, so it sees the real layout; it must never throw (wrap in try/catch, return `[]` on failure).
- [ ] **Step 4: Run** `npx vitest run && (cd packages/renderer && npm run build && npx playwright test e2e/design.spec.ts e2e/gallery.spec.ts)`. Expected: PASS.
- [ ] **Step 5: Full verification and commit**, message: `feat: design checks, warnings for overflow, flat drawings, boxed 3D and box soup`.

---

## Stage 5: The skill as recipes built on the kit

### Task 5: Rewrite the skill around recipes, kit reference and a 3D mechanism example

**Files:**
- Modify: `packages/server/src/skill/guide.md` (component picker → recipe router; "Before you finish" checklist adds hero/page for 3D)
- Modify: `packages/server/src/skill/design-canvas.md` (remove "Draw visuals with SVG, CSS and icons"; add kit and r3f; known-mistakes rows for the four warnings)
- Modify: `packages/server/src/skill/design-language.md` (house style: depth, light, one orchestrated motion moment, atmosphere backgrounds; banned defaults table)
- Create: `packages/server/src/skill/kit.md` (reference generated from a hand-written doc: every export, signature, a one-line use)
- Create: `packages/server/src/skill/examples/mechanism/{App.tsx, Engine.tsx, model.ts}` — the V8 on the kit, `display: "hero"`
- Modify: `packages/server/src/skill.ts` (add `references/kit.md`, `examples/mechanism.md`), `packages/server/test/skill.test.ts`
- Modify: `packages/spec/src/components/design.ts` guidance (mention `aurora/kit` and `hero`)

**Interfaces:**
- Consumes: `aurora/kit` exports (Task 2), `display: "hero"` (Task 3), warning texts (Task 4).
- Produces: skill files `references/kit.md`, `examples/mechanism.md`; recipe router table in SKILL.md with exactly these rows: mechanism or "how X works" → `examples/mechanism.md` (3D kit scene, hero, sections below); process or story → scroll story with `Reveal`/`Stagger`; product or landing → `examples/landing.md`; data → catalog components (kpi, chart, table) and `references/data.md`; system → `architecture`.

- [ ] **Step 1: Write failing skill tests** in `skill.test.ts`:
  - `test("the skill routes mechanisms to a 3D kit recipe", …)`: SKILL.md contains `examples/mechanism.md` and `aurora/kit` and `"hero"`; does not contain `Draw visuals with SVG`.
  - `test("kit reference documents every kit export", …)`: for each name in `["Scene","Metal","Glass","Glow","Paint","useToken","Label","Stage","Panel","useClock","ControlBar","Reveal","Stagger","PhaseDial","Legend"]`, `references/kit.md` contains `` `${name}` ``.
  - `test("the mechanism example is a hero kit scene", …)`: `examples/mechanism.md` contains `from "aurora/kit"`, `display: "hero"` (or `"display":"hero"`), and every file in `examples/mechanism/`.
  - Keep `SKILL.md` under 2400 words (existing test) and the RAW-color test covering the new example.
- [ ] **Step 2: Run** `npx vitest run packages/server/test/skill.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write the content.** The mechanism example is the hand-built V8 rewritten on the kit (≤ 200 lines per file): `model.ts` (pure crank math), `Engine.tsx` (meshes with `Metal`/`Glass`/`Glow`, `Label`s), `App.tsx` (`Stage`, `Panel`s, `ControlBar`, `PhaseDial`, `Legend`). Banned defaults table in design-language.md, each row "instead of X → do Y": boxes in rows for a mechanism → 3D kit scene; a 3D scene in a card → hero/page; nine small stat boxes → one panel; flat solid background → radial token gradient; motion scattered everywhere → one staggered entrance plus the mechanism's own motion; labels on moving parts → `Label` with leader line.
- [ ] **Step 4: Run** `npx vitest run`; render the example through the API and confirm `problems` is `[]` with no warnings (add the e2e assertion noted in Task 4). Expected: PASS.
- [ ] **Step 5: Reinstall the skill** (`npx tsx packages/server/src/cli.ts skill`), full verification, commit, message: `feat(skill): recipes, kit reference and a 3D mechanism example`.

---

## Stage 6: The frame gets cinematic

### Task 6: Entrance and version transitions on the screen

**Files:**
- Modify: `packages/renderer/src/motion.tsx`, `packages/renderer/src/components/Section.tsx`, `packages/renderer/src/styles.css`
- Test: `packages/renderer/e2e/motion.spec.ts`

**Interfaces:**
- Produces: on first show of a view, the title, summary, hero and each section enter with one staggered reveal (opacity 0→1, y 12→0, 60 ms stagger, ease `[0.22, 1, 0.36, 1]`, total ≤ 700 ms); on a new version, changed items crossfade with a 300 ms blur-to-sharp (`filter: blur(6px)` → `0`); `prefers-reduced-motion: reduce` disables both.

- [ ] **Step 1: Write failing e2e tests:** `test("a view enters with a staggered reveal", …)` samples the second section's opacity at ~50 ms (< 1) and after 900 ms (= 1); `test("reduced motion shows everything at once", …)` with `test.use({ reducedMotion: "reduce" })` sees opacity 1 at ~50 ms.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** in `motion.tsx` and `Section.tsx`, reusing existing motion helpers.
- [ ] **Step 4: Run** `(cd packages/renderer && npm run build && npx playwright test)`. Expected: PASS (full suite: screenshots in `docs/screenshots` regenerate; commit them).
- [ ] **Step 5: Commit**, message: `feat(screen): staggered entrances and soft version transitions`.

---

## Stage 7: Measure it

### Task 7: Rerun the Haiku eval and record results

**Files:**
- Create: `docs/evals/2026-11-beautiful-by-default.md`, screenshots under `docs/evals/img/`

- [ ] **Step 1: Run the eval.** Four fresh Haiku subagents, prompt verbatim with only a view id appended: "explain how a V8 car engine works, and visualize it on aurora. (Use view id hk3_v8.)" ×2 and "explain how the human heart pumps blood, and visualize it on aurora. (Use view id hk3_heart.)" ×2 (ids suffixed `a`/`b`). Each works in its own scratch folder.
- [ ] **Step 2: Screenshot** each in light and dark at 1440 px wide.
- [ ] **Step 3: Score** each against the rubric, 0–2 per row, written in the doc: depth (3D or layered, not flat boxes); motion that explains; layout (hero/page for the main visual, ≤ 1 panel of readouts per side); correctness of the mechanism; zero errors and zero warnings in `status`. Compare with the 2026-11-06 baseline (both runs: flat, card-boxed).
- [ ] **Step 4: Record** the table, screenshots and the three most common remaining failures with the stage that should address each.
- [ ] **Step 5: Commit**, message: `docs(eval): haiku before and after beautiful-by-default`.
