import Link from "next/link";
import { Card } from "@rotina/ui";
import { AccessForm } from "@/components/access-form";
export default async function Confirm({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <Card>
      <h1>Confirme sua entrada</h1>
      <p className="muted">Toque abaixo para entrar no seu espaço.</p>
      {token && /^[a-zA-Z0-9_-]{20,100}$/.test(token) ? (
        <AccessForm
          action="confirm"
          label="Entrar no Rotina"
          hidden={{ token }}
        />
      ) : (
        <p role="alert">Este link não é válido.</p>
      )}
      <p className="small" style={{ marginTop: 20 }}>
        Link expirado ou já usado? <Link href="/entrar">Peça outro link</Link>.
      </p>
    </Card>
  );
}
