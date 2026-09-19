import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { runtime } from "./runtime";
import { eq, schema } from "@rotina/db";
export async function currentSession() {
  const h = await headers();
  return runtime().auth.api.getSession({ headers: h });
}
export async function requireUser() {
  const s = await currentSession();
  if (!s) redirect("/entrar");
  const [p] = await runtime()
    .db.select()
    .from(schema.profile)
    .where(eq(schema.profile.userId, s.user.id));
  if (!p) redirect("/entrar?error=access");
  return { ...s, profile: p };
}
