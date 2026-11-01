import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

export type Db = { conn: DuckDBConnection; close(): Promise<void> };

export async function openDb(): Promise<Db> {
  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  return {
    conn,
    async close() {
      conn.closeSync();
      instance.closeSync();
    },
  };
}
