import { mkdirSync, watch, type FSWatcher } from "node:fs";
import { open, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { PatchOpSchema, type Problem } from "@aurora/spec";
import type { Intake, IntakeResult } from "./intake.ts";

const PatchLine = z.object({ ops: z.array(PatchOpSchema), baseVersion: z.number().int().optional() });

type FileState = {
  offset: number;
  ino: number;
  partial: string;
  line: number;
  done: number; // byte offset just past the last line applied (what a restart resumes from)
  viewId: string;
  lineProblems: Problem[];
  last?: IntakeResult;
  queue: Promise<unknown>;
};

/**
 * File streaming: each `<dir>/.aurora/views/<name>.ndjson` is a view followed by patches, one JSON value per line.
 * Reads only appended bytes; problems for each file go to `<name>.problems.json` beside it.
 */
export class ViewFileWatcher {
  private intake: Intake;
  private pollMs: number;
  private watched = new Map<string, { folder: string; fsw?: FSWatcher }>();
  private files = new Map<string, FileState>();
  private timer?: NodeJS.Timeout;

  constructor(intake: Intake, opts: { pollMs?: number } = {}) {
    this.intake = intake;
    this.pollMs = opts.pollMs ?? 250;
  }

  watch(dir: string): void {
    const root = path.resolve(dir);
    if (this.watched.has(root)) return;
    const folder = path.join(root, ".aurora", "views");
    mkdirSync(folder, { recursive: true });
    let fsw: FSWatcher | undefined;
    try {
      fsw = watch(folder, (_e, name) => {
        if (name && name.endsWith(".ndjson")) void this.scan(path.join(folder, name));
      });
      fsw.on("error", () => {});
    } catch {
      // the poll below still picks up changes
    }
    this.watched.set(root, { folder, fsw });
    this.timer ??= setInterval(() => void this.poll(), this.pollMs);
    this.timer.unref();
    void this.poll();
  }

  dirs(): string[] {
    return [...this.watched.keys()];
  }

  close(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    for (const w of this.watched.values()) w.fsw?.close();
    this.watched.clear();
  }

  private async poll(): Promise<void> {
    for (const { folder } of this.watched.values()) {
      const names = await readdir(folder).catch(() => [] as string[]);
      for (const n of names) if (n.endsWith(".ndjson")) void this.scan(path.join(folder, n));
    }
  }

  /** Reads whatever was appended since last time. Serialized per file. */
  private scan(file: string): Promise<unknown> {
    let st = this.files.get(file);
    if (!st) {
      st = { offset: 0, ino: -1, partial: "", line: 0, done: 0, viewId: path.basename(file, ".ndjson"), lineProblems: [], queue: Promise.resolve() };
      this.files.set(file, st);
    }
    const s = st;
    s.queue = s.queue.then(() => this.read(file, s)).catch(() => {});
    return s.queue;
  }

  private async read(file: string, s: FileState): Promise<void> {
    const info = await stat(file).catch(() => undefined);
    if (!info) return;
    if (s.ino === -1) await this.resume(file, s, info.ino, info.size);
    if (info.ino !== s.ino || info.size < s.offset) {
      // New or truncated/replaced file: start over.
      Object.assign(s, { offset: 0, ino: info.ino, partial: "", line: 0, done: 0, viewId: path.basename(file, ".ndjson"), lineProblems: [], last: undefined });
    }
    if (info.size === s.offset) return;
    const fh = await open(file, "r");
    let chunk: string;
    try {
      const buf = Buffer.alloc(info.size - s.offset);
      const { bytesRead } = await fh.read(buf, 0, buf.length, s.offset);
      s.offset += bytesRead;
      chunk = buf.subarray(0, bytesRead).toString("utf8");
    } finally {
      await fh.close();
    }
    const text0 = s.partial + chunk;
    let done = s.offset - Buffer.byteLength(text0); // byte offset of the first unprocessed line
    const lines = text0.split("\n");
    s.partial = lines.pop()!;
    for (const [i, text] of lines.entries()) {
      s.line++;
      done += Buffer.byteLength(text) + 1;
      s.done = done;
      if (!text.trim()) continue;
      await this.apply(s, text, s.line, i === lines.length - 1);
      await this.writeProblems(file, s);
    }
  }

  private async apply(s: FileState, text: string, n: number, last: boolean): Promise<void> {
    const bad = (message: string) => s.lineProblems.push({ severity: "error", message: `line ${n}: ${message}`, hint: "each line must be one complete JSON value: a view, or {\"ops\": [...]}" });
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (e) {
      return void bad(`invalid JSON (${(e as Error).message})`);
    }
    const wait = last; // only the newest line waits for the screen's report
    try {
      const v = (value as { v?: unknown })?.v;
      if (v === 1 || v === 2) {
        const id = v === 2 && typeof (value as { id?: unknown }).id === "string" ? (value as { id: string }).id : s.viewId;
        s.viewId = id;
        s.last = await this.intake.render(value as never, "file", { id, wait });
        return;
      }
      const p = PatchLine.safeParse(value);
      if (!p.success) {
        const i = p.error.issues[0];
        return void bad(`not a view (v: 2) or a patch ({"ops": [...]}): ${i?.path.map(String).join(".") || "(root)"}: ${i?.message ?? ""}`);
      }
      s.last = await this.intake.patch(s.viewId, p.data.ops, "file", p.data.baseVersion, { wait });
    } catch (e) {
      bad((e as Error).message);
    }
  }

  /** After a restart, continue where the last server stopped (recorded in problems.json) instead of replaying the file. */
  private async resume(file: string, s: FileState, ino: number, size: number): Promise<void> {
    try {
      const saved = JSON.parse(await readFile(problemsFile(file), "utf8"));
      const r = saved?.resume;
      if (r && r.ino === ino && typeof r.offset === "number" && r.offset <= size && typeof saved.viewId === "string") {
        Object.assign(s, { ino, offset: r.offset, done: r.offset, line: r.line ?? 0, viewId: saved.viewId });
      }
    } catch {
      // no record: read from the start
    }
  }

  private async writeProblems(file: string, s: FileState): Promise<void> {
    const out = {
      viewId: s.viewId,
      version: s.last?.version ?? 0,
      problems: [...s.lineProblems, ...(s.last?.problems ?? [])],
      resume: { ino: s.ino, offset: s.done, line: s.line },
    };
    await writeFile(problemsFile(file), JSON.stringify(out, null, 2) + "\n").catch(() => {});
  }
}

const problemsFile = (file: string) => file.replace(/\.ndjson$/, ".problems.json");
