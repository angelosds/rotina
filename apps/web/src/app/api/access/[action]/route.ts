import { NextRequest, NextResponse } from "next/server";
import { runtime as getRuntime } from "@/lib/runtime";
import {
  emailSchema,
  consumeLimit,
  issueInvitation,
  revokeInvitation,
  requireOwner,
  updateMemberAccess,
  updateOwnProfile,
  AccessError,
} from "@rotina/domain";
import { and, eq, isNull, schema } from "@rotina/db";
import { sendEmail } from "@/lib/email";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { config, db, auth } = getRuntime();
    if (request.headers.get("origin") !== new URL(config.APP_URL).origin)
      return NextResponse.json(
        { error: "Origem não autorizada." },
        { status: 403 },
      );
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return NextResponse.json({ error: "Formato inválido." }, { status: 415 });
    const raw = await request.text();
    if (raw.length > 4096)
      return NextResponse.json(
        { error: "Solicitação muito grande." },
        { status: 413 },
      );
    const body = JSON.parse(raw) as Record<string, unknown>;
    const { action } = await params;
    // Vercel sets this header at the edge. Locally requests share one bucket.
    const ip =
      config.APP_ENV === "local"
        ? "local"
        : (request.headers
            .get("x-vercel-forwarded-for")
            ?.split(",")[0]
            ?.trim() ?? "unknown");
    const guard = await consumeLimit(db, "ip:" + ip, 30, 60);
    if (!guard.allowed)
      return NextResponse.json(
        { error: `Aguarde ${guard.retryAfter} segundos e tente novamente.` },
        { status: 429, headers: { "Retry-After": String(guard.retryAfter) } },
      );
    if (action === "login") {
      const email = emailSchema.parse(
        typeof body.email === "string" ? body.email.trim() : "",
      );
      const perEmail = await consumeLimit(db, "login:" + email, 1, 60);
      if (!perEmail.allowed)
        return NextResponse.json(
          {
            error: `Aguarde ${perEmail.retryAfter} segundos antes de pedir outro link.`,
          },
          { status: 429 },
        );
      const [u] = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .innerJoin(schema.profile, eq(schema.user.id, schema.profile.userId))
        .where(
          and(
            eq(schema.user.email, email),
            isNull(schema.profile.suspendedAt),
          ),
        );
      if (u) {
        try {
          await auth.api.signInMagicLink({
            body: { email },
            headers: request.headers,
          });
        } catch {
          console.error("Login email dispatch failed");
        }
      }
      // Same response for unknown users and delivery errors: no account enumeration.
      return NextResponse.json({
        message:
          "Se este e-mail tiver acesso, você receberá um link para entrar. Se não chegar, confira o spam ou tente novamente em um minuto.",
      });
    }
    if (action === "confirm") {
      const token = typeof body.token === "string" ? body.token : "";
      if (!/^[a-zA-Z0-9_-]{20,100}$/.test(token))
        throw new AccessError(
          "Este link expirou ou já foi usado. Peça outro link.",
        );
      const result = await auth.api.magicLinkVerify({
        query: { token },
        headers: request.headers,
        asResponse: true,
      });
      if (!result.ok || result.headers.get("location")?.includes("error="))
        throw new AccessError(
          "Este link expirou ou já foi usado. Peça outro link.",
        );
      const verified = (await result
        .clone()
        .json()
        .catch(() => null)) as { user?: { id?: string } } | null;
      if (verified?.user?.id) {
        const [profile] = await db
          .select({ suspendedAt: schema.profile.suspendedAt })
          .from(schema.profile)
          .where(eq(schema.profile.userId, verified.user.id));
        if (profile?.suspendedAt) {
          await db
            .delete(schema.session)
            .where(eq(schema.session.userId, verified.user.id));
          throw new AccessError(
            "Seu acesso está suspenso. Fale com o proprietário do app.",
          );
        }
      }
      const response = NextResponse.json({ redirect: "/hoje" });
      for (const cookie of result.headers.getSetCookie())
        response.headers.append("set-cookie", cookie);
      return response;
    }
    const session = await auth.api.getSession({ headers: request.headers });
    if (action === "accept") {
      if (session)
        throw new AccessError(
          "Saia da conta atual antes de aceitar este convite.",
        );
      const result = await auth.api.acceptRotinaInvitation({
        body: { token: String(body.token ?? "") },
        headers: request.headers,
        asResponse: true,
      });
      if (!result.ok)
        throw new AccessError(
          "Este convite expirou, já foi usado ou foi revogado. Peça um novo convite.",
        );
      const response = NextResponse.json({ redirect: "/boas-vindas" });
      for (const cookie of result.headers.getSetCookie())
        response.headers.append("set-cookie", cookie);
      return response;
    }
    if (!session)
      return NextResponse.json(
        { error: "Entre para continuar." },
        { status: 401 },
      );
    const [activeProfile] = await db
      .select({ suspendedAt: schema.profile.suspendedAt })
      .from(schema.profile)
      .where(eq(schema.profile.userId, session.user.id));
    if (!activeProfile || activeProfile.suspendedAt) {
      await db
        .delete(schema.session)
        .where(eq(schema.session.userId, session.user.id));
      return NextResponse.json(
        { error: "Seu acesso está suspenso. Fale com o proprietário do app." },
        { status: 403 },
      );
    }
    if (action === "signout") {
      const result = await auth.api.signOut({
        headers: request.headers,
        asResponse: true,
      });
      const token =
        typeof body.invitationToken === "string" &&
        /^[a-zA-Z0-9_-]{43}$/.test(body.invitationToken)
          ? body.invitationToken
          : null;
      const response = NextResponse.json({
        redirect: token
          ? `/convite?token=${encodeURIComponent(token)}`
          : "/entrar",
      });
      for (const cookie of result.headers.getSetCookie())
        response.headers.append("set-cookie", cookie);
      return response;
    }
    if (action === "profile") {
      await updateOwnProfile(db, session.user.id, {
        name: String(body.name ?? ""),
        timezone: String(body.timezone ?? ""),
      });
      return NextResponse.json({ redirect: "/hoje" });
    }
    await requireOwner(db, session.user.id);
    if (action === "invite") {
      const email = emailSchema.parse(
        typeof body.email === "string" ? body.email.trim() : "",
      );
      const guard = await consumeLimit(db, "invite:" + session.user.id, 5, 60);
      if (!guard.allowed)
        throw new AccessError(
          "Aguarde um minuto antes de enviar mais convites.",
        );
      const { row, token } = await issueInvitation(db, session.user.id, email);
      const url = new URL("/convite", config.APP_URL);
      url.searchParams.set("token", token);
      try {
        await sendEmail(config, {
          to: email,
          subject: "Você foi convidado para o Rotina",
          text: `${session.user.name || "O proprietário"} convidou você para usar o Rotina. Sua conta e seus dados serão privados.\n\n${url}\n\nConvite válido por 7 dias. Abra e confirme para aceitar.`,
        });
      } catch {
        await db
          .update(schema.invitation)
          .set({ revokedAt: new Date() })
          .where(eq(schema.invitation.tokenHash, row.tokenHash));
        return NextResponse.json(
          { error: "Não foi possível enviar o convite. Tente novamente." },
          { status: 503 },
        );
      }
      return NextResponse.json({
        message: "Convite enviado. Válido por 7 dias.",
        refresh: true,
      });
    }
    if (action === "revoke") {
      await revokeInvitation(db, session.user.id, String(body.id));
      return NextResponse.json({ message: "Convite revogado.", refresh: true });
    }
    if (action === "suspend-member" || action === "reactivate-member") {
      await updateMemberAccess(
        db,
        session.user.id,
        String(body.userId ?? ""),
        action === "suspend-member",
      );
      return NextResponse.json({
        message:
          action === "suspend-member"
            ? "Acesso suspenso. As sessões foram encerradas."
            : "Acesso reativado.",
        refresh: true,
      });
    }
    return NextResponse.json(
      { error: "Ação não encontrada." },
      { status: 404 },
    );
  } catch (e) {
    if (e instanceof AccessError)
      return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof Error && e.name === "ZodError")
      return NextResponse.json(
        { error: "Confira os campos e tente novamente." },
        { status: 400 },
      );
    console.error("Access operation failed");
    return NextResponse.json(
      { error: "Não foi possível concluir. Tente novamente." },
      { status: 503 },
    );
  }
}
