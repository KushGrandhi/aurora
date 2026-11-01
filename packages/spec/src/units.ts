import type { Format } from "./spec.ts";

const UNIT_SUFFIX: [RegExp, Format, string][] = [
  [/(^|_)bytes$/i, "bytes", "bytes"],
  [/_kb$/i, "kilobytes", "KB"],
  [/_mb$/i, "megabytes", "MB"],
  [/_gb$/i, "gigabytes", "GB"],
];
const MONEY = /(^|_)(revenue|price|cost|costs|spend|spent|usd|eur|salary|income|profit|sales|amount|budget|fee|fees|paid|payment|payments|gmv|arr|mrr)(_|$)/i;
const PERCENT = /(^|_)(pct|percent|percentage|rate|ratio|share)(_|$)/i;
const INTEGER = /(^|_)(count|files|rows|n|num|qty|quantity|units|users|items|events)(_|$)/i;

/** Format implied by a column name, if any. Units beat everything; money only when the name says money. */
export function inferFormat(field: string): Format | undefined {
  for (const [re, f] of UNIT_SUFFIX) if (re.test(field)) return f;
  if (MONEY.test(field)) return "currency";
  if (PERCENT.test(field)) return "percent";
  if (INTEGER.test(field)) return "integer";
  return undefined;
}

export const isSizeFormat = (f: Format | undefined) => f === "bytes" || f === "kilobytes" || f === "megabytes" || f === "gigabytes";

/** "source_mb" → "Source" (or "Source (MB)" with keepUnit). Names that aren't snake_case are left alone. */
export function humanizeField(field: string, keepUnit = false): string {
  if (!/^[a-z0-9_]+$/.test(field)) return field;
  let unit = "";
  let base = field;
  for (const [re, , label] of UNIT_SUFFIX) {
    if (re.test(field)) {
      base = field.replace(re, "");
      unit = label;
      break;
    }
  }
  const words = base.split("_").filter(Boolean).join(" ");
  const text = words.charAt(0).toUpperCase() + words.slice(1);
  return keepUnit && unit ? `${text} (${unit})` : text;
}
