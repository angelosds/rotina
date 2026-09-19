import { LockKeyhole } from "lucide-react";
import { Card } from "@rotina/ui";
import { AccessForm } from "@/components/access-form";
export const metadata = { title: "Entrar" };
export default function Login() {
  return (
    <Card>
      <span className="icon">
        <LockKeyhole aria-hidden size={22} />
      </span>
      <h1>Bom ter você de volta</h1>
      <p className="muted">
        Receba um link no seu e-mail para entrar, sem precisar de senha.
      </p>
      <AccessForm action="login" label="Receber link de acesso" email />
      <div className="note">
        O Rotina está disponível por convite. Use o e-mail em que você recebeu o
        seu.
      </div>
    </Card>
  );
}
