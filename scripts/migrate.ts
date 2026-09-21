import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readDatabaseConfig } from "@rotina/config";
import { createDatabase, sql } from "@rotina/db";
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = resolve(repositoryRoot, "packages/db/migrations");
try {
  process.loadEnvFile(resolve(repositoryRoot, "apps/web/.env.local"));
} catch {
  /* Hosted pipeline supplies environment directly. */
}
const c = readDatabaseConfig();
if (process.env.MIGRATE_ENV !== c.APP_ENV)
  throw Error("Set MIGRATE_ENV to the exact APP_ENV before migrating");
if (c.APP_ENV === "local")
  c.LOCAL_DB_PATH = resolve(repositoryRoot, "apps/web", c.LOCAL_DB_PATH);
const { db, close } = createDatabase(c);
try {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(271818)`);
    await tx.execute(
      sql`create table if not exists app_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())`,
    );
    for (const name of readdirSync(migrationsDirectory)
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const content = readFileSync(
        resolve(migrationsDirectory, name),
        "utf8",
      );
      const checksum = createHash("sha256").update(content).digest("hex");
      const result = await tx.execute(
        sql`select checksum from app_migrations where name=${name}`,
      );
      const rows = result.rows as { checksum: string }[];
      if (rows[0]) {
        if (rows[0].checksum !== checksum)
          throw Error("Applied migration was changed");
        continue;
      }
      // Migration source is versioned, never supplied by a user.
      for (const statement of content.split(";").filter((s) => s.trim()))
        await tx.execute(sql.raw(statement));
      await tx.execute(
        sql`insert into app_migrations(name,checksum) values(${name},${checksum})`,
      );
      console.log("Applied", name);
    }
  });
} finally {
  await close();
}
