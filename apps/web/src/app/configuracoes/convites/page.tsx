import { notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@rotina/ui";
import { requireUser } from "@/lib/session";
import { runtime } from "@/lib/runtime";
import { schema } from "@rotina/db";
import { AccessForm } from "@/components/access-form";
export default async function Invites() {
  const s = await requireUser();
  if (s.profile.role !== "owner") notFound();
  const invites = await runtime()
    .db.select()
    .from(schema.invitation)
    .orderBy(schema.invitation.createdAt);
  return (
    <Card>
      <span className="tag">Proprietário</span>
      <h1>Convide alguém</h1>
      <p className="muted">Compartilhe o Rotina com pessoas próximas.</p>
      <div className="note">
        Cada pessoa terá sua própria conta. Suas tarefas e finanças continuam
        privadas.
      </div>
      <AccessForm action="invite" label="Enviar convite" email />
      <h2>Convites enviados</h2>
      {invites.length === 0 ? (
        <p className="muted">Nenhum convite enviado.</p>
      ) : (
        invites.map((i) => {
          const status = i.acceptedAt
            ? "Aceito"
            : i.revokedAt
              ? "Revogado"
              : i.expiresAt < new Date()
                ? "Expirado"
                : "Pendente";
          return (
            <div className="invite-item" key={i.id}>
              <div className="row">
                <span>{i.email}</span>
                <span className="tag">{status}</span>
              </div>
              {!i.acceptedAt && (
                <div className="actions">
                  <AccessForm
                    action="invite"
                    label="Reenviar"
                    hidden={{ email: i.email }}
                    secondary
                  />
                  {status === "Pendente" && (
                    <AccessForm
                      action="revoke"
                      label="Revogar"
                      hidden={{ id: i.id }}
                      secondary
                    />
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
      <p style={{ marginTop: 24 }}>
        <Link href="/hoje">Voltar para Hoje</Link>
      </p>
    </Card>
  );
}
