import type { RenderEvent } from "@genui/spec";

/** Connect to the server's event stream, reconnecting with backoff. Returns a disconnect function. */
export function connect(onEvent: (e: RenderEvent) => void, onStatus: (up: boolean) => void): () => void {
  let ws: WebSocket | undefined;
  let stopped = false;
  let delay = 250;
  const open = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => { delay = 250; onStatus(true); };
    ws.onmessage = (m) => onEvent(JSON.parse(m.data));
    ws.onclose = () => {
      onStatus(false);
      if (!stopped) setTimeout(open, (delay = Math.min(delay * 2, 4000)));
    };
  };
  open();
  return () => { stopped = true; ws?.close(); };
}
