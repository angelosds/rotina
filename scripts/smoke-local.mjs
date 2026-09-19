import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

// Exercises only the local server. No email is transmitted to a provider.
process.loadEnvFile("apps/web/.env.local");
assert.equal(process.env.APP_ENV, "local");
const origin = process.env.APP_URL;
assert.equal(new URL(origin).hostname, "localhost");
const ownerEmail = process.env.OWNER_EMAIL;
assert.ok(ownerEmail, "Set OWNER_EMAIL for the local owner");
const mailDir = resolve("apps/web", process.env.LOCAL_DB_PATH, "..", "mail");
async function post(action, body, cookie = "", requestOrigin = origin) {
  return fetch(`${origin}/api/access/${action}`, {
    method: "POST",
    headers: {
      origin: requestOrigin,
      "content-type": "application/json",
      cookie,
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
}
async function latestToken(email) {
  const files = await Promise.all(
    (await readdir(mailDir)).map(async (name) => ({
      name,
      mtime: (await stat(resolve(mailDir, name))).mtimeMs,
    })),
  );
  for (const file of files.sort((a, b) => b.mtime - a.mtime)) {
    const mail = JSON.parse(
      await readFile(resolve(mailDir, file.name), "utf8"),
    );
    if (mail.to === email)
      return new URL(
        mail.text.match(/http:\/\/localhost:3000\/[^\s]+/)[0],
      ).searchParams.get("token");
  }
  throw Error("Local email missing");
}
const cookies = (response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
assert.equal(
  (await post("login", { email: ownerEmail }, "", "https://untrusted.example"))
    .status,
  403,
);
assert.equal(
  (await post("invite", { email: "nobody@example.com" })).status,
  401,
);
assert.equal((await post("login", { email: ownerEmail })).status, 200);
const loginToken = await latestToken(ownerEmail);
// GET must not consume the login token.
assert.equal(
  (await fetch(`${origin}/entrar/confirmar?token=${loginToken}`)).status,
  200,
);
const login = await post("confirm", { token: loginToken });
assert.equal(login.status, 200);
const ownerCookie = cookies(login);
assert.ok(ownerCookie);
assert.equal((await post("confirm", { token: loginToken })).status, 400);
const memberEmail = `smoke-${Date.now()}@example.com`;
assert.equal(
  (await post("invite", { email: memberEmail }, ownerCookie)).status,
  200,
);
const inviteToken = await latestToken(memberEmail);
assert.equal(
  (await fetch(`${origin}/convite?token=${inviteToken}`)).status,
  200,
);
assert.equal(
  (await post("accept", { token: inviteToken }, ownerCookie)).status,
  400,
);
const signedOut = await post(
  "signout",
  { invitationToken: inviteToken },
  ownerCookie,
);
assert.equal(
  (await signedOut.json()).redirect,
  `/convite?token=${inviteToken}`,
);
const accepted = await post("accept", { token: inviteToken });
assert.equal(accepted.status, 200);
const memberCookie = cookies(accepted);
assert.ok(memberCookie);
assert.equal((await post("accept", { token: inviteToken })).status, 400);
assert.equal(
  (await post("invite", { email: "outsider@example.com" }, memberCookie))
    .status,
  400,
);
assert.equal(
  (
    await fetch(`${origin}/configuracoes/convites`, {
      headers: { cookie: memberCookie },
    })
  ).status,
  404,
);
assert.equal(
  (
    await post(
      "profile",
      { name: "Pessoa de teste", timezone: "America/Sao_Paulo" },
      memberCookie,
    )
  ).status,
  200,
);
assert.equal(
  (
    await fetch(`${origin}/hoje`, {
      headers: { cookie: memberCookie },
      redirect: "manual",
    })
  ).status,
  200,
);
assert.equal((await post("signout", {}, memberCookie)).status, 200);
console.log(
  "Local HTTP smoke passed: origin, authentication, tokens, invitations, permissions, onboarding and logout.",
);
