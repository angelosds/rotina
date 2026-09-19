import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { readConfig } from "@rotina/config";
import { createDatabase, schema, eq } from "@rotina/db";
import { emailSchema } from "@rotina/domain";
try {
  process.loadEnvFile("apps/web/.env.local");
} catch {
  /* Hosted pipeline supplies environment directly. */
}
const c = readConfig();
if (c.APP_ENV === "local")
  c.LOCAL_DB_PATH = resolve("apps/web", c.LOCAL_DB_PATH);
if (process.env.BOOTSTRAP_ENV !== c.APP_ENV)
  throw Error("Set BOOTSTRAP_ENV explicitly");
const email = emailSchema.parse(process.env.OWNER_EMAIL);
const { db, close } = createDatabase(c);
try {
  await db.transaction(async (tx) => {
    const [owner] = await tx
      .select()
      .from(schema.profile)
      .where(eq(schema.profile.role, "owner"));
    if (owner) throw Error("Owner already exists. No changes made.");
    const [u] = await tx
      .insert(schema.user)
      .values({ id: randomUUID(), name: "Angelo", email, emailVerified: false })
      .returning();
    await tx.insert(schema.profile).values({ userId: u!.id, role: "owner" });
  });
  console.log(
    "Owner provisioned; email verification is required before access.",
  );
} finally {
  await close();
}
