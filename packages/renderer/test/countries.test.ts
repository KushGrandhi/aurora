import { expect, test } from "vitest";
import { countryFeatures, countryKey } from "../src/countries.ts";

test("countryKey", () => {
  expect(countryKey("USA")).toBe("840");
  expect(countryKey("de")).toBe("276");
  expect(countryKey("France")).toBe("250");
  expect(countryKey("france")).toBe("250");
  expect(countryKey("76")).toBe("076");
  expect(countryKey("Atlantis")).toBeUndefined();
});

test("countryFeatures has named countries", () => {
  const fc = countryFeatures();
  expect(fc.features.length).toBeGreaterThan(170);
  expect(fc.features.every((f) => typeof f.properties?.name === "string" && f.properties.name.length > 0)).toBe(true);
  expect(fc.features.find((f) => f.id === "250")?.properties?.name).toBe("France");
});
