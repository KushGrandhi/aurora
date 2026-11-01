/**
 * The frame's first script, inlined as a classic <script> right after the project JSON, so it runs before any of the
 * author's own scripts: error reporting, memory storage, `window.aurora` and the screen's data/theme messages exist
 * from the first line of their code. It is serialized with toString(), so it must not reference anything outside itself.
 */
export function auroraBootstrap(): void {
  type Listener<T> = (v: T) => void;
  const SEND_PER_SECOND = 20;
  const MAX_ERRORS = 20;
  const w = window as unknown as Record<string, unknown>;
  const project = JSON.parse(document.getElementById("aurora-project")!.textContent!);

  const post = (msg: Record<string, unknown>) => window.parent.postMessage({ __aurora: true, ...msg }, "*");
  let errors = 0;
  const reportError = (message: unknown) => {
    if (errors++ >= MAX_ERRORS) return;
    post({ type: "error", message: String(message ?? "unknown error").slice(0, 600) });
  };

  // Opaque-origin frames throw on localStorage; ordinary sites expect it to work, so give them memory-backed storage.
  const memoryStorage = (): Storage => {
    const m = new Map<string, string>();
    return {
      get length() { return m.size; },
      clear: () => m.clear(),
      getItem: (k) => (m.has(String(k)) ? m.get(String(k))! : null),
      key: (i) => [...m.keys()][i] ?? null,
      removeItem: (k) => void m.delete(String(k)),
      setItem: (k, v) => void m.set(String(k), String(v)),
    };
  };
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      window[name].getItem("aurora");
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

  const dataListeners = new Set<Listener<Record<string, unknown[]>>>();
  const themeListeners = new Set<Listener<"light" | "dark">>();
  let windowStart = 0;
  let sentInWindow = 0;
  let warned = false;
  const aurora = {
    data: project.data as Record<string, unknown[]>,
    theme: project.mode as "light" | "dark",
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
        if (!warned) console.warn(`aurora.send: more than ${SEND_PER_SECOND} events a second; extra events are dropped`);
        warned = true;
        return;
      }
      try {
        post({ type: "send", name: String(name), payload: payload ?? null });
      } catch (e) {
        reportError(`aurora.send("${name}"): payload must be plain data (${(e as Error).message})`);
      }
    },
  };
  w.aurora = aurora;

  addEventListener("message", (e) => {
    if (e.source !== window.parent) return;
    const m = e.data as { __aurora?: boolean; type?: string; data?: Record<string, unknown[]>; mode?: "light" | "dark" };
    if (!m?.__aurora) return;
    if (m.type === "data" && m.data) {
      aurora.data = m.data;
      for (const cb of dataListeners) cb(m.data);
    } else if (m.type === "theme" && m.mode) {
      aurora.theme = m.mode;
      document.documentElement.classList.toggle("dark", m.mode === "dark");
      for (const cb of themeListeners) cb(m.mode);
    }
  });

  w.__auroraBoot = { project, post, reportError };
}
