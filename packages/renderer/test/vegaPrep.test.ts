import { expect, test } from "vitest";
import { prepareVegaLite } from "../src/vegaPrep.ts";

test("vertical category bars flip to sorted horizontal bars", () => {
  const out: any = prepareVegaLite({ mark: "bar", encoding: { x: { field: "main_language", type: "nominal" }, y: { field: "source_mb", type: "quantitative" } } });
  expect(out.encoding.y).toMatchObject({ field: "main_language", type: "nominal", sort: "-x" });
  expect(out.encoding.x).toMatchObject({ field: "source_mb", type: "quantitative" });
});

test("temporal bars stay vertical", () => {
  const out: any = prepareVegaLite({ mark: "bar", encoding: { x: { field: "month", type: "temporal" }, y: { field: "n", type: "quantitative" } } });
  expect(out.encoding.x.field).toBe("month");
});

test("axis titles are humanized and size axes get unit labels", () => {
  const out: any = prepareVegaLite({ mark: "line", encoding: { x: { field: "order_date", type: "temporal" }, y: { field: "source_mb", type: "quantitative" } } });
  expect(out.encoding.x.title).toBe("Order date");
  expect(out.encoding.y.title).toBe("Source");
  expect(out.encoding.y.axis.labelExpr).toContain("1000000");
});

test("money axes use compact currency", () => {
  const out: any = prepareVegaLite({ mark: "bar", encoding: { x: { field: "region", type: "nominal" }, y: { field: "revenue", type: "quantitative" } } });
  expect(out.encoding.x.axis.format).toBe("$~s");
});

test("explicit titles are kept and input is not mutated", () => {
  const input = { mark: "line", encoding: { y: { field: "v", type: "quantitative", title: "Revenue" } } };
  const out: any = prepareVegaLite(input);
  expect(out.encoding.y.title).toBe("Revenue");
  expect((input.encoding.y as any).axis).toBeUndefined();
});

test("tooltips are on by default", () => {
  const out: any = prepareVegaLite({ mark: "bar", encoding: {} });
  expect(out.mark).toMatchObject({ type: "bar", tooltip: true });
});

test("count axes get whole-number ticks and the category axis drops its title", () => {
  const out: any = prepareVegaLite({ mark: "bar", encoding: { y: { field: "main_language", type: "nominal" }, x: { aggregate: "count", type: "quantitative" } } });
  expect(out.encoding.x.axis).toMatchObject({ tickMinStep: 1, format: "~s" });
  expect(out.encoding.y.title).toBeNull();
});

test("integer-named fields get whole-number ticks", () => {
  const out: any = prepareVegaLite({ mark: "line", encoding: { x: { field: "day", type: "temporal" }, y: { field: "files", type: "quantitative" } } });
  expect(out.encoding.y.axis).toMatchObject({ tickMinStep: 1 });
});

test("date strings encoded as quantitative become temporal, and date-length bars become dots", () => {
  const rows = [{ project: "genui", last_modified: "2026-10-31" }, { project: "rea", last_modified: "2026-10-17" }];
  const out: any = prepareVegaLite({ mark: "bar", encoding: { y: { field: "project", type: "nominal" }, x: { field: "last_modified", type: "quantitative" } } }, rows);
  expect(out.encoding.x.type).toBe("temporal");
  expect(out.mark.type).toBe("point");
});

test("text encoded as quantitative becomes nominal", () => {
  const out: any = prepareVegaLite({ mark: "line", encoding: { x: { field: "name", type: "quantitative" }, y: { field: "n", type: "quantitative" } } }, [{ name: "a", n: 1 }]);
  expect(out.encoding.x.type).toBe("nominal");
});

test("date dot plots run horizontally, newest first", () => {
  const rows = [{ project: "genui", last_modified: "2026-10-31" }];
  const out: any = prepareVegaLite({ mark: "bar", encoding: { x: { field: "project", type: "nominal" }, y: { field: "last_modified", type: "quantitative" } } }, rows);
  expect(out.mark.type).toBe("point");
  expect(out.encoding.y).toMatchObject({ field: "project", sort: "-x" });
  expect(out.encoding.x).toMatchObject({ field: "last_modified", type: "temporal", scale: { zero: false, nice: true } });
});
