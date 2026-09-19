import Link from "next/link";
import { Card } from "@rotina/ui";
export default function NotFound() {
  return (
    <Card>
      <h1>Página não encontrada</h1>
      <Link href="/hoje">Voltar para Hoje</Link>
    </Card>
  );
}
