import { expect, test } from "vitest";
import { applyOps, paramDefaults, paramVars, sqlVars, validateParamValue, type Param, type View } from "../src/index.ts";

const sel: Param = { type: "select", label: "Region", options: ["East", "West"] };
const rng: Param = { type: "range", label: "Price", min: 0, max: 10 };
const dr: Param = { type: "daterange", label: "When" };
const srch: Param = { type: "search", label: "Find" };

test("paramVars names", () => {
  expect(paramVars("region", sel)).toEqual(["region"]);
  expect(paramVars("q", srch)).toEqual(["q"]);
  expect(paramVars("price", rng)).toEqual(["price_min", "price_max"]);
  expect(paramVars("when", dr)).toEqual(["when_from", "when_to"]);
});

test("defaults", () => {
  expect(paramDefaults({ region: sel })).toEqual({ region: null });
  expect(paramDefaults({ price: rng })).toEqual({ price_min: 0, price_max: 10 });
  expect(paramDefaults({ when: dr, q: srch })).toEqual({ when_from: null, when_to: null, q: "" });
  expect(paramDefaults({ region: { ...sel, default: "West" } })).toEqual({ region: "West" });
});

test("validateParamValue rejects bad values", () => {
  const bad = (p: Param, v: unknown, o?: string[]) => {
    const r = validateParamValue("x", p, v, o);
    expect(r.ok, JSON.stringify(v)).toBe(false);
    if (!r.ok) expect(r.message.length).toBeGreaterThan(0);
  };
  bad(sel, "North");
  bad(rng, [5, 2]);
  bad(rng, [0, 99]);
  bad(srch, "x".repeat(201));
  bad(dr, ["not-a-date", null]);
  expect(validateParamValue("q", srch, "'; DROP TABLE data; --")).toEqual({ ok: true, vars: { q: "'; DROP TABLE data; --" } });
  expect(validateParamValue("region", sel, null)).toEqual({ ok: true, vars: { region: null } });
  expect(validateParamValue("region", { type: "select", label: "R", options: { query: "regions", field: "region" } }, "East", ["East"]).ok).toBe(true);
  expect(validateParamValue("price", rng, [2, 5])).toEqual({ ok: true, vars: { price_min: 2, price_max: 5 } });
  expect(validateParamValue("when", dr, ["2026-01-01", null])).toEqual({ ok: true, vars: { when_from: "2026-01-01", when_to: null } });
});

test("sqlVars ignores literals", () => {
  expect(sqlVars("SELECT '$no' , $yes FROM t WHERE x = $r_min")).toEqual(["yes", "r_min"]);
  expect(sqlVars("SELECT $a, $a FROM t")).toEqual(["a"]);
});

const view = (): View => ({ v: 2, id: "v", title: "T", sections: [{ id: "s", layout: "grid", items: [] }] });

test("addParam and removeParam ops", () => {
  const a = applyOps(view(), [{ op: "addParam", name: "region", param: sel }]);
  expect(a.ok && a.view.params).toEqual({ region: sel });
  if (!a.ok) return;
  const b = applyOps(a.view, [{ op: "addParam", name: "region", param: srch }]);
  expect(b.ok && b.view.params?.region).toEqual(srch);
  const c = applyOps(a.view, [{ op: "removeParam", name: "region" }]);
  expect(c.ok && c.view.params).toEqual({});
});

test("removeParam unknown is rejected atomically", () => {
  const r = applyOps(view(), [{ op: "set", title: "New" }, { op: "removeParam", name: "nope" }]);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.problem.message).toContain("nope");
});
