import { registerComponent, getComponent, type ComponentDef } from "../registry.ts";
import { kpi } from "./kpi.ts";
import { chart } from "./chart.ts";
import { table } from "./table.ts";
import { text } from "./text.ts";
import { json } from "./json.ts";

for (const def of [kpi, chart, table, text, json] as ComponentDef[]) if (!getComponent(def.type)) registerComponent(def);

export * from "./kpi.ts";
export * from "./chart.ts";
export * from "./table.ts";
export * from "./text.ts";
export * from "./json.ts";
