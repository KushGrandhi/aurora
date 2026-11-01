import { useMemo, useRef, useState } from "react";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { humanizeField, inferFormat, type Component, type Format, type QueryResult } from "@aurora/spec";
import { formatValue } from "../format.ts";

type TableC = Extract<Component, { type: "table" }>;
type Row = Record<string, unknown>;
const NUMERIC = /INT|DOUBLE|FLOAT|DECIMAL|REAL/;

function cell(v: unknown, type: string, fmt: Format | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "number" && NUMERIC.test(type)) return formatValue(v, fmt === "percent" && Math.abs(v) > 1 ? undefined : fmt);
  if (type.startsWith("TIMESTAMP") && typeof v === "string") {
    const [d, t = ""] = v.split("T");
    return t.startsWith("00:00:00") ? d : `${d} ${t.slice(0, 5)}`;
  }
  return String(v);
}

export function Table({ c, result }: { c: TableC; result: QueryResult }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const cols = useMemo<ColumnDef<Row>[]>(() => {
    const wanted = c.columns?.length ? result.columns.filter((x) => c.columns!.includes(x.name)) : result.columns;
    return wanted.map((col) => {
      const numeric = NUMERIC.test(col.type) && !col.type.startsWith("INTERVAL");
      const fmt = inferFormat(col.name);
      return {
        id: col.name,
        header: humanizeField(col.name),
        accessorFn: (r: Row) => r[col.name],
        cell: (info) => cell(info.getValue(), col.type, numeric ? fmt : undefined),
        meta: { numeric },
      };
    });
  }, [c.columns, result.columns]);
  const table = useReactTable({ data: result.rows, columns: cols, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => 33, overscan: 12 });
  const items = virt.getVirtualItems();
  const padTop = items[0]?.start ?? 0;
  const padBottom = items.length ? virt.getTotalSize() - items[items.length - 1].end : 0;

  return (
    <>
      {c.title && <div className="card-title">{c.title}</div>}
      <div className="table-wrap" ref={scrollRef}>
        <table>
          <thead>
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                {g.headers.map((h) => (
                  <th key={h.id} onClick={h.column.getToggleSortingHandler()}
                    className={(h.column.columnDef.meta as { numeric?: boolean })?.numeric ? "num" : undefined}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {{ asc: " ↑", desc: " ↓" }[h.column.getIsSorted() as string] ?? ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {padTop > 0 && <tr style={{ height: padTop }} />}
            {items.map((vi) => {
              const r = rows[vi.index];
              return (
                <tr key={r.id}>
                  {r.getVisibleCells().map((cl) => (
                    <td key={cl.id} className={(cl.column.columnDef.meta as { numeric?: boolean })?.numeric ? "num" : undefined}>
                      {flexRender(cl.column.columnDef.cell, cl.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
            {padBottom > 0 && <tr style={{ height: padBottom }} />}
          </tbody>
        </table>
      </div>
      <div className="note">{result.truncated ? `Showing first ${formatValue(result.rows.length, "integer")} rows` : `${formatValue(result.rows.length, "integer")} ${result.rows.length === 1 ? "row" : "rows"}`}</div>
    </>
  );
}

export default function TableRenderer({ c, ctx }: { c: TableC; ctx: import("../registry.tsx").RenderCtx }) {
  return <Table c={c} result={ctx.results[c.query]} />;
}
