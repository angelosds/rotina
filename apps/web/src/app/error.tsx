"use client";
import { Card, Button } from "@rotina/ui";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <Card>
      <h1>Não foi possível carregar</h1>
      <p>Houve um problema ao abrir esta página. Tente novamente.</p>
      <Button onClick={reset}>Tentar novamente</Button>
    </Card>
  );
}
