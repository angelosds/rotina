"use client";

import { Check, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Card, Notice } from "@rotina/ui";

type LoginResult = {
  message?: string;
  error?: string;
  redirect?: string;
  step?: "code";
};

async function loginRequest(action: "login" | "confirm-code", body: object) {
  const response = await fetch(`/api/access/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as LoginResult;
  if (!response.ok)
    throw new Error(result.error ?? "Não foi possível concluir.");
  return result;
}

export function LoginFlow({ accessError }: { accessError?: string }) {
  const router = useRouter();
  const codeInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
  }, [step]);

  useEffect(() => {
    if (!resendIn) return;
    const timer = window.setInterval(
      () => setResendIn((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [resendIn]);

  async function sendCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await loginRequest("login", { email });
      setStep("code");
      setCode("");
      setMessage(result.message ?? "Confira seu e-mail para continuar.");
      setResendIn(60);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível enviar o código.",
      );
    } finally {
      setPending(false);
    }
  }

  async function confirmCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || code.length !== 6) return;
    setPending(true);
    setError("");
    try {
      const result = await loginRequest("confirm-code", { email, code });
      router.replace(result.redirect ?? "/hoje");
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível confirmar o código.",
      );
      setCode("");
      window.requestAnimationFrame(() => codeInput.current?.focus());
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <span className="icon">
        {step === "email" ? (
          <LockKeyhole aria-hidden size={22} />
        ) : (
          <Check aria-hidden size={24} />
        )}
      </span>
      {step === "email" ? (
        <>
          <h1>Bom ter você de volta</h1>
          <p className="muted">
            Receba um código no seu e-mail para entrar sem sair do app.
          </p>
          <form onSubmit={sendCode} aria-busy={pending}>
            <label>
              Seu e-mail
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="voce@exemplo.com"
                required
                maxLength={254}
              />
            </label>
            <Button type="submit" disabled={pending} className="full">
              {pending ? "Enviando…" : "Receber código"}
            </Button>
          </form>
          {accessError === "suspended" && (
            <Notice error>
              Seu acesso está suspenso. Fale com o proprietário do app.
            </Notice>
          )}
          {error && <Notice error>{error}</Notice>}
          <div className="note">
            Você também receberá um link de acesso, caso esteja entrando pelo
            navegador.
          </div>
        </>
      ) : (
        <>
          <h1>Digite o código</h1>
          <p className="muted">
            Enviamos um código de 6 dígitos para <strong>{email}</strong>.
          </p>
          <form onSubmit={confirmCode} aria-busy={pending}>
            <label htmlFor="login-code">Código de acesso</label>
            <div className="login-code-field">
              <input
                ref={codeInput}
                id="login-code"
                name="code"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                aria-describedby="login-code-help"
                required
              />
              <div className="login-code-digits" aria-hidden="true">
                {Array.from({ length: 6 }, (_, index) => (
                  <span key={index}>{code[index] ?? ""}</span>
                ))}
              </div>
            </div>
            <p className="small" id="login-code-help">
              Você pode colar o código completo.
            </p>
            {error && <Notice error>{error}</Notice>}
            <Button
              type="submit"
              disabled={pending || code.length !== 6}
              className="full"
            >
              {pending ? "Entrando…" : "Entrar no Rotina"}
            </Button>
          </form>
          {message && !error && <Notice>{message}</Notice>}
          <div className="login-code-actions">
            <button
              type="button"
              disabled={pending || resendIn > 0}
              onClick={() => void sendCode()}
            >
              {resendIn > 0
                ? `Reenviar código em ${resendIn}s`
                : "Reenviar código"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setStep("email");
                setCode("");
                setError("");
                setMessage("");
                setResendIn(0);
              }}
            >
              Usar outro e-mail
            </button>
          </div>
          <div className="note">
            O código expira em 15 minutos e pode ser usado apenas uma vez.
          </div>
        </>
      )}
    </Card>
  );
}
