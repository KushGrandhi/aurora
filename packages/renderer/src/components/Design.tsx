import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Monitor, Smartphone, Tablet } from "lucide-react";
import type { Custom, Design as DesignC } from "@aurora/spec";
import { mountFrame } from "../design/bridge.ts";
import { compileProject } from "../design/compile.ts";
import { buildSrcdoc } from "../design/srcdoc.ts";
import type { RenderCtx, Viewport } from "../registry.tsx";

type Controller = ReturnType<typeof mountFrame>;
type FrameSpec = { id: number; srcdoc: string };

const WIDTHS: Record<Viewport, number | undefined> = { desktop: undefined, tablet: 820, phone: 390 };
const STUCK_MS = 8000;
const clamp = (n: number) => Math.min(2400, Math.max(200, n));
/** A hero is the whole first screen. */
const heroHeight = () => Math.round(Math.max(420, window.innerHeight));

/** One sandboxed iframe; reports through `on` (always the latest handlers) and hands its controller back. */
function Frame({ spec, ready, on }: {
  spec: FrameSpec;
  ready: boolean;
  on: React.RefObject<{ ready(id: number): void; error(id: number, m: string): void; navigate(id: number): void; height(id: number, px: number): void; send(name: string, p: unknown): void; stuck(id: number): void; lint(id: number, w: string[]): void; register(id: number, c: Controller | undefined): void }>;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const h = () => on.current!;
    const ctl = mountFrame(ref.current!, spec.srcdoc, {
      onReady: () => h().ready(spec.id),
      onError: (m) => h().error(spec.id, m),
      onHeight: (px) => h().height(spec.id, px),
      onSend: (name, payload) => h().send(name, payload),
      onNavigate: () => h().navigate(spec.id),
      onLint: (w) => h().lint(spec.id, w),
    });
    h().register(spec.id, ctl);
    const timer = setTimeout(() => h().stuck(spec.id), STUCK_MS);
    return () => {
      clearTimeout(timer);
      ctl.destroy();
      h().register(spec.id, undefined);
    };
  }, []);
  return <iframe ref={ref} title="design" className={`design-frame${ready ? " ready" : ""}`} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" />;
}

/** A design or custom item: compiles in the screen, runs in a sandbox, crossfades to each new version of its files. */
export default function Design({ c, ctx }: { c: DesignC | Custom; ctx: RenderCtx }) {
  const input = useMemo(() => (c.type === "custom" ? { framework: "html" as const, files: { "index.html": c.html } } : { framework: c.framework, files: c.files, entry: c.entry }), [c]);
  const key = JSON.stringify(input);
  const data = useMemo(() => Object.fromEntries((c.data ?? []).map((q) => [q, ctx.results[q]?.rows ?? []])), [c.data, ctx.results]);
  const dataKey = JSON.stringify(data);
  const assets = useMemo(() => Object.fromEntries(Object.entries(c.assets ?? {}).map(([k, src]) => {
    const u = ctx.media(src);
    return [k, u ? new URL(u, location.origin).href : src];
  })), [c.assets, ctx.media]);
  const assetsKey = JSON.stringify(assets);

  const [frames, setFrames] = useState<FrameSpec[]>([]);
  const [readyIds, setReadyIds] = useState<Set<number>>(new Set());
  const [compileError, setCompileError] = useState<string>();
  const [error, setError] = useState<string>();
  const [height, setHeight] = useState(c.height ?? (ctx.bleed ? heroHeight() : 480));
  const [viewport, setViewport] = useState<Viewport>(c.type === "design" ? c.viewport ?? "desktop" : "desktop");
  const seq = useRef(0);
  const stuckIds = useRef(new Set<number>());
  const controllers = useRef(new Map<number, Controller>());
  const latest = useRef({ ctx, data, mode: ctx.mode, assets, fixedHeight: ctx.page ? 0 : c.height ?? (ctx.bleed ? heroHeight() : undefined) });
  latest.current = { ctx, data, mode: ctx.mode, assets, fixedHeight: ctx.page ? 0 : c.height ?? (ctx.bleed ? heroHeight() : undefined) };

  // Compile and start a new frame whenever the files change; the old frame stays until the new one is ready.
  useEffect(() => {
    let live = true;
    void compileProject(input).then((r) => {
      if (!live) return;
      if ("error" in r) {
        setCompileError(r.error);
        latest.current.ctx.report(false, `design: ${r.error}`);
        return;
      }
      setCompileError(undefined);
      setError(undefined);
      const { mode, data: d, assets: a } = latest.current;
      const display = latest.current.ctx.page ? "page" : latest.current.ctx.bleed ? "hero" : "card";
      const srcdoc = buildSrcdoc(r, { origin: location.origin, framework: input.framework, mode, data: d, assets: a, display, palette: latest.current.ctx.palette });
      const id = ++seq.current;
      setFrames((f) => [...f.slice(-1), { id, srcdoc }]);
    });
    return () => { live = false; };
  }, [key, assetsKey, JSON.stringify(ctx.palette ?? null)]);

  const newest = () => seq.current;
  const on = useRef({
    ready(id: number) {
      setReadyIds((s) => new Set(s).add(id));
      setFrames((f) => f.filter((x) => x.id >= id));
      // Not reported yet: the design counts as verified once its design checks come back (lint, below).
    },
    navigate(id: number) {
      const m = "navigated away to another page (the sandbox has no network: keep everything in the design, and link out with aurora.send)";
      setReadyIds((s) => new Set(s).add(id));
      if (id !== newest()) return;
      setError(m);
      latest.current.ctx.report(false, `design: ${m}`);
    },
    error(id: number, m: string) {
      if (id !== newest()) return;
      setError(m);
      latest.current.ctx.report(false, `design: ${m}`);
    },
    height(id: number, px: number) {
      if (id === newest() && latest.current.fixedHeight === undefined) setHeight(clamp(px));
    },
    send(name: string, payload: unknown) {
      latest.current.ctx.send(name, payload);
    },
    stuck(id: number) {
      if (id !== newest()) return;
      setReadyIds((s) => {
        if (!s.has(id)) {
          stuckIds.current.add(id);
          latest.current.ctx.report(false, "design: did not finish loading (an infinite loop or a promise that never settles?)");
        }
        return s;
      });
    },
    lint(id: number, w: string[]) {
      if (id !== newest()) return;
      latest.current.ctx.warn?.(w);
      // Drawn and checked. A design that finishes after its stuck warning is working after all: take the warning back.
      latest.current.ctx.report(true, undefined, stuckIds.current.has(id));
    },
    register(id: number, ctl: Controller | undefined) {
      if (ctl) controllers.current.set(id, ctl);
      else controllers.current.delete(id);
    },
  });

  useEffect(() => { controllers.current.get(newest())?.setData(data); }, [dataKey]);
  useEffect(() => { for (const ctl of controllers.current.values()) ctl.setTheme(ctx.mode); }, [ctx.mode]);
  useEffect(() => { if (c.height !== undefined) setHeight(c.height); }, [c.height]);

  const vp = ctx.page?.viewport ?? viewport;
  const width = WIDTHS[vp];
  return (
    <div className={`design viewport-${vp}${ctx.page ? " in-page" : ""}${ctx.bleed ? " in-hero" : ""}`}>
      {ctx.bleed && !ctx.page && ctx.openPage && <button className="open-page floating" onClick={ctx.openPage} aria-label="Open full screen" title="Open full screen"><Maximize2 size={14} /></button>}
      {!ctx.page && !ctx.bleed && <div className="design-bar">
        <div className="viewports" role="group" aria-label="Viewport">
          {([["desktop", Monitor], ["tablet", Tablet], ["phone", Smartphone]] as const).map(([v, Icon]) => (
            <button key={v} data-viewport={v} className={viewport === v ? "sel" : ""} onClick={() => setViewport(v)} aria-label={v} title={v}><Icon size={14} /></button>
          ))}
        </div>
        {(c.data?.length ?? 0) > 0 && <span className="custom-badge" title="Custom code showing data from this view's queries">custom</span>}
        {ctx.openPage && <button className="open-page" onClick={ctx.openPage} aria-label="Open full screen" title="Open full screen"><Maximize2 size={14} /></button>}
      </div>}
      {compileError ? (
        <pre className="design-compile-error">{compileError}</pre>
      ) : (
        <div className="design-stage" style={ctx.page ? undefined : { height }}>
          <div className="design-device" style={{ width: width ?? "100%" }}>
            {frames.map((f) => <Frame key={f.id} spec={f} ready={readyIds.has(f.id)} on={on} />)}
          </div>
        </div>
      )}
      {error && <div className="design-error" role="status">{error}</div>}
    </div>
  );
}
