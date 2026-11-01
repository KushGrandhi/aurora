import { expect, test } from "vitest";
import { formatValue, humanizeField, inferFormat } from "../src/index.ts";

test("formats sizes with human units", () => {
  expect(formatValue(14460.11, "megabytes")).toBe("14.5 GB");
  expect(formatValue(54.08, "megabytes")).toBe("54.1 MB");
  expect(formatValue(2048, "bytes")).toBe("2 KB");
  expect(formatValue(0.5, "gigabytes")).toBe("500 MB");
});

test("infers format from column names", () => {
  expect(inferFormat("source_mb")).toBe("megabytes");
  expect(inferFormat("size_bytes")).toBe("bytes");
  expect(inferFormat("total_revenue")).toBe("currency");
  expect(inferFormat("failure_rate")).toBe("percent");
  expect(inferFormat("files")).toBe("integer");
  expect(inferFormat("main_language")).toBeUndefined();
  expect(inferFormat("v")).toBeUndefined();
});

test("humanizes field names", () => {
  expect(humanizeField("source_mb")).toBe("Source");
  expect(humanizeField("source_mb", true)).toBe("Source (MB)");
  expect(humanizeField("main_language")).toBe("Main language");
  expect(humanizeField("Order Date")).toBe("Order Date");
});
