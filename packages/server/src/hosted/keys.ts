import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");
const sign = (secret: string, input: string) => createHmac("sha256", secret).update(input).digest();

/** A fresh 16-char [a-z0-9] workspace id. */
export function newWorkspaceId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(randomBytes(16), (b) => alphabet[b % alphabet.length]).join("");
}

/** Stateless workspace key: an HS256 JWT whose `ws` claim names the workspace. */
export function mintKey(secret: string, ws: string = newWorkspaceId()): string {
  const input = `${b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64(JSON.stringify({ ws, iat: Math.floor(Date.now() / 1000) }))}`;
  return `${input}.${b64(sign(secret, input))}`;
}

export function verifyKey(secret: string, token: string): { ws: string } | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  try {
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
    if (header?.alg !== "HS256") return null;
    const given = Buffer.from(s, "base64url");
    const want = sign(secret, `${h}.${p}`);
    if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
    const ws = JSON.parse(Buffer.from(p, "base64url").toString("utf8"))?.ws;
    return typeof ws === "string" && ws ? { ws } : null;
  } catch {
    return null;
  }
}
