import { notFound } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, UserRound } from "lucide-react";
import { Card } from "@rotina/ui";
import { requireUser } from "@/lib/session";
import { runtime } from "@/lib/runtime";
import { eq, schema } from "@rotina/db";
import { AccessForm } from "@/components/access-form";
import { MemberAccessControl } from "@/components/member-access-control";

export const metadata = { title: "Pessoas e convites" };

export default async function PeopleAndInvites({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const session = await requireUser();
  if (session.profile.role !== "owner") notFound();
  const activeTab =
    (await searchParams).aba === "convites" ? "convites" : "pessoas";
  const db = runtime().db;
  const [members, invites] = await Promise.all([
    db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        createdAt: schema.user.createdAt,
        role: schema.profile.role,
        suspendedAt: schema.profile.suspendedAt,
      })
      .from(schema.user)
      .innerJoin(schema.profile, eq(schema.user.id, schema.profile.userId))
      .orderBy(schema.user.createdAt),
    db.select().from(schema.invitation).orderBy(schema.invitation.createdAt),
  ]);

  return (
    <div className="people-page">
      <div className="page-heading">
        <div>
          <span className="tag">Configurações</span>
          <h1>Pessoas e convites</h1>
          <p className="muted">
            Gerencie quem pode usar o Rotina e acompanhe os convites enviados.
          </p>
        </div>
        <Link className="button" href="?aba=convites">
          Convidar pessoa
        </Link>
      </div>

      <section className="access-featured">
        <span className="featured-icon">
          <ShieldCheck aria-hidden size={22} />
        </span>
        <div>
          <h2>Dados privados por pessoa</h2>
          <p>
            Cada membro acessa apenas a própria rotina. Você administra o
            acesso, sem visualizar tarefas ou finanças de outras pessoas.
          </p>
        </div>
      </section>

      <nav className="access-tabs" aria-label="Pessoas e convites">
        <Link
          href="?aba=pessoas"
          className={
            activeTab === "pessoas" ? "access-tab active" : "access-tab"
          }
          aria-current={activeTab === "pessoas" ? "page" : undefined}
        >
          Pessoas <span>{members.length}</span>
        </Link>
        <Link
          href="?aba=convites"
          className={
            activeTab === "convites" ? "access-tab active" : "access-tab"
          }
          aria-current={activeTab === "convites" ? "page" : undefined}
        >
          Convites <span>{invites.length}</span>
        </Link>
      </nav>

      {activeTab === "pessoas" ? (
        <Card className="people-card">
          <div className="section-heading">
            <div>
              <h2>Pessoas com acesso</h2>
              <p className="muted">
                Suspenda temporariamente um acesso sem apagar dados.
              </p>
            </div>
          </div>
          <div className="member-list">
            {members.map((member) => {
              const name = member.name || member.email.split("@")[0];
              const joined = new Intl.DateTimeFormat("pt-BR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              }).format(member.createdAt);
              return (
                <article className="member-item" key={member.id}>
                  <div className="member-identity">
                    <span className="member-avatar">
                      <UserRound aria-hidden size={20} />
                    </span>
                    <div>
                      <div className="member-name-line">
                        <strong>{name}</strong>
                        <span
                          className={`status-tag ${member.suspendedAt ? "suspended" : "active"}`}
                        >
                          {member.suspendedAt ? "Suspenso" : "Ativo"}
                        </span>
                      </div>
                      <p className="member-email">{member.email}</p>
                      <p className="small">
                        {member.role === "owner"
                          ? "Proprietário"
                          : `Entrou em ${joined}`}
                      </p>
                    </div>
                  </div>
                  {member.role === "owner" ? (
                    <span className="owner-label">Você</span>
                  ) : (
                    <MemberAccessControl
                      userId={member.id}
                      name={name}
                      suspended={Boolean(member.suspendedAt)}
                    />
                  )}
                </article>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="people-card">
          <div className="section-heading">
            <div>
              <h2>Enviar convite</h2>
              <p className="muted">
                O convite é individual, expira em 7 dias e cria uma conta
                privada.
              </p>
            </div>
          </div>
          <AccessForm action="invite" label="Enviar convite" email />
          <h2 className="subsection-title">Convites enviados</h2>
          {invites.length === 0 ? (
            <p className="muted">Nenhum convite enviado.</p>
          ) : (
            <div className="invite-list">
              {invites.map((invite) => {
                const status = invite.acceptedAt
                  ? "Aceito"
                  : invite.revokedAt
                    ? "Revogado"
                    : invite.expiresAt < new Date()
                      ? "Expirado"
                      : "Pendente";
                return (
                  <article className="invite-item" key={invite.id}>
                    <div className="row">
                      <span>{invite.email}</span>
                      <span className="status-tag">{status}</span>
                    </div>
                    {!invite.acceptedAt && (
                      <div className="actions">
                        <AccessForm
                          action="invite"
                          label="Reenviar"
                          hidden={{ email: invite.email }}
                          secondary
                        />
                        {status === "Pendente" && (
                          <AccessForm
                            action="revoke"
                            label="Revogar"
                            hidden={{ id: invite.id }}
                            secondary
                          />
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <p className="back-link">
        <Link href="/hoje">Voltar para Hoje</Link>
      </p>
    </div>
  );
}
