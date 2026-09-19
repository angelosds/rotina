"use client";
import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Notice } from "@rotina/ui";
type Props = {
  action: string;
  label: string;
  email?: boolean;
  profile?: boolean;
  hidden?: Record<string, string>;
  secondary?: boolean;
  initialName?: string;
};
export function AccessForm({
  action,
  label,
  email,
  profile,
  hidden,
  secondary,
  initialName = "",
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  useEffect(() => {
    if (profile) setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, [profile]);
  const zones = Array.from(
    new Set([
      timezone,
      "America/Sao_Paulo",
      "America/Manaus",
      "America/Recife",
      "America/Rio_Branco",
      "America/Noronha",
      "Europe/Lisbon",
      ...Intl.supportedValuesOf("timeZone"),
    ]),
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setPending(true);
    setMessage("");
    setError(false);
    try {
      const values = Object.fromEntries(new FormData(form));
      const response = await fetch("/api/access/" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, ...hidden }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(true);
        setMessage(result.error ?? "Não foi possível concluir.");
        return;
      }
      if (result.redirect) {
        router.push(result.redirect);
        router.refresh();
      } else {
        setMessage(result.message);
        if (result.refresh) router.refresh();
      }
    } catch {
      setError(true);
      setMessage(
        "Não foi possível conectar. Confira sua conexão e tente novamente.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} aria-busy={pending}>
      {email && (
        <label>
          {action === "invite" ? "E-mail da pessoa" : "Seu e-mail"}
          <input
            type="email"
            name="email"
            autoComplete={action === "invite" ? "off" : "email"}
            placeholder="voce@exemplo.com"
            required
            maxLength={254}
          />
        </label>
      )}
      {profile && (
        <>
          <label>
            Como podemos chamar você?
            <input
              name="name"
              autoComplete="given-name"
              required
              maxLength={80}
              defaultValue={initialName}
              placeholder="Seu nome"
            />
          </label>
          <label>
            Fuso horário
            <select
              name="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <p className="small">Você pode alterar essas preferências depois.</p>
        </>
      )}
      <Button
        type="submit"
        disabled={pending}
        className={`full ${secondary ? "secondary" : ""}`}
      >
        {pending
          ? action === "login" || action === "invite"
            ? "Enviando…"
            : "Aguarde…"
          : label}
      </Button>
      {message && <Notice error={error}>{message}</Notice>}
    </form>
  );
}
