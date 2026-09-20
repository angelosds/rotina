"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Notice } from "@rotina/ui";

export function MemberAccessControl({
  userId,
  name,
  suspended,
}: {
  userId: string;
  name: string;
  suspended: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  async function changeAccess(suspend: boolean) {
    if (pending) return;
    setPending(true);
    setMessage("");
    setError(false);
    try {
      const response = await fetch(
        `/api/access/${suspend ? "suspend-member" : "reactivate-member"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setError(true);
        setMessage(result.error ?? "Não foi possível concluir.");
        return;
      }
      dialog.current?.close();
      setMessage(result.message);
      router.refresh();
    } catch {
      setError(true);
      setMessage("Não foi possível conectar. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="member-control">
      {suspended ? (
        <Button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={() => changeAccess(false)}
        >
          {pending ? "Reativando…" : "Reativar acesso"}
        </Button>
      ) : (
        <Button
          type="button"
          className="secondary danger-action"
          disabled={pending}
          onClick={() => dialog.current?.showModal()}
        >
          Suspender acesso
        </Button>
      )}
      {message && <Notice error={error}>{message}</Notice>}
      <dialog ref={dialog} className="confirm-dialog">
        <div className="confirm-content">
          <span className="tag">Confirmar suspensão</span>
          <h2>Suspender o acesso de {name}?</h2>
          <p className="muted">
            As sessões serão encerradas e novos links de acesso ficarão
            bloqueados. A conta e os dados serão preservados.
          </p>
          {message && <Notice error={error}>{message}</Notice>}
          <div className="confirm-actions">
            <Button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={() => dialog.current?.close()}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="danger-confirm"
              disabled={pending}
              onClick={() => changeAccess(true)}
            >
              {pending ? "Suspendendo…" : "Suspender acesso"}
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
