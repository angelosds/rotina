import Link from "next/link";
import { Mail } from "lucide-react";
import { Card } from "@rotina/ui";
import { runtime } from "@/lib/runtime";
import { currentSession } from "@/lib/session";
import { inspectInvitation } from "@rotina/domain";
import { eq, schema } from "@rotina/db";
import { AccessForm } from "@/components/access-form";
export const dynamic = "force-dynamic";
export default async function Invite({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const { db } = runtime();
  const invite = await inspectInvitation(db, token ?? "");
  if (!invite)
    return (
      <Card>
        <h1>Convite indisponível</h1>
        <p>
          Este convite expirou, já foi usado ou foi revogado. Peça um novo
          convite a quem enviou.
        </p>
        <Link href="/entrar">Já tem uma conta? Entrar</Link>
      </Card>
    );
  const [inviter] = await db
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, invite.inviterId));
  const session = await currentSession();
  return (
    <Card>
      <span className="icon">
        <Mail aria-hidden size={22} />
      </span>
      <h1>Você foi convidado</h1>
      <p className="muted">
        {inviter?.name || "O proprietário"} convidou você para usar o Rotina.
      </p>
      <div className="note">
        Convite para <strong>{invite.email}</strong>
        <br />
        Uma conta só sua, com seus próprios dados.
      </div>
      {session ? (
        <>
          <p>
            Você está conectado como {session.user.email}. Saia da conta atual
            antes de aceitar.
          </p>
          <AccessForm
            action="signout"
            label="Sair da conta atual"
            hidden={{ invitationToken: token! }}
            secondary
          />
        </>
      ) : (
        <AccessForm
          action="accept"
          label="Aceitar convite"
          hidden={{ token: token! }}
        />
      )}
      <p className="small" style={{ marginTop: 16 }}>
        Válido até{" "}
        {invite.expiresAt.toLocaleDateString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        })}
        .
      </p>
    </Card>
  );
}
