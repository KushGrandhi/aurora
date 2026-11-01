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
};
export {};
type Boot = { project: Project; post(msg: Record<string, unknown>): void; reportError(message: unknown): void };

const DEP = "__genui__/";
// The classic bootstrap (src/design/bootstrap.ts) ran first and set up errors, storage, window.genui and messages.
const { project, post, reportError } = (window as unknown as { __genuiBoot: Boot }).__genuiBoot;
// Libraries come from the frame's import map at run time; a variable specifier keeps the bundler from inlining them.
const load = (spec: string): Promise<any> => import(/* @vite-ignore */ spec);

function watchHeight() {
  let queued = false;
  let last = 0;
  const send = () => {
    queued = false;
    const px = Math.ceil(Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0));
    if (Math.abs(px - last) > 1) post({ type: "height", px: (last = px) });
  };
  new ResizeObserver(() => {
    if (!queued) setTimeout(send, 16); // not requestAnimationFrame: browsers pause it in off-screen frames
    queued = true;
  }).observe(document.documentElement);
  send();
}

/** Blob URL per module, dependencies first; each module's `__genui__/<path>` tokens become its dependencies' URLs. */
function link(): Record<string, string> {
  const urls: Record<string, string> = {};
  const known: string[] = [];
  for (const path of project.order) {
    let code = project.modules[path].code;
    for (const dep of known) code = code.split(DEP + dep).join(urls[dep]);
    urls[path] = URL.createObjectURL(new Blob([`${code}\n//# sourceURL=genui:///${path}`], { type: "text/javascript" }));
    known.push(path);
    known.sort((a, b) => b.length - a.length); // replace "a.tsx" before "a.ts"
  }
  return urls;
}

const ready = () => post({ type: "ready" });

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
