// Runs inside a sandboxed design frame (served as /lib/runtime.js). Reads the compiled project from the page,
// links its modules through blob URLs, mounts it, and bridges data, theme, height, errors and genui.send() to the screen.
type Project = {
  framework: "react" | "html";
  entry: string;
  order: string[];
  modules: Record<string, { code: string }>;
  data: Record<string, unknown[]>;
  assets: Record<string, string>;
  mode: "light" | "dark";
};
type Listener<T> = (v: T) => void;

const DEP = "__genui__/";
const SEND_PER_SECOND = 20;
const MAX_ERRORS = 20;

const post = (msg: Record<string, unknown>) => window.parent.postMessage({ __genui: true, ...msg }, "*");
// Libraries come from the frame's import map at run time; a variable specifier keeps the bundler from inlining them.
const load = (spec: string): Promise<any> => import(/* @vite-ignore */ spec);

let errors = 0;
function reportError(message: unknown) {
  if (errors++ >= MAX_ERRORS) return;
  post({ type: "error", message: String(message ?? "unknown error").slice(0, 600) });
}

/** Opaque-origin frames throw on localStorage; ordinary sites expect it to work, so give them memory-backed storage. */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => (m.has(String(k)) ? m.get(String(k))! : null),
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(String(k)),
    setItem: (k, v) => void m.set(String(k), String(v)),
  };
}
for (const name of ["localStorage", "sessionStorage"] as const) {
  try {
    window[name].getItem("genui");
  } catch {
    Object.defineProperty(window, name, { value: memoryStorage(), configurable: true });
  }
}

addEventListener("error", (e) => reportError(e.error?.message ?? e.message));
addEventListener("unhandledrejection", (e) => reportError((e.reason as Error)?.message ?? e.reason));
addEventListener("securitypolicyviolation", (e) => {
  const what = e.blockedURI && /^https?:/.test(e.blockedURI) ? `blocked network request to ${e.blockedURI}` : `blocked by the sandbox (${e.effectiveDirective}${e.blockedURI ? `: ${e.blockedURI}` : ""})`;
  reportError(`${what} (the sandbox has no network: pass data with "data", files with "assets")`);
});
const consoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  reportError(args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  consoleError(...args);
};

const project: Project = JSON.parse(document.getElementById("genui-project")!.textContent!);
const dataListeners = new Set<Listener<Record<string, unknown[]>>>();
const themeListeners = new Set<Listener<"light" | "dark">>();
let windowStart = 0;
let sentInWindow = 0;
let warned = false;

const genui = {
  data: project.data,
  theme: project.mode,
  onData(cb: Listener<Record<string, unknown[]>>) {
    dataListeners.add(cb);
    return () => dataListeners.delete(cb);
  },
  onTheme(cb: Listener<"light" | "dark">) {
    themeListeners.add(cb);
    return () => themeListeners.delete(cb);
  },
  asset: (name: string): string | undefined => project.assets[name],
  send(name: string, payload?: unknown) {
    const now = Date.now();
    if (now - windowStart > 1000) {
      windowStart = now;
      sentInWindow = 0;
    }
    if (++sentInWindow > SEND_PER_SECOND) {
      if (!warned) console.warn(`genui.send: more than ${SEND_PER_SECOND} events a second; extra events are dropped`);
      warned = true;
      return;
    }
    try {
      post({ type: "send", name: String(name), payload: payload ?? null });
    } catch (e) {
      reportError(`genui.send("${name}"): payload must be plain data (${(e as Error).message})`);
    }
  },
};
(window as unknown as { genui: typeof genui }).genui = genui;

addEventListener("message", (e) => {
  if (e.source !== window.parent) return;
  const m = e.data as { __genui?: boolean; type?: string; data?: Record<string, unknown[]>; mode?: "light" | "dark" };
  if (!m?.__genui) return;
  if (m.type === "data" && m.data) {
    genui.data = m.data;
    for (const cb of dataListeners) cb(m.data);
  } else if (m.type === "theme" && m.mode) {
    genui.theme = m.mode;
    document.documentElement.classList.toggle("dark", m.mode === "dark");
    for (const cb of themeListeners) cb(m.mode);
  }
});

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
