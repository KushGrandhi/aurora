import { expect, test } from "vitest";
import { loadHostedConfig } from "../src/hosted/config.ts";
import { mintKey, newWorkspaceId, verifyKey } from "../src/hosted/keys.ts";

const S = "0123456789abcdef0123456789abcdef01234567";

test("keys verify to their workspace; tampered or foreign-secret ones don't", () => {
  const k = mintKey(S, "abcdefgh12345678");
  expect(verifyKey(S, k)).toEqual({ ws: "abcdefgh12345678" });
  expect(verifyKey(S + "x", k)).toBeNull();
  expect(verifyKey(S, k.slice(0, -2) + "aa")).toBeNull();
  expect(verifyKey(S, "not.a.jwt")).toBeNull();
  expect(newWorkspaceId()).toMatch(/^[a-z0-9]{16}$/);
});
test("hosted config: off by default; requires secret, public url and invite", () => {
  expect(loadHostedConfig({})).toBeUndefined();
  expect(() => loadHostedConfig({ AURORA_MODE: "hosted", AURORA_SECRET: S, AURORA_PUBLIC_URL: "https://a.example" })).toThrow(/AURORA_INVITE/);
  expect(() => loadHostedConfig({ AURORA_MODE: "hosted", AURORA_SECRET: "short", AURORA_PUBLIC_URL: "https://a.example", AURORA_INVITE: "i" })).toThrow(/AURORA_SECRET/);
  expect(loadHostedConfig({ AURORA_MODE: "hosted", AURORA_SECRET: S, AURORA_PUBLIC_URL: "https://a.example", AURORA_INVITE: "i" })).toEqual({ secret: S, publicUrl: "https://a.example", dataDir: "/data", invite: "i" });
});
