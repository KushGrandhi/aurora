import { expect, test } from "vitest";
import { diffLineKind, highlight } from "../src/engines/highlight.ts";

test("diffLineKind", () => {
  expect(diffLineKind("+added")).toBe("add");
  expect(diffLineKind("-removed")).toBe("del");
  expect(diffLineKind("@@ -1,3 +1,4 @@")).toBe("hunk");
  expect(diffLineKind("diff --git a/x b/x")).toBe("meta");
  expect(diffLineKind("index 83db48f..bf269f4 100644")).toBe("meta");
  expect(diffLineKind("+++ b/x")).toBe("meta");
  expect(diffLineKind("--- a/x")).toBe("meta");
  expect(diffLineKind(" unchanged")).toBe("ctx");
  expect(diffLineKind("")).toBe("ctx");
});

test("highlight produces spans", async () => {
  const html = await highlight("const a = 1", "ts", "light");
  expect(html).toContain("<span");
  expect(html).toContain("const");
}, 20_000);

test("unknown language falls back to text", async () => {
  const html = await highlight("whatever <b>", "nonsense", "dark");
  expect(html).toContain("whatever");
  expect(html).not.toContain("<b>");
  expect(await highlight("x", undefined, "light")).toContain("x");
}, 20_000);
