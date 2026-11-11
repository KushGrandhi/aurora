import { createHash, randomBytes } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif",
  ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".m4v": "video/x-m4v", ".ogg": "video/ogg",
};

type Entry = { given: string; real: string };

/**
 * Serves local images and videos that accepted views reference, at unguessable token URLs. Nothing else is
 * readable: a token exists only after `register`, and every request re-checks the path still resolves to the
 * file that was registered.
 */
export class MediaRegistry {
  private secret: string;
  private entries = new Map<string, Entry>();
  /** Hosted: no local file is ever served; views show media from http(s) URLs only. */
  readonly remoteOnly: boolean;

  constructor(opts: { secretFile: string; remoteOnly?: boolean }) {
    this.remoteOnly = opts.remoteOnly ?? false;
    if (this.remoteOnly) {
      this.secret = "";
      return;
    }
    if (!existsSync(opts.secretFile)) {
      mkdirSync(path.dirname(opts.secretFile), { recursive: true });
      try {
        writeFileSync(opts.secretFile, randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; // another process created it first
      }
    }
    this.secret = readFileSync(opts.secretFile, "utf8").trim();
  }

  /** `/media/<token>` for an absolute path to a supported image or video, or null. */
  register(absPath: string): string | null {
    if (this.remoteOnly) return null;
    if (!path.isAbsolute(absPath)) return null;
    let real: string;
    try {
      real = realpathSync(absPath);
      if (!statSync(real).isFile()) return null;
    } catch {
      return null;
    }
    if (!TYPES[path.extname(real).toLowerCase()]) return null;
    const token = createHash("sha256").update(this.secret + real).digest("hex").slice(0, 32);
    this.entries.set(token, { given: absPath, real });
    return `/media/${token}`;
  }

  /** Writes the file (or a byte range of it) and returns true; false means the caller answers 404. */
  async serve(token: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (!/^[0-9a-f]{32}$/.test(token)) return false;
    const e = this.entries.get(token);
    if (!e) return false;
    let size: number;
    try {
      if (realpathSync(e.given) !== e.real) return false;
      const st = statSync(e.real);
      if (!st.isFile()) return false;
      size = st.size;
    } catch {
      return false;
    }
    const type = TYPES[path.extname(e.real).toLowerCase()];
    const headers: Record<string, string> = {
      "content-type": type,
      "accept-ranges": "bytes",
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=300",
    };
    if (type === "image/svg+xml") headers["content-security-policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

    const range = req.headers.range;
    if (range) {
      const r = parseRange(range, size);
      if (!r) {
        res.writeHead(416, { "content-range": `bytes */${size}` });
        res.end();
        return true;
      }
      res.writeHead(206, { ...headers, "content-range": `bytes ${r.start}-${r.end}/${size}`, "content-length": String(r.end - r.start + 1) });
      await pipe(e.real, res, r);
      return true;
    }
    res.writeHead(200, { ...headers, "content-length": String(size) });
    await pipe(e.real, res);
    return true;
  }
}

function parseRange(header: string, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start <= end && start < size ? { start, end } : null;
}

function pipe(file: string, res: ServerResponse, range?: { start: number; end: number }): Promise<void> {
  return new Promise((resolve) => {
    const s = createReadStream(file, range);
    s.on("error", () => { res.destroy(); resolve(); });
    s.on("end", () => resolve());
    s.pipe(res);
  });
}
