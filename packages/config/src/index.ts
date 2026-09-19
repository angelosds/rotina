import { z } from "zod";
const schema = z.object({
  APP_ENV: z
    .enum(["local", "preview", "staging", "production"])
    .default("local"),
  APP_URL: z.url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(32),
  DATABASE_URL: z.string().optional(),
  EXPECTED_DATABASE_HOST: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  TEST_EMAIL_ALLOWLIST: z.string().default(""),
  LOCAL_DB_PATH: z.string().default(".local/database"),
});
export function readDatabaseConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const c = schema.parse(env);
  const url = new URL(c.APP_URL);
  if (c.APP_ENV === "local") {
    if (env.VERCEL || !["localhost", "127.0.0.1"].includes(url.hostname))
      throw Error("Local mode requires localhost and cannot run on Vercel");
    if (c.DATABASE_URL)
      throw Error(
        "Local mode uses its own local database, never a hosted database",
      );
  } else {
    if (url.protocol !== "https:") throw Error("Hosted origin must use HTTPS");
    if (!c.DATABASE_URL || !c.EXPECTED_DATABASE_HOST)
      throw Error("A dedicated database and expected host are required");
    const db = new URL(c.DATABASE_URL);
    if (db.hostname !== c.EXPECTED_DATABASE_HOST)
      throw Error("Database host does not match environment");
  }
  return c;
}
export function readConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const c = readDatabaseConfig(env);
  if (c.APP_ENV !== "local") {
    if (!c.RESEND_API_KEY || !c.EMAIL_FROM)
      throw Error("Email provider configuration is required");
    if (c.APP_ENV !== "production" && !c.TEST_EMAIL_ALLOWLIST.trim())
      throw Error(
        "Non-production email requires an explicit recipient allowlist",
      );
  }
  return c;
}
export type Config = ReturnType<typeof readConfig>;
