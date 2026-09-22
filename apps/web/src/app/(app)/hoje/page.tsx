import Link from "next/link";
import { redirect } from "next/navigation";
import { Sun } from "lucide-react";
import { Card } from "@rotina/ui";
import { requireUser } from "@/lib/session";
import { AccessForm } from "@/components/access-form";
export default async function Today() {
  const s = await requireUser();
  if (!s.profile.onboarded) redirect("/boas-vindas");
  return (
    <Card>
      <span className="icon">
        <Sun aria-hidden size={22} />
      </span>
      <h1>Um novo começo, {s.user.name}</h1>
      <p className="muted">
        Seu acesso está pronto. Gastos, cartões, faturas e compras já estão
        disponíveis no ambiente de testes.
      </p>
      <Link href="/financas/gastos" className="button full">
        Abrir gastos
      </Link>
      <Link href="/financas/cartoes" className="button full">
        Abrir cartões e faturas
      </Link>
      {s.profile.role === "owner" && (
        <Link href="/configuracoes/convites" className="button full">
          Convidar alguém
        </Link>
      )}
      <AccessForm action="signout" label="Sair" secondary />
    </Card>
  );
}
