"use client";

import {
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  HandCoins,
  Info,
  Landmark,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  DebtPaymentKind,
  DebtPaymentMethod,
  getDebts,
} from "@rotina/domain";
import { Button, Notice } from "@rotina/ui";

type DebtsData = Awaited<ReturnType<typeof getDebts>>;
type DebtItem = DebtsData["items"][number];
type DebtPreview = {
  title: string;
  originalBalanceCents: number;
  installmentCount: number;
  installmentCents: number;
  firstDueDate: string;
  project: string | null;
  tags: string[];
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const paymentOptions: Array<[DebtPaymentMethod | "", string]> = [
  ["", "Não informada"],
  ["pix", "Pix"],
  ["automatic_debit", "Débito automático"],
  ["bank_transfer", "Transferência bancária"],
  ["debit", "Cartão de débito"],
  ["cash", "Dinheiro"],
  ["other", "Outro"],
];

function shortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T12:00:00`));
}

function longDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function dayHeading(value: string, today: string) {
  if (value === "quitadas") return "Quitadas";
  if (value === today) return "Hoje";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
  }).format(new Date(`${value}T12:00:00`));
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  return (Number(digits) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function centsFromInput(value: string) {
  const normalized = value.replaceAll(".", "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return cents > 0 ? cents : null;
}

function statusClass(status: DebtItem["status"]) {
  if (status === "Vencida") return "danger-status";
  if (status === "Vence em breve") return "warning-status";
  return "active";
}

function paymentMethodLabel(method: DebtPaymentMethod | null) {
  return paymentOptions.find(([value]) => value === (method ?? ""))?.[1] ?? "Não informada";
}

async function debtRequest(action: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/finance/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "Não foi possível concluir.");
  return result;
}

const closeTimers = new WeakMap<HTMLDialogElement, number>();

function openDialog(dialog: HTMLDialogElement | null) {
  if (!dialog) return;
  const timer = closeTimers.get(dialog);
  if (timer) window.clearTimeout(timer);
  dialog.classList.remove("is-closing");
  if (!dialog.open) dialog.showModal();
}

function closeDialog(dialog: HTMLDialogElement | null) {
  if (!dialog?.open || dialog.classList.contains("is-closing")) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  dialog.classList.add("is-closing");
  const timer = window.setTimeout(() => {
    dialog.close();
    dialog.classList.remove("is-closing");
    closeTimers.delete(dialog);
  }, reduced ? 0 : 220);
  closeTimers.set(dialog, timer);
}

function Dialog({
  dialogRef,
  eyebrow,
  title,
  children,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <dialog
      ref={dialogRef}
      className="finance-dialog debt-dialog"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog(dialogRef.current);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeDialog(dialogRef.current);
      }}
    >
      <div className="finance-dialog-content">
        <div className="finance-dialog-heading">
          <div>
            <span className="finance-eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar"
            onClick={() => closeDialog(dialogRef.current)}
          >
            <X aria-hidden size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function DebtsDashboard({ data, today }: { data: DebtsData; today: string }) {
  const router = useRouter();
  const captureDialog = useRef<HTMLDialogElement>(null);
  const detailDialog = useRef<HTMLDialogElement>(null);
  const debtKey = useRef(crypto.randomUUID());
  const paymentKey = useRef(crypto.randomUUID());
  const [filter, setFilter] = useState<"all" | "current" | "attention" | "paid">("all");
  const [capture, setCapture] = useState("");
  const [preview, setPreview] = useState<DebtPreview | null>(null);
  const [balanceInput, setBalanceInput] = useState("");
  const [installmentInput, setInstallmentInput] = useState("");
  const [selected, setSelected] = useState<DebtItem | null>(null);
  const [detailMode, setDetailMode] = useState<"detail" | "payment">("detail");
  const [paymentKind, setPaymentKind] = useState<DebtPaymentKind>("regular");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paidAt, setPaidAt] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState<DebtPaymentMethod | "">("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3800);
    return () => window.clearTimeout(timer);
  }, [message]);

  const visibleItems = data.items.filter((item) => {
    if (filter === "all") return true;
    if (filter === "paid") return item.status === "Quitada";
    if (filter === "current") return item.status === "Em dia";
    return item.status === "Vencida" || item.status === "Vence em breve";
  });
  const groups = new Map<string, DebtItem[]>();
  for (const item of visibleItems) {
    const key = item.nextDueDate ?? "quitadas";
    const entries = groups.get(key) ?? [];
    entries.push(item);
    groups.set(key, entries);
  }

  function startDebt() {
    setCapture("");
    setPreview(null);
    setBalanceInput("");
    setInstallmentInput("");
    setError("");
    openDialog(captureDialog.current);
  }

  async function reviewDebt() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await debtRequest("preview-debt", {
        text: capture,
        referenceDate: today,
      });
      setPreview(result.preview);
      setBalanceInput(
        (result.preview.originalBalanceCents / 100).toFixed(2).replace(".", ","),
      );
      setInstallmentInput(
        (result.preview.installmentCents / 100).toFixed(2).replace(".", ","),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível interpretar a dívida.",
      );
    } finally {
      setPending(false);
    }
  }

  async function saveDebt() {
    if (!preview || pending) return;
    const originalBalanceCents = centsFromInput(balanceInput);
    const installmentCents = centsFromInput(installmentInput);
    if (!originalBalanceCents || !installmentCents) {
      setError("Informe valores maiores que zero.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await debtRequest("debt", {
        ...preview,
        originalBalanceCents,
        installmentCents,
        idempotencyKey: debtKey.current,
      });
      debtKey.current = crypto.randomUUID();
      closeDialog(captureDialog.current);
      setMessage(result.message);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível salvar a dívida.",
      );
    } finally {
      setPending(false);
    }
  }

  function openDetails(item: DebtItem) {
    setSelected(item);
    setDetailMode("detail");
    setError("");
    openDialog(detailDialog.current);
  }

  function startPayment(kind: DebtPaymentKind) {
    if (!selected) return;
    setPaymentKind(kind);
    setPaymentAmount(
      kind === "regular"
        ? (selected.installmentCents / 100).toFixed(2).replace(".", ",")
        : "",
    );
    setPaidAt(today);
    setPaymentMethod("");
    setError("");
    setDetailMode("payment");
  }

  async function savePayment(event: FormEvent) {
    event.preventDefault();
    if (!selected || pending) return;
    const amountCents = centsFromInput(paymentAmount);
    if (!amountCents) {
      setError("Informe um valor maior que zero.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await debtRequest("debt-payment", {
        debtId: selected.id,
        kind: paymentKind,
        amount: paymentAmount,
        paidAt,
        paymentMethod: paymentMethod || null,
        idempotencyKey: paymentKey.current,
      });
      paymentKey.current = crypto.randomUUID();
      closeDialog(detailDialog.current);
      setSelected(null);
      setMessage(result.message);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível registrar o pagamento.",
      );
    } finally {
      setPending(false);
    }
  }

  const paymentCents = centsFromInput(paymentAmount) ?? 0;
  const resultingBalance = selected
    ? Math.max(0, selected.balanceCents - paymentCents)
    : 0;

  return (
    <div className="finance-page debts-page">
      <div className="finance-content">
        <nav className="finance-module-nav" aria-label="Módulos financeiros">
          <Link href="/financas/gastos">Gastos</Link>
          <Link href="/financas/contas">Despesas fixas</Link>
          <Link href="/financas/cartoes">Cartões e faturas</Link>
          <Link href="/financas/dividas" aria-current="page">Dívidas</Link>
        </nav>

        <header className="finance-header">
          <div>
            <span className="finance-eyebrow">Finanças</span>
            <h1>Dívidas</h1>
            <p className="muted">Acompanhe saldos, parcelas e pagamentos.</p>
          </div>
          <Button type="button" onClick={startDebt}>
            <Plus aria-hidden size={18} /> Nova dívida
          </Button>
        </header>

        <section className="finance-featured debts-featured">
          <div>
            <p>Saldo devedor</p>
            <strong>{money.format(data.summary.balanceCents / 100)}</strong>
            <span>
              {money.format(data.summary.paidCents / 100)} pagos de{" "}
              {money.format(data.summary.originalBalanceCents / 100)}
            </span>
          </div>
          <div className="finance-next-due">
            <span>Próximo vencimento</span>
            <strong>
              {data.summary.nextDue?.nextDueDate
                ? shortDate(data.summary.nextDue.nextDueDate)
                : "Nenhuma pendência"}
            </strong>
            {data.summary.nextDue && (
              <span>
                {data.summary.nextDue.title} ·{" "}
                {money.format(data.summary.nextDue.installmentCents / 100)}
              </span>
            )}
          </div>
        </section>

        <div className="purchase-filters debt-filters" aria-label="Filtrar dívidas">
          {[
            ["all", "Todas"],
            ["current", "Em dia"],
            ["attention", "Atenção"],
            ["paid", "Quitadas"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value as typeof filter)}
            >
              {label}
            </button>
          ))}
        </div>

        {visibleItems.length ? (
          <section className="expense-groups debt-groups" aria-label="Dívidas agrupadas por vencimento">
            {[...groups.entries()].map(([date, items]) => (
              <section className="expense-day" key={date}>
                <div className="expense-day-heading">
                  <h2>{dayHeading(date, today)}</h2>
                  <span>
                    {money.format(
                      items.reduce(
                        (total, item) => total + (item.status === "Quitada" ? 0 : item.installmentCents),
                        0,
                      ) / 100,
                    )}
                  </span>
                </div>
                {items.map((item) => (
                  <button
                    type="button"
                    className="debt-row"
                    key={item.id}
                    onClick={() => openDetails(item)}
                    aria-label={`Ver detalhes de ${item.title}`}
                  >
                    <span className="expense-icon debt-icon">
                      {item.status === "Quitada" ? (
                        <HandCoins aria-hidden size={19} />
                      ) : (
                        <Landmark aria-hidden size={19} />
                      )}
                    </span>
                    <span className="debt-identity">
                      <span className="invoice-name">
                        <strong>{item.title}</strong>
                        <span className={`status-tag ${statusClass(item.status)}`}>
                          {item.status}
                        </span>
                      </span>
                      <small>
                        {item.status === "Quitada"
                          ? "Saldo quitado"
                          : `Parcela ${item.installmentNumber} de ${item.installmentCount}`}
                        {item.project ? ` · @${item.project}` : ""}
                        {item.tags.map((tag) => ` · #${tag}`).join("")}
                      </small>
                      <span className="debt-progress" aria-hidden="true">
                        <i style={{ width: `${Math.min(100, (item.paidCents / item.originalBalanceCents) * 100)}%` }} />
                      </span>
                    </span>
                    <span className="debt-value">
                      <strong>
                        {item.status === "Quitada"
                          ? "Quitada"
                          : money.format(item.installmentCents / 100)}
                      </strong>
                      <small>Saldo {money.format(item.balanceCents / 100)}</small>
                    </span>
                  </button>
                ))}
              </section>
            ))}
          </section>
        ) : (
          <section className="finance-panel finance-empty-list expense-empty">
            <CircleDollarSign aria-hidden size={28} />
            <h2>Nenhuma dívida neste filtro</h2>
            <p>Cadastre uma dívida para acompanhar saldo e pagamentos.</p>
            <Button type="button" onClick={startDebt}>Adicionar dívida</Button>
          </section>
        )}
      </div>

      {message && (
        <div className="success-toast" role="status" aria-live="polite">
          <CheckCircle2 aria-hidden size={20} />
          <span>{message}</span>
          <button type="button" aria-label="Fechar confirmação" onClick={() => setMessage("")}>
            <X aria-hidden size={18} />
          </button>
        </div>
      )}

      <Dialog
        dialogRef={captureDialog}
        eyebrow={preview ? "Revisar dívida" : "Nova dívida"}
        title={preview ? "Confira antes de salvar" : "Registre do seu jeito"}
      >
        {preview ? (
          <div className="purchase-review expense-review">
            <div className="expense-recognized">
              <Sparkles aria-hidden size={18} />
              <strong>Dívida reconhecida</strong>
            </div>
            <div className="finance-form-grid">
              <label className="full-field">Nome
                <input value={preview.title} onChange={(event) => setPreview({ ...preview, title: event.target.value })} />
              </label>
              <label>Saldo original
                <span className="finance-money-input"><span>R$</span><input inputMode="decimal" value={balanceInput} onChange={(event) => setBalanceInput(formatCurrencyInput(event.target.value))} /></span>
              </label>
              <label>Valor da parcela
                <span className="finance-money-input"><span>R$</span><input inputMode="decimal" value={installmentInput} onChange={(event) => setInstallmentInput(formatCurrencyInput(event.target.value))} /></span>
              </label>
              <label>Quantidade de parcelas
                <input type="number" min="1" max="600" value={preview.installmentCount} onChange={(event) => setPreview({ ...preview, installmentCount: Number(event.target.value) })} />
              </label>
              <label>Primeiro vencimento
                <input type="date" value={preview.firstDueDate} onChange={(event) => setPreview({ ...preview, firstDueDate: event.target.value })} />
              </label>
              <label>Projeto (opcional)
                <input value={preview.project ?? ""} onChange={(event) => setPreview({ ...preview, project: event.target.value || null })} />
              </label>
              <label>Tags (separadas por vírgula)
                <input value={preview.tags.join(", ")} onChange={(event) => setPreview({ ...preview, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} />
              </label>
            </div>
            {error && <Notice error>{error}</Notice>}
            <div className="dialog-actions">
              <Button type="button" className="secondary" onClick={() => { setPreview(null); setError(""); }}>Voltar ao texto</Button>
              <Button type="button" disabled={pending} onClick={saveDebt}>{pending ? "Salvando…" : "Salvar dívida"}</Button>
            </div>
          </div>
        ) : (
          <div className="expense-capture">
            <label htmlFor="debt-capture">Qual dívida você quer acompanhar?</label>
            <textarea
              id="debt-capture"
              rows={3}
              value={capture}
              onChange={(event) => setCapture(event.target.value)}
              placeholder="Empréstimo Nubank 12000 em 24x de 650 dia 10 @Casa #reforma"
            />
            <p className="muted capture-help">Use “em 24x de 650”, o dia do vencimento, @projeto e #tags.</p>
            {error && <Notice error>{error}</Notice>}
            <Button type="button" className="full" disabled={pending || capture.trim().length < 3} onClick={reviewDebt}>
              {pending ? "Interpretando…" : "Revisar dívida"}
            </Button>
          </div>
        )}
      </Dialog>

      <Dialog
        dialogRef={detailDialog}
        eyebrow="Dívida"
        title={selected?.title ?? "Detalhes"}
      >
        {selected && detailMode === "detail" && (
          <div className="debt-detail">
            <span className={`status-tag ${statusClass(selected.status)}`}>{selected.status}</span>
            <div className="debt-balance-card">
              <span>Saldo devedor</span>
              <strong>{money.format(selected.balanceCents / 100)}</strong>
              <small>{money.format(selected.paidCents / 100)} pagos de {money.format(selected.originalBalanceCents / 100)}</small>
            </div>
            <div className="debt-detail-progress">
              <span><strong>{selected.paidInstallmentCount} de {selected.installmentCount}</strong> parcelas pagas</span>
              <span>{Math.round((selected.paidCents / selected.originalBalanceCents) * 100)}%</span>
              <i><b style={{ width: `${Math.min(100, (selected.paidCents / selected.originalBalanceCents) * 100)}%` }} /></i>
            </div>
            <dl className="debt-facts">
              <div><dt>Próxima parcela</dt><dd>{selected.nextDueDate ? money.format(selected.installmentCents / 100) : "—"}</dd></div>
              <div><dt>Vencimento</dt><dd>{selected.nextDueDate ? shortDate(selected.nextDueDate) : "Quitada"}</dd></div>
              <div><dt>Projeto</dt><dd>{selected.project ? `@${selected.project}` : "—"}</dd></div>
              <div><dt>Tags</dt><dd>{selected.tags.length ? selected.tags.map((tag) => `#${tag}`).join(" ") : "—"}</dd></div>
            </dl>
            {selected.status !== "Quitada" && (
              <div className="debt-actions">
                <Button type="button" onClick={() => startPayment("regular")}>Registrar pagamento</Button>
                <Button type="button" className="secondary" onClick={() => startPayment("extra")}>Pagamento extra</Button>
              </div>
            )}
            <section className="debt-history">
              <h3>Últimos pagamentos</h3>
              {selected.history.length ? selected.history.map((payment) => (
                <div key={payment.id}>
                  <span>
                    <strong>{longDate(payment.paidAt)}</strong>
                    <small>{payment.kind === "regular" ? `Parcela ${payment.installmentNumber}` : "Pagamento extra"} · {paymentMethodLabel(payment.paymentMethod)}</small>
                  </span>
                  <strong>{money.format(payment.amountCents / 100)}</strong>
                </div>
              )) : <p className="muted">Nenhum pagamento registrado.</p>}
            </section>
          </div>
        )}

        {selected && detailMode === "payment" && (
          <form className="bill-payment-form debt-payment-form" onSubmit={savePayment} aria-busy={pending}>
            <button type="button" className="debt-back" onClick={() => { setDetailMode("detail"); setError(""); }}>
              <ArrowLeft aria-hidden size={17} /> Voltar aos detalhes
            </button>
            <div>
              <span className="finance-eyebrow">{paymentKind === "extra" ? "Pagamento extra" : "Registrar pagamento"}</span>
              <h3>{paymentKind === "extra" ? "Amortizar saldo" : `Parcela ${selected.installmentNumber} de ${selected.installmentCount}`}</h3>
              <p className="muted">{paymentKind === "regular" ? "O valor previsto pode ser ajustado antes de confirmar." : "Este valor reduz o saldo sem avançar a próxima parcela."}</p>
            </div>
            <label>Valor pago
              <span className="finance-money-input"><span>R$</span><input inputMode="decimal" required value={paymentAmount} onChange={(event) => setPaymentAmount(formatCurrencyInput(event.target.value))} /></span>
            </label>
            <label>Data do pagamento<input type="date" required max={today} value={paidAt} onChange={(event) => setPaidAt(event.target.value)} /></label>
            <label>Forma de pagamento<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as DebtPaymentMethod | "")}>{paymentOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <div className="bill-impact-note"><Info aria-hidden size={18} /><span>Após o pagamento, o saldo será <strong>{money.format(resultingBalance / 100)}</strong>.</span></div>
            {error && <Notice error>{error}</Notice>}
            <Button type="submit" disabled={pending}>{pending ? "Confirmando…" : "Confirmar pagamento"}</Button>
          </form>
        )}
      </Dialog>
    </div>
  );
}
