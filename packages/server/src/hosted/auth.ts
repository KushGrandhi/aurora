import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export const MAX_BODY = 4 * 1024 * 1024;

/** The key from `Authorization: Bearer <key>`, and only from there (never a query string or cookie). */
export function bearer(req: IncomingMessage): string | null {
  const m = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(req.headers.authorization ?? "");
  return m ? m[1]! : null;
}

export class BodyTooLarge extends Error {
  status = 413;
  constructor(maxBytes: number) {
    super(`request body over ${maxBytes} bytes`);
  }
}

/**
 * The whole body, rejecting with BodyTooLarge (413) as soon as it passes `maxBytes`; a declared length over it isn't
 * read at all. On rejection the request is left paused (not destroyed), so the 413 can still be written; the caller
 * answers with `connection: close` so the rest is never read.
 */
export function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  if (Number(req.headers["content-length"]) > maxBytes) return Promise.reject(new BodyTooLarge(maxBytes));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const done = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
    };
    const onData = (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        done();
        req.pause();
        reject(new BodyTooLarge(maxBytes));
        return;
      }
      chunks.push(c);
    };
    const onEnd = () => {
      done();
      resolve(Buffer.concat(chunks));
    };
    const onError = (e: Error) => {
      done();
      reject(e);
    };
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}

/** Constant-time string equality (hashing first makes the lengths equal). */
export function sameSecret(given: unknown, want: string): boolean {
  if (typeof given !== "string") return false;
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(given), h(want));
}
