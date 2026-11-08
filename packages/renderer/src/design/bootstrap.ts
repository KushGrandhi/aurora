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
  const focusListeners = new Set<Listener<string | null>>();
  type Story = { index: number; state: unknown } | null;
  const storyListeners = new Set<Listener<Story>>();
  const paramListeners = new Set<Listener<Record<string, unknown>>>();
  // Scroll: the screen sends exact values as the reader scrolls; this side eases toward them every frame (messages
  // arrive out of step with this frame's own animation frames, which would stutter), landing exactly on rest values.
  type Scroll = { progress: number; position: number; index: number; count: number; reduced: boolean; raw: { progress: number; position: number } };
  const fresh = (): Scroll => ({ progress: 0, position: 0, index: 0, count: 0, reduced: false, raw: { progress: 0, position: 0 } });
  const target = fresh(), scroll = fresh();
  const scrollListeners = new Set<Listener<Scroll>>();
  let easing = false, lastT = 0, inner = false;
  const TAU = 80;
  const stepScroll = (t: number) => {
    const dt = lastT ? Math.min(100, t - lastT) : 16;
    lastT = t;
    const k = target.reduced ? 1 : 1 - Math.exp(-dt / TAU);
    let moving = false;
    const ease = (o: { progress: number; position: number }, g: { progress: number; position: number }) => {
      for (const key of ["progress", "position"] as const) {
        const d = g[key] - o[key];
        if (Math.abs(d) < 1e-4) o[key] = g[key];
        else { o[key] += d * k; moving = true; }
      }
    };
    ease(scroll, target);
    ease(scroll.raw, target.raw);
    scroll.index = target.index; scroll.count = target.count; scroll.reduced = target.reduced;
    for (const cb of scrollListeners) cb(scroll);
    if (moving) requestAnimationFrame(stepScroll);
    else { easing = false; lastT = 0; }
  };
  const kick = () => { if (!easing) { easing = true; requestAnimationFrame(stepScroll); } };
  // A page that scrolls inside the frame (a whole website, a tall card): its own scroll is its progress.
  addEventListener("scroll", () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    inner = max > 2;
    if (!inner) return;
    const p = Math.max(0, Math.min(1, scrollY / max));
    target.raw.progress = p;
    target.progress = target.reduced ? Math.round(p * 4) / 4 : p;
    kick();
  }, { passive: true });
  let windowStart = 0;
  let sentInWindow = 0;
  let warned = false;
  const aurora = {
    data: project.data as Record<string, unknown[]>,
    theme: project.mode as "light" | "dark",
    /** In a story section: the step the reader has scrolled to and its `state`, or null outside a story. */
    story: (project.story ?? null) as Story,
    onStory(cb: Listener<Story>) {
      storyListeners.add(cb);
      return () => storyListeners.delete(cb);
    },
    /**
     * Scroll as a live value, eased every frame: read it in an animation loop (`useFrame`, a GSAP ticker).
     * `progress` 0..1 through the page; in a story `position` (1.37 = 37% from step 1 to step 2), `index`, `count`.
     * With reduced motion the values snap; `raw` keeps them continuous for a design that opts in.
     */
    scroll,
    onScroll(cb: Listener<Scroll>) {
      scrollListeners.add(cb);
      return () => scrollListeners.delete(cb);
    },
    /** The view's param values by name (filters, and numbers the reader drags in prose). */
    params: (project.params ?? {}) as Record<string, unknown>,
    onParams(cb: Listener<Record<string, unknown>>) {
      paramListeners.add(cb);
      return () => paramListeners.delete(cb);
    },
    /** Linked focus: what the reader is pointing at anywhere on the view (a region, a part), or null. */
    focus: null as string | null,
    onFocus(cb: Listener<string | null>) {
      focusListeners.add(cb);
      return () => focusListeners.delete(cb);
    },
    /** Point at something: every item of the view lights it up. null lets go. */
    setFocus(value: string | null) {
      const v = value == null || value === "" ? null : String(value).slice(0, 200);
      if (v === aurora.focus) return;
      aurora.focus = v;
      for (const cb of focusListeners) cb(v);
      post({ type: "focus", value: v });
    },
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
    const m = e.data as { __aurora?: boolean; type?: string; data?: Record<string, unknown[]>; mode?: "light" | "dark"; value?: string | null; story?: Story; params?: Record<string, unknown>; scroll?: Scroll };
    if (!m?.__aurora) return;
    if (m.type === "data" && m.data) {
      aurora.data = m.data;
      for (const cb of dataListeners) cb(m.data);
    } else if (m.type === "scroll" && m.scroll) {
      const s = m.scroll;
      if (!inner) { target.progress = s.progress; target.raw.progress = s.raw.progress; }
      target.position = s.position; target.raw.position = s.raw.position;
      target.index = s.index; target.count = s.count; target.reduced = s.reduced;
      kick();
    } else if (m.type === "story" && m.story !== undefined) {
      aurora.story = m.story;
      for (const cb of storyListeners) cb(m.story);
    } else if (m.type === "params" && m.params) {
      aurora.params = m.params;
      for (const cb of paramListeners) cb(m.params);
    } else if (m.type === "focus" && m.value !== undefined) {
      if (m.value === aurora.focus) return;
      aurora.focus = m.value;
      for (const cb of focusListeners) cb(m.value);
    } else if (m.type === "theme" && m.mode) {
      aurora.theme = m.mode;
      document.documentElement.classList.toggle("dark", m.mode === "dark");
      for (const cb of themeListeners) cb(m.mode);
    }
  });

  w.__auroraBoot = { project, post, reportError };
}
