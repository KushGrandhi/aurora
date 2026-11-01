export type FrameHandlers = {
  onReady(): void;
  onError(message: string): void;
  onHeight(px: number): void;
  onSend(name: string, payload: unknown): void;
};

/** The screen's side of a design frame: trusts only messages from that frame's own window. */
export function mountFrame(iframe: HTMLIFrameElement, srcdoc: string, h: FrameHandlers): { setData(d: Record<string, unknown[]>): void; setTheme(m: "light" | "dark"): void; destroy(): void } {
  const onMessage = (e: MessageEvent) => {
    if (e.source !== iframe.contentWindow) return;
    const m = e.data as { __genui?: boolean; type?: string; message?: string; px?: number; name?: string; payload?: unknown };
    if (!m || m.__genui !== true) return;
    if (m.type === "ready") h.onReady();
    else if (m.type === "error") h.onError(String(m.message ?? "error"));
    else if (m.type === "height" && typeof m.px === "number") h.onHeight(m.px);
    else if (m.type === "send" && typeof m.name === "string") h.onSend(m.name, m.payload);
  };
  addEventListener("message", onMessage);
  iframe.srcdoc = srcdoc;
  const send = (msg: Record<string, unknown>) => iframe.contentWindow?.postMessage({ __genui: true, ...msg }, "*");
  return {
    setData: (data) => send({ type: "data", data }),
    setTheme: (mode) => send({ type: "theme", mode }),
    destroy: () => removeEventListener("message", onMessage),
  };
}
