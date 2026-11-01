import type { ScreenMessage, ViewEvent } from "@aurora/spec";

export type Conn = { send(m: ScreenMessage): void; close(): void };

/** Connect to the server's event stream, reconnecting with backoff. */
export function connect(onEvent: (e: ViewEvent) => void, onStatus: (up: boolean) => void): Conn {
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
  return {
    send: (m) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); },
    close: () => { stopped = true; ws?.close(); },
  };
}
