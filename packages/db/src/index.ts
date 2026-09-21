import { Pool } from "pg";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { drizzle as postgres } from "drizzle-orm/node-postgres";
import { drizzle as local } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import type { Config } from "@rotina/config";
import * as schema from "./schema.ts";
export { schema };
export function createDatabase(c: Config) {
  if (c.APP_ENV === "local") {
    if (c.LOCAL_DB_PATH !== "memory://")
      mkdirSync(dirname(resolve(c.LOCAL_DB_PATH)), { recursive: true });
    const client = new PGlite(c.LOCAL_DB_PATH);
    return { db: local(client, { schema }), close: () => client.close() };
  }
  const client = new Pool({ connectionString: c.DATABASE_URL, max: 3 });
  return { db: postgres(client, { schema }), close: () => client.end() };
}
export type Database = ReturnType<typeof createDatabase>["db"];
export { and, eq, gt, isNull, sql } from "drizzle-orm";
