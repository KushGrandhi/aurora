import type { ScreenMessage, ViewEvent } from "@aurora/spec";

export type Conn = { send(m: ScreenMessage): void; close(): void };

/**
 * Connect to the server's event stream, reconnecting with backoff. With `share` (hosted `/v/<token>`), the socket
 * is pinned to the link's view; a close with 4401 (unknown or rotated link) stops reconnecting and calls `onDead`.
 */
export function connect(onEvent: (e: ViewEvent) => void, onStatus: (up: boolean) => void, role?: "capture", share?: { token: string; onDead: () => void }): Conn {
  let ws: WebSocket | undefined;
  let stopped = false;
  let delay = 250;
  const open = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const query = share ? `?share=${encodeURIComponent(share.token)}` : role ? `?role=${role}` : "";
    ws = new WebSocket(`${proto}://${location.host}/ws${query}`);
    ws.onopen = () => { delay = 250; onStatus(true); };
    ws.onmessage = (m) => onEvent(JSON.parse(m.data));
    ws.onclose = (c) => {
      onStatus(false);
      if (share && c.code === 4401) { stopped = true; share.onDead(); return; }
      if (!stopped) setTimeout(open, (delay = Math.min(delay * 2, 4000)));
    };
  };
  open();
  return {
    send: (m) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); },
    close: () => { stopped = true; ws?.close(); },
  };
}
