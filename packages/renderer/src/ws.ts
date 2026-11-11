import type { ScreenMessage, ViewEvent } from "@aurora/spec";

export type Conn = { send(m: ScreenMessage): void; close(): void };

/**
 * Connect to the server's event stream, reconnecting with backoff. With `share` (hosted `/v/<token>`), the socket
 * is pinned to the link's view; a close with 4401 (unknown or rotated link) stops reconnecting and calls `onDead`.
 * Without a share link, a refused socket on a hosted server stops reconnecting and calls `onHosted`.
 */
export function connect(onEvent: (e: ViewEvent) => void, onStatus: (up: boolean) => void, role?: "capture", share?: { token: string; onDead: () => void }, onHosted?: () => void): Conn {
  let ws: WebSocket | undefined;
  let stopped = false;
  let delay = 250;
  const retry = () => { if (!stopped) setTimeout(open, (delay = Math.min(delay * 2, 4000))); };
  const open = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const query = share ? `?share=${encodeURIComponent(share.token)}` : role ? `?role=${role}` : "";
    const sock = (ws = new WebSocket(`${proto}://${location.host}/ws${query}`));
    let opened = false;
    sock.onopen = () => { opened = true; delay = 250; onStatus(true); };
    sock.onmessage = (m) => onEvent(JSON.parse(m.data));
    sock.onclose = (c) => {
      onStatus(false);
      if (share && c.code === 4401) { stopped = true; share.onDead(); return; }
      // Refused without a share link: a hosted server only takes share sockets, so retrying would never help.
      // The browser hides the refusal's status, so health says whether this is a hosted server (local retries as before).
      if (!share && !opened && onHosted && !stopped) {
        fetch("/api/health").then((r) => r.json()).then(
          (h: { hosted?: boolean }) => { if (h?.hosted === true) { stopped = true; onHosted(); } else retry(); },
          retry,
        );
        return;
      }
      retry();
    };
  };
  open();
  return {
    send: (m) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); },
    close: () => { stopped = true; ws?.close(); },
  };
}
