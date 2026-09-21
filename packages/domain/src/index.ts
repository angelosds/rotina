import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { type Database, schema, eq, and, gt, isNull, sql } from "@rotina/db";
export * from "./finance";
export { AccessError } from "./errors";
import { AccessError } from "./errors";
export const emailSchema = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function requireOwner(db: Database, userId: string) {
  const [p] = await db
    .select()
    .from(schema.profile)
    .where(eq(schema.profile.userId, userId));
  if (p?.role !== "owner" || p.suspendedAt)
    throw new AccessError("Acesso restrito ao proprietário.");
}
export async function updateMemberAccess(
  db: Database,
  actor: string,
  memberId: string,
  suspended: boolean,
) {
  await requireOwner(db, actor);
  if (actor === memberId)
    throw new AccessError("O proprietário não pode suspender o próprio acesso.");
  return db.transaction(async (tx) => {
    const [member] = await tx
      .update(schema.profile)
      .set({ suspendedAt: suspended ? new Date() : null })
      .where(
        and(
          eq(schema.profile.userId, memberId),
          eq(schema.profile.role, "member"),
        ),
      )
      .returning();
    if (!member) throw new AccessError("Membro não encontrado.");
    if (suspended)
      await tx
        .delete(schema.session)
        .where(eq(schema.session.userId, memberId));
    return member;
  });
}
export async function consumeLimit(
  db: Database,
  key: string,
  limit = 3,
  seconds = 60,
) {
  const now = new Date();
  const end = new Date(now.getTime() + seconds * 1000);
  const [r] = await db
    .insert(schema.throttle)
    .values({ key: hash(key), count: 1, expiresAt: end })
    .onConflictDoUpdate({
      target: schema.throttle.key,
      set: {
        count: sql`case when ${schema.throttle.expiresAt} <= ${now} then 1 else ${schema.throttle.count}+1 end`,
        expiresAt: sql`case when ${schema.throttle.expiresAt} <= ${now} then ${end} else ${schema.throttle.expiresAt} end`,
      },
    })
    .returning();
  return {
    allowed: r!.count <= limit,
    retryAfter: Math.max(
      1,
      Math.ceil((r!.expiresAt.getTime() - now.getTime()) / 1000),
    ),
  };
}
export async function issueInvitation(
  db: Database,
  actor: string,
  email: string,
) {
  await requireOwner(db, actor);
  email = emailSchema.parse(email);
  const [existing] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email));
  if (existing) throw new AccessError("Essa pessoa já tem acesso.");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hash(token);
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  const [row] = await db
    .insert(schema.invitation)
    .values({ id: randomUUID(), email, tokenHash, inviterId: actor, expiresAt })
    .onConflictDoUpdate({
      target: schema.invitation.email,
      set: {
        tokenHash,
        inviterId: actor,
        expiresAt,
        acceptedAt: null,
        revokedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return { row: row!, token };
}
export async function inspectInvitation(db: Database, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [r] = await db
    .select()
    .from(schema.invitation)
    .where(
      and(
        eq(schema.invitation.tokenHash, hash(token)),
        gt(schema.invitation.expiresAt, new Date()),
        isNull(schema.invitation.acceptedAt),
        isNull(schema.invitation.revokedAt),
      ),
    );
  return r ?? null;
}
export async function acceptInvitation(
  db: Database,
  token: string,
  currentEmail?: string,
) {
  const invite = await inspectInvitation(db, token);
  if (!invite) throw new AccessError("Convite expirado, usado ou revogado.");
  if (currentEmail && currentEmail !== invite.email)
    throw new AccessError("Saia da conta atual para aceitar este convite.");
  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(schema.invitation)
      .set({ acceptedAt: new Date() })
      .where(
        and(
          eq(schema.invitation.id, invite.id),
          eq(schema.invitation.tokenHash, hash(token)),
          isNull(schema.invitation.acceptedAt),
          isNull(schema.invitation.revokedAt),
          gt(schema.invitation.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!claimed) throw new AccessError("Convite expirado, usado ou revogado.");
    const [u] = await tx
      .insert(schema.user)
      .values({
        id: randomUUID(),
        email: claimed.email,
        name: "",
        emailVerified: true,
      })
      .onConflictDoNothing()
      .returning();
    if (!u)
      throw new AccessError(
        "Essa pessoa já tem acesso. Entre pelo seu e-mail.",
      );
    await tx.insert(schema.profile).values({ userId: u.id });
    return u;
  });
}
export async function revokeInvitation(
  db: Database,
  actor: string,
  id: string,
) {
  await requireOwner(db, actor);
  await db
    .update(schema.invitation)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(schema.invitation.id, id), isNull(schema.invitation.acceptedAt)),
    );
}
export async function updateOwnProfile(
  db: Database,
  userId: string,
  input: { name: string; timezone: string },
) {
  const name = z.string().trim().min(1).max(80).parse(input.name);
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: input.timezone });
  } catch {
    throw new AccessError("Escolha um fuso válido.");
  }
  await db.transaction(async (tx) => {
    await tx
      .update(schema.user)
      .set({ name, updatedAt: new Date() })
      .where(eq(schema.user.id, userId));
    await tx
      .update(schema.profile)
      .set({ timezone: input.timezone, onboarded: true })
      .where(eq(schema.profile.userId, userId));
  });
}
