import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createDatabase, schema, eq, sql } from "@rotina/db";
import { readConfig, readDatabaseConfig } from "@rotina/config";
import {
  issueInvitation,
  inspectInvitation,
  acceptInvitation,
  revokeInvitation,
  consumeLimit,
  updateOwnProfile,
} from "@rotina/domain";
import { createAuth } from "../apps/web/src/lib/auth";
import type { Email } from "../apps/web/src/lib/email";
const config = readConfig({
  APP_ENV: "local",
  APP_URL: "http://localhost:3000",
  AUTH_SECRET: "test-only-secret-not-for-deployment-123456",
  LOCAL_DB_PATH: "memory://",
});
const { db, close } = createDatabase(config);
const mail: Email[] = [];
const auth = createAuth(db, config, async (m) => {
  mail.push(m);
});
const headers = new Headers({
  origin: config.APP_URL,
  "content-type": "application/json",
});
const owner = randomUUID();
beforeAll(async () => {
  for (const s of readFileSync("packages/db/migrations/0001_access.sql", "utf8")
    .split(";")
    .filter((s) => s.trim()))
    await db.execute(sql.raw(s));
  await db.insert(schema.user).values({
    id: owner,
    name: "Owner",
    email: "owner@example.com",
    emailVerified: true,
  });
  await db
    .insert(schema.profile)
    .values({ userId: owner, role: "owner", onboarded: true });
}, 30000);
afterAll(close);
describe("Environment boundaries", () => {
  it("allows database administration without mail but refuses incomplete runtime", () => {
    const environment = {
      APP_ENV: "staging",
      APP_URL: "https://staging.example.com",
      AUTH_SECRET: config.AUTH_SECRET,
      DATABASE_URL: "postgresql://staging.example.com/db",
      EXPECTED_DATABASE_HOST: "staging.example.com",
    };
    expect(readDatabaseConfig(environment).APP_ENV).toBe("staging");
    expect(() => readConfig(environment)).toThrow("Email provider");
    expect(() =>
      readConfig({
        ...environment,
        RESEND_API_KEY: "test-only",
        EMAIL_FROM: "test@example.com",
      }),
    ).toThrow("allowlist");
  });
  it("rejects hosted local mode", () =>
    expect(() =>
      readConfig({
        ...process.env,
        VERCEL: "1",
        APP_ENV: "local",
        AUTH_SECRET: config.AUTH_SECRET,
      }),
    ).toThrow());
  it("rejects remote databases in local mode", () =>
    expect(() =>
      readConfig({ ...config, DATABASE_URL: "postgresql://example.com/db" }),
    ).toThrow());
  it("requires matching database destination", () =>
    expect(() =>
      readConfig({
        ...config,
        APP_ENV: "staging",
        APP_URL: "https://staging.example.com",
        DATABASE_URL: "postgresql://prod.example.com/db",
        EXPECTED_DATABASE_HOST: "staging.example.com",
      }),
    ).toThrow());
});
describe("Invitations and user isolation", () => {
  it("allows only owner to invite or revoke", async () => {
    await expect(
      issueInvitation(db, "outsider", "x@example.com"),
    ).rejects.toThrow();
    await expect(revokeInvitation(db, "outsider", "x")).rejects.toThrow();
  });
  it("resend invalidates earlier token and revocation blocks acceptance", async () => {
    const a = await issueInvitation(db, owner, "resend@example.com");
    const b = await issueInvitation(db, owner, "resend@example.com");
    expect(await inspectInvitation(db, a.token)).toBeNull();
    await revokeInvitation(db, owner, b.row.id);
    await expect(acceptInvitation(db, b.token)).rejects.toThrow();
  });
  it("does not consume on inspection; accepts once and creates private member", async () => {
    const invite = await issueInvitation(db, owner, "member@example.com");
    expect(await inspectInvitation(db, invite.token)).not.toBeNull();
    expect(await inspectInvitation(db, invite.token)).not.toBeNull();
    await expect(
      acceptInvitation(db, invite.token, "other@example.com"),
    ).rejects.toThrow();
    const u = await acceptInvitation(db, invite.token);
    await expect(acceptInvitation(db, invite.token)).rejects.toThrow();
    const [p] = await db
      .select()
      .from(schema.profile)
      .where(eq(schema.profile.userId, u.id));
    expect(p!.role).toBe("member");
    await expect(issueInvitation(db, u.id, "x@example.com")).rejects.toThrow();
    await updateOwnProfile(db, u.id, {
      name: "Member",
      timezone: "Europe/Lisbon",
    });
    const [o] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, owner));
    expect(o!.name).toBe("Owner");
  });
  it("rejects expired invitations", async () => {
    const i = await issueInvitation(db, owner, "expired@example.com");
    await db
      .update(schema.invitation)
      .set({ expiresAt: new Date(0) })
      .where(eq(schema.invitation.id, i.row.id));
    await expect(acceptInvitation(db, i.token)).rejects.toThrow();
  });
  it("limits repeated operations persistently", async () => {
    expect((await consumeLimit(db, "test", 1)).allowed).toBe(true);
    expect((await consumeLimit(db, "test", 1)).allowed).toBe(false);
  });
});
describe("Better Auth magic links", () => {
  it("issues hashed single-use token, creates session and refuses replay", async () => {
    await auth.api.signInMagicLink({
      body: { email: "owner@example.com" },
      headers,
    });
    const token = new URL(mail.at(-1)!.text.split("\n")[1]!).searchParams.get(
      "token",
    )!;
    const stored = await db.select().from(schema.verification);
    expect(stored.some((v) => v.identifier === token)).toBe(false);
    const result = await auth.api.magicLinkVerify({
      query: { token },
      headers,
      asResponse: true,
    });
    expect(result.ok).toBe(true);
    expect(result.headers.getSetCookie().join("")).toContain("rotina-local");
    const replay = await auth.api.magicLinkVerify({
      query: { token },
      headers,
      asResponse: true,
    });
    expect(replay.ok).toBe(false);
  });
  it("does not self-register unknown users", async () => {
    await auth.api.signInMagicLink({
      body: { email: "unknown@example.com" },
      headers,
    });
    const token = new URL(mail.at(-1)!.text.split("\n")[1]!).searchParams.get(
      "token",
    )!;
    await auth.api.magicLinkVerify({
      query: { token },
      headers,
      asResponse: true,
    });
    const rows = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, "unknown@example.com"));
    expect(rows).toHaveLength(0);
  });
  it("acceptance endpoint sets managed session cookie", async () => {
    const i = await issueInvitation(db, owner, "accepted@example.com");
    const result = await auth.api.acceptRotinaInvitation({
      body: { token: i.token },
      headers,
      asResponse: true,
    });
    expect(result.ok).toBe(true);
    expect(result.headers.getSetCookie().join("")).toContain("HttpOnly");
  });
});
