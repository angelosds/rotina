import { redirect } from "next/navigation";
import { Card } from "@rotina/ui";
import { requireUser } from "@/lib/session";
import { AccessForm } from "@/components/access-form";
export default async function Welcome() {
  const s = await requireUser();
  if (s.profile.onboarded) redirect("/hoje");
  return (
    <Card>
      <span className="tag">Primeiro acesso</span>
      <h1>Seu espaço está pronto</h1>
      <p className="muted">Só mais dois detalhes para começar.</p>
      <AccessForm
        action="profile"
        label="Começar a organizar"
        profile
        initialName={s.user.name}
      />
    </Card>
  );
}
