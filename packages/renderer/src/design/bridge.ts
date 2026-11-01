export type FrameHandlers = {
  onReady(): void;
  onError(message: string): void;
  onHeight(px: number): void;
  onSend(name: string, payload: unknown): void;
  onNavigate(): void;
};

const SEND_PER_SECOND = 20;

/**
 * The screen's side of a design frame: trusts only messages from that frame's own window, and only while it still
 * shows genui's document. A srcdoc frame loads exactly once; a second load means the code navigated the frame
 * somewhere else, so the frame is blanked and nothing more is sent to or accepted from it.
 */
export function mountFrame(iframe: HTMLIFrameElement, srcdoc: string, h: FrameHandlers): { setData(d: Record<string, unknown[]>): void; setTheme(m: "light" | "dark"): void; destroy(): void } {
  let dead = false;
  let loads = 0;
  let windowStart = 0;
  let sentInWindow = 0;
  let data: Record<string, unknown[]> | undefined;
  let mode: "light" | "dark" | undefined;
  const send = (msg: Record<string, unknown>) => { if (!dead) iframe.contentWindow?.postMessage({ __genui: true, ...msg }, "*"); };

  const onMessage = (e: MessageEvent) => {
    if (dead || e.source !== iframe.contentWindow) return;
    const m = e.data as { __genui?: boolean; type?: string; message?: string; px?: number; name?: string; payload?: unknown };
    if (!m || m.__genui !== true) return;
    if (m.type === "ready") {
      // Data or theme sent while the frame was still loading may have missed it: repeat the latest of each.
      if (data) send({ type: "data", data });
      if (mode) send({ type: "theme", mode });
      h.onReady();
    } else if (m.type === "error") h.onError(String(m.message ?? "error"));
    else if (m.type === "height" && typeof m.px === "number") h.onHeight(m.px);
    else if (m.type === "send" && typeof m.name === "string") {
      // The frame's genui.send limits itself; raw postMessage calls are limited here.
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
    destroy: () => {
      dead = true;
      removeEventListener("message", onMessage);
      iframe.removeEventListener("load", onLoad);
    },
  };
}
