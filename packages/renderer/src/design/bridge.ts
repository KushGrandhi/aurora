export type FrameHandlers = {
  onReady(): void;
  onError(message: string): void;
  onHeight(px: number): void;
  onSend(name: string, payload: unknown): void;
  onNavigate(): void;
  onLint?(warnings: string[]): void;
  /** The design pointed at something (linked focus), or let go (null). */
  onFocus?(value: string | null): void;
};

const SEND_PER_SECOND = 20;

/**
 * The screen's side of a design frame: trusts only messages from that frame's own window, and only while it still
 * shows aurora's document. A srcdoc frame loads exactly once; a second load means the code navigated the frame
 * somewhere else, so the frame is blanked and nothing more is sent to or accepted from it.
 */
export function mountFrame(iframe: HTMLIFrameElement, srcdoc: string, h: FrameHandlers): { setData(d: Record<string, unknown[]>): void; setTheme(m: "light" | "dark"): void; setFocus(v: string | null): void; destroy(): void } {
  let dead = false;
  let loads = 0;
  let windowStart = 0;
  let sentInWindow = 0;
  let data: Record<string, unknown[]> | undefined;
  let mode: "light" | "dark" | undefined;
  let focus: string | null = null;
  const send = (msg: Record<string, unknown>) => { if (!dead) iframe.contentWindow?.postMessage({ __aurora: true, ...msg }, "*"); };

  const onMessage = (e: MessageEvent) => {
    if (dead || e.source !== iframe.contentWindow) return;
    const m = e.data as { __aurora?: boolean; type?: string; message?: string; px?: number; name?: string; payload?: unknown; warnings?: unknown };
    if (!m || m.__aurora !== true) return;
    if (m.type === "ready") {
      // Data or theme sent while the frame was still loading may have missed it: repeat the latest of each.
      if (data) send({ type: "data", data });
      if (mode) send({ type: "theme", mode });
      if (focus !== null) send({ type: "focus", value: focus });
      h.onReady();
    } else if (m.type === "error") h.onError(String(m.message ?? "error"));
    else if (m.type === "height" && typeof m.px === "number") h.onHeight(m.px);
    else if (m.type === "lint" && Array.isArray(m.warnings)) h.onLint?.(m.warnings.filter((w): w is string => typeof w === "string").slice(0, 8).map((w) => w.slice(0, 300)));
    else if (m.type === "focus" && ((m as { value?: unknown }).value === null || typeof (m as { value?: unknown }).value === "string")) h.onFocus?.((m as { value: string | null }).value?.slice(0, 200) ?? null);
    else if (m.type === "send" && typeof m.name === "string") {
      // The frame's aurora.send limits itself; raw postMessage calls are limited here.
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        sentInWindow = 0;
      }
      if (++sentInWindow <= SEND_PER_SECOND) h.onSend(m.name, m.payload);
    }
  };
  const onLoad = () => {
    if (dead || ++loads < 2) return;
    dead = true;
    iframe.removeAttribute("srcdoc");
    iframe.src = "about:blank";
    h.onNavigate();
  };
  addEventListener("message", onMessage);
  iframe.addEventListener("load", onLoad);
  iframe.srcdoc = srcdoc;
  return {
    setData: (d) => { data = d; send({ type: "data", data: d }); },
    setTheme: (m) => { mode = m; send({ type: "theme", mode: m }); },
    setFocus: (v) => { if (v === focus) return; focus = v; send({ type: "focus", value: v }); },
    destroy: () => {
      dead = true;
      removeEventListener("message", onMessage);
      iframe.removeEventListener("load", onLoad);
    },
  };
}
