import type { WebSocket } from "ws";
import type { ViewEvent } from "@aurora/spec";
import { DataRuntime } from "./dataRuntime.ts";
import type { FontStore } from "./fonts.ts";
import { shareOutgoing, Shares } from "./hosted/shares.ts";
import { Intake } from "./intake.ts";
import type { MediaRegistry } from "./media.ts";
import { ViewStore } from "./viewStore.ts";

/** One workspace's views, data, intake and screens. Local mode has exactly one ("local"); hosted has one per workspace. */
export type Core = {
  ws: string;
  dir: string;
  hosted: boolean;
  store: ViewStore;
  data: DataRuntime;
  intake: Intake;
  clients: Set<WebSocket>;
  captures: Set<WebSocket>; // headless capture pages (look): they get every event but are never "the screen"
  viewers: Map<WebSocket, string>; // hosted share sockets → the one view each is pinned to; never "the screen"
  shares?: Shares; // hosted: the workspace's share links
  broadcast(e: ViewEvent): void;
  close(): Promise<void>;
};

export type CoreOpts = {
  ws: string;
  dir: string;
  media: MediaRegistry;
  fonts: FontStore;
  open: (url: string) => void;
  baseUrl: () => string;
  waitMs?: number;
  hosted?: boolean; // hosted workspace: inline data only
};

export function send(ws: WebSocket, e: ViewEvent): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(e));
}

export async function createCore(opts: CoreOpts): Promise<Core> {
  const clients = new Set<WebSocket>();
  const captures = new Set<WebSocket>();
  const viewers = new Map<WebSocket, string>();
  const store = new ViewStore(opts.dir);
  await store.load();
  await store.prune();
  const data = new DataRuntime({ inlineDir: opts.dir, inlineOnly: opts.hosted ?? false });
  const broadcast = (e: ViewEvent) => {
    for (const c of clients) send(c, e);
    for (const c of captures) send(c, e);
    for (const [c, viewId] of viewers) if (shareOutgoing(viewId, e)) send(c, e);
  };
  const intake = new Intake({
    store, data, emit: broadcast, baseUrl: opts.baseUrl, screens: () => clients.size, openScreen: opts.open, waitMs: opts.waitMs, media: opts.media, fonts: opts.fonts, hosted: opts.hosted,
  });
  return {
    ws: opts.ws,
    dir: opts.dir,
    hosted: opts.hosted ?? false,
    store,
    data,
    intake,
    clients,
    captures,
    viewers,
    ...(opts.hosted ? { shares: new Shares(opts.dir) } : {}),
    broadcast,
    async close() {
      for (const c of clients) c.terminate();
      for (const c of captures) c.terminate();
      for (const c of viewers.keys()) c.terminate();
      await data.closeAll();
    },
  };
}
