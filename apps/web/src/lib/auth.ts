import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { createAuthEndpoint, APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import type { Config } from "@rotina/config";
import { type Database, schema } from "@rotina/db";
import { acceptInvitation, AccessError } from "@rotina/domain";
import type { Email } from "./email";
export function createAuth(
  db: Database,
  c: Config,
  send: (m: Email) => Promise<void>,
) {
  return betterAuth({
    appName: "Rotina",
    baseURL: c.APP_URL,
    secret: c.AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    trustedOrigins: [c.APP_URL],
    emailAndPassword: { enabled: false },
    session: { expiresIn: 7 * 86400, cookieCache: { enabled: false } },
    advanced: {
      cookiePrefix: `rotina-${c.APP_ENV}`,
      useSecureCookies: c.APP_ENV !== "local",
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    plugins: [
      magicLink({
        disableSignUp: true,
        expiresIn: 15 * 60,
        storeToken: "hashed",
        sendMagicLink: async ({ email, token }) => {
          const url = new URL("/entrar/confirmar", c.APP_URL);
          url.searchParams.set("token", token);
          await send({
            to: email,
            subject: "Seu link para entrar no Rotina",
            text: `Confirme sua entrada no Rotina:\n${url}\n\nVálido por 15 minutos e para um único uso. Se não solicitou, ignore este e-mail.`,
          });
        },
      }),
      {
        id: "rotina-invitations",
        endpoints: {
          acceptRotinaInvitation: createAuthEndpoint(
            "/rotina/accept-invitation",
            {
              method: "POST",
              body: z.object({ token: z.string().min(32).max(100) }),
              requireHeaders: true,
            },
            async (ctx) => {
              try {
                // HTTP route requires logout before accepting; domain also guards account mismatches.
                const u = await acceptInvitation(db, ctx.body.token);
                const session = await ctx.context.internalAdapter.createSession(
                  u.id,
                );
                if (!session)
                  throw new APIError("INTERNAL_SERVER_ERROR", {
                    message: "Conta criada. Solicite um link para entrar.",
                  });
                await setSessionCookie(ctx, { session, user: u });
                return ctx.json({ ok: true });
              } catch (e) {
                if (e instanceof AccessError)
                  throw new APIError("BAD_REQUEST", { message: e.message });
                throw e;
              }
            },
          ),
        },
      },
    ],
  });
}
