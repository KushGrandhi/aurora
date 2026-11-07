// Runs inside a sandboxed design frame (served as /lib/runtime.js), after the inline bootstrap: links the compiled
// project's modules through blob URLs, mounts it, and reports height and readiness to the screen.
type Project = {
  framework: "react" | "html";
  entry: string;
  order: string[];
  modules: Record<string, { code: string }>;
  data: Record<string, unknown[]>;
  assets: Record<string, string>;
  mode: "light" | "dark";
  display?: "card" | "page" | "hero";
};
import { lintDocument } from "./lint.ts";
type Boot = { project: Project; post(msg: Record<string, unknown>): void; reportError(message: unknown): void };

const DEP = "__aurora__/";
// The classic bootstrap (src/design/bootstrap.ts) ran first and set up errors, storage, window.aurora and messages.
const { project, post, reportError } = (window as unknown as { __auroraBoot: Boot }).__auroraBoot;
// Libraries come from the frame's import map at run time; a variable specifier keeps the bundler from inlining them.
const load = (spec: string): Promise<any> => import(/* @vite-ignore */ spec);

function watchHeight() {
  let queued = false;
  let last = 0;
  const send = () => {
    queued = false;
    // The body's content, not the document: <html> is never shorter than the frame, so measuring it would let a card
    // grow but never shrink back. `bottom + scrollY` also counts a first child's top margin collapsing through <body>.
    const body = document.body;
    if (!body) return;
    const px = Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().bottom + scrollY));
    if (Math.abs(px - last) > 1) post({ type: "height", px: (last = px) });
  };
  const ro = new ResizeObserver(() => {
    if (!queued) setTimeout(send, 16); // not requestAnimationFrame: browsers pause it in off-screen frames
    queued = true;
  });
  ro.observe(document.documentElement);
  if (document.body) ro.observe(document.body);
  send();
}

/** Blob URL per module, dependencies first; each module's `__aurora__/<path>` tokens become its dependencies' URLs. */
function link(): Record<string, string> {
  const urls: Record<string, string> = {};
  const known: string[] = [];
  for (const path of project.order) {
    let code = project.modules[path].code;
    for (const dep of known) code = code.split(DEP + dep).join(urls[dep]);
    urls[path] = URL.createObjectURL(new Blob([`${code}\n//# sourceURL=aurora:///${path}`], { type: "text/javascript" }));
    known.push(path);
    known.sort((a, b) => b.length - a.length); // replace "a.tsx" before "a.ts"
  }
  return urls;
}

const LINT_AFTER_MS = 1500;
const SETTLE_MS = 700;
/**
 * Measures the design as a person sees it: after entrances settle, and only once the frame is actually painted
 * (animation frames are paused while it is off screen, and some content, like a 3D canvas, only starts then).
 */
function lintWhenSeen() {
  setTimeout(() => requestAnimationFrame(() => setTimeout(() => {
    try {
      post({ type: "lint", warnings: lintDocument(document, { display: project.display ?? "card" }) });
    } catch { /* checks never break a design */ }
  }, SETTLE_MS)), LINT_AFTER_MS);
}
const ready = () => {
  post({ type: "ready" });
  lintWhenSeen();
};

async function main() {
  watchHeight();
  const urls = link();
  if (project.framework === "react") {
    const [mod, React, client, dom] = await Promise.all([load(urls[project.entry]), load("react"), load("react-dom/client"), load("react-dom")]);
    const App = mod.default;
    if (typeof App !== "function") throw new Error(`${project.entry} must export a React component as its default export`);
    const root = client.createRoot(document.getElementById("root"));
    // Commit synchronously so "ready" means drawn, even in an off-screen frame where animation frames are paused.
    dom.flushSync(() => root.render(React.createElement(App)));
  } else if (project.entry) {
    await load(urls[project.entry]);
  }
  ready();
}

main().catch((e) => reportError((e as Error)?.message ?? e));
