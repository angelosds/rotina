"use client";

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Lightbulb,
  Plus,
  Receipt,
  Repeat2,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  BillPaymentMethod,
  BillRecurrence,
  getBillsMonth,
} from "@rotina/domain";
import { Button, Notice } from "@rotina/ui";

type BillsData = Awaited<ReturnType<typeof getBillsMonth>>;
type BillOccurrence = BillsData["occurrences"][number];
type BillPreview = {
  title: string;
  estimatedAmountCents: number;
  firstDueDate: string;
  recurrence: BillRecurrence;
  project: string | null;
  tags: string[];
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const monthLabel = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});
const paymentOptions: Array<[BillPaymentMethod | "", string]> = [
  ["", "Não informado"],
  ["pix", "Pix"],
  ["automatic_debit", "Débito automático"],
  ["debit", "Cartão de débito"],
  ["bank_transfer", "Transferência bancária"],
  ["cash", "Dinheiro"],
  ["other", "Outro"],
];

function capitalizedMonthName(value: string) {
  const label = monthLabel.format(new Date(`${value}-01T12:00:00`));
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

function moveMonth(value: string, amount: number) {
  const date = new Date(`${value}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

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

async function billRequest(action: string, body: Record<string, unknown>) {
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
      className="finance-dialog"
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

function statusClass(status: BillOccurrence["status"]) {
  if (status === "Vencida") return "danger-status";
  if (status === "Paga") return "active";
  return "";
}

export function BillsDashboard({
  data,
  today,
  initialBillId,
}: {
  data: BillsData;
  today: string;
  initialBillId: string | null;
}) {
  const router = useRouter();
  const captureDialog = useRef<HTMLDialogElement>(null);
  const paymentDialog = useRef<HTMLDialogElement>(null);
  const billKey = useRef(crypto.randomUUID());
  const paymentKey = useRef(crypto.randomUUID());
  const [capture, setCapture] = useState("");
  const [preview, setPreview] = useState<BillPreview | null>(null);
  const [estimateInput, setEstimateInput] = useState("");
  const [selected, setSelected] = useState<BillOccurrence | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paidAt, setPaidAt] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState<BillPaymentMethod | "">("");
  const [filter, setFilter] = useState<"all" | "pending" | "paid">("all");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3800);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!initialBillId) return;
    const occurrence = data.occurrences.find(
      (candidate) => candidate.billId === initialBillId,
    );
    if (occurrence && occurrence.status !== "Paga") {
      setSelected(occurrence);
      setPaymentAmount(
        (occurrence.estimatedAmountCents / 100).toFixed(2).replace(".", ","),
      );
      setPaidAt(today);
      setPaymentMethod("");
      setError("");
      openDialog(paymentDialog.current);
    }
  }, [data.occurrences, initialBillId, today]);

  const occurrences = data.occurrences.filter((occurrence) => {
    if (filter === "all") return true;
    if (filter === "paid") return occurrence.status === "Paga";
    return occurrence.status !== "Paga";
  });

  function startBill() {
    setCapture("");
    setPreview(null);
    setEstimateInput("");
    setError("");
    openDialog(captureDialog.current);
  }

  function startPayment(occurrence: BillOccurrence) {
    setSelected(occurrence);
    setPaymentAmount(
      (occurrence.estimatedAmountCents / 100).toFixed(2).replace(".", ","),
    );
    setPaidAt(today);
    setPaymentMethod("");
    setError("");
    openDialog(paymentDialog.current);
  }

  async function reviewBill() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await billRequest("preview-bill", {
        text: capture,
        referenceDate: today,
      });
      setPreview(result.preview);
      setEstimateInput(
        (result.preview.estimatedAmountCents / 100)
          .toFixed(2)
          .replace(".", ","),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível interpretar a despesa fixa.",
      );
    } finally {
      setPending(false);
    }
  }

  async function saveBill() {
    if (!preview || pending) return;
    const estimatedAmountCents = centsFromInput(estimateInput);
    if (!estimatedAmountCents) {
      setError("Informe um valor válido, como 99,90.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await billRequest("bill", {
        ...preview,
        estimatedAmountCents,
        idempotencyKey: billKey.current,
      });
      closeDialog(captureDialog.current);
      billKey.current = crypto.randomUUID();
      setCapture("");
      setPreview(null);
      setEstimateInput("");
      setMessage(result.message);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível salvar a despesa fixa.",
      );
    } finally {
      setPending(false);
    }
  }

  async function savePayment() {
    if (!selected || pending) return;
    const amountCents = centsFromInput(paymentAmount);
    if (!amountCents) {
      setError("Informe o valor efetivamente pago.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await billRequest("bill-payment", {
        billId: selected.billId,
        dueDate: selected.dueDate,
        amount: paymentAmount,
        paidAt,
        paymentMethod: paymentMethod || null,
        idempotencyKey: paymentKey.current,
      });
      closeDialog(paymentDialog.current);
      paymentKey.current = crypto.randomUUID();
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

  const enteredPaymentCents = centsFromInput(paymentAmount);
  const differenceCents = selected && enteredPaymentCents
    ? enteredPaymentCents - selected.estimatedAmountCents
    : 0;

  return (
    <div className="finance-page bills-page">
      <div className="finance-content">
        <nav className="finance-module-nav" aria-label="Módulos financeiros">
          <Link href="/financas/gastos">Gastos</Link>
          <Link href="/financas/contas" aria-current="page">Despesas fixas</Link>
          <Link href="/financas/cartoes">Cartões e faturas</Link>
        </nav>

        <header className="finance-header">
          <div>
            <span className="finance-eyebrow">Finanças</span>
            <h1>Despesas fixas</h1>
            <p className="muted">Acompanhe vencimentos sem duplicar seus gastos.</p>
          </div>
          <Button type="button" onClick={startBill}>
            <Plus aria-hidden size={18} /> Nova despesa fixa
          </Button>
        </header>

        <div className="finance-month" aria-label="Selecionar mês">
          <button
            type="button"
            className="icon-button"
            aria-label="Mês anterior"
            onClick={() =>
              router.push(`/financas/contas?mes=${moveMonth(data.month, -1)}`)
            }
          >
            <ChevronLeft aria-hidden size={20} />
          </button>
          <strong>{capitalizedMonthName(data.month)}</strong>
          <button
            type="button"
            className="icon-button"
            aria-label="Próximo mês"
            onClick={() =>
              router.push(`/financas/contas?mes=${moveMonth(data.month, 1)}`)
            }
          >
            <ChevronRight aria-hidden size={20} />
          </button>
        </div>

        <section className="finance-featured bills-featured">
          <div>
            <p>Despesas fixas do mês</p>
            <strong>{money.format(data.summary.totalCents / 100)}</strong>
            <span>
              {money.format(data.summary.paidCents / 100)} pagos ·{" "}
              {money.format(data.summary.remainingCents / 100)} restantes
            </span>
          </div>
        </section>

        <div className="purchase-filters bill-filters" aria-label="Filtrar despesas fixas">
          {[
            ["all", "Todas"],
            ["pending", "A pagar"],
            ["paid", "Pagas"],
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

        {occurrences.length ? (
          <section className="finance-panel bill-list" aria-label="Despesas fixas do mês">
            {occurrences.map((occurrence) => {
              const content = (
                <>
                  <span className="expense-icon bill-icon">
                    {occurrence.recurrence === "monthly" ? (
                      <Repeat2 aria-hidden size={19} />
                    ) : (
                      <Receipt aria-hidden size={19} />
                    )}
                  </span>
                  <div className="expense-identity">
                    <div className="invoice-name">
                      <h3>{occurrence.title}</h3>
                      <span className={`status-tag ${statusClass(occurrence.status)}`}>
                        {occurrence.status}
                      </span>
                    </div>
                    <p className="muted">
                      {occurrence.status === "Paga"
                        ? `Pago em ${shortDate(occurrence.paidAt!)}`
                        : `${occurrence.status === "Vencida" ? "Venceu" : "Vence"} em ${shortDate(occurrence.dueDate)}`}
                      {occurrence.project ? ` · @${occurrence.project}` : ""}
                      {occurrence.recurrence === "monthly" ? " · recorrente" : ""}
                    </p>
                  </div>
                  <strong>{money.format(occurrence.amountCents / 100)}</strong>
                </>
              );
              return occurrence.status === "Paga" ? (
                <article className="bill-row" key={occurrence.id}>{content}</article>
              ) : (
                <button
                  type="button"
                  className="bill-row bill-row-action"
                  key={occurrence.id}
                  onClick={() => startPayment(occurrence)}
                  aria-label={`Registrar pagamento de ${occurrence.title}`}
                >
                  {content}
                </button>
              );
            })}
          </section>
        ) : (
          <section className="finance-panel finance-empty-list expense-empty">
            <CircleDollarSign aria-hidden size={28} />
            <h2>Nenhuma despesa fixa neste mês</h2>
            <p>Cadastre uma despesa pontual ou recorrente para planejar o período.</p>
            <Button type="button" onClick={startBill}>Adicionar despesa fixa</Button>
          </section>
        )}
      </div>

      {message && (
        <div className="success-toast" role="status" aria-live="polite">
          <CheckCircle2 aria-hidden size={20} />
          <span>{message}</span>
          <button
            type="button"
            aria-label="Fechar confirmação"
            onClick={() => setMessage("")}
          >
            <X aria-hidden size={18} />
          </button>
        </div>
      )}

      <Dialog
        dialogRef={captureDialog}
        eyebrow={preview ? "Revisar despesa fixa" : "Nova despesa fixa"}
        title={preview ? "Confira antes de salvar" : "Registre do seu jeito"}
      >
        {preview ? (
          <div className="purchase-review expense-review">
            <div className="expense-recognized">
              <Sparkles aria-hidden size={18} />
              Entendi como <strong>{preview.recurrence === "monthly" ? "despesa recorrente" : "despesa pontual"}</strong>
            </div>
            <div className="finance-form-grid">
              <label>
                Título
                <input
                  value={preview.title}
                  maxLength={120}
                  onChange={(event) => setPreview({ ...preview, title: event.target.value })}
                />
              </label>
              <label>
                Valor estimado
                <span className="finance-money-input">
                  <span>R$</span>
                  <input
                    value={estimateInput}
                    inputMode="numeric"
                    placeholder="0,00"
                    onChange={(event) => setEstimateInput(formatCurrencyInput(event.target.value))}
                  />
                </span>
              </label>
              <label>
                Primeiro vencimento
                <input
                  type="date"
                  value={preview.firstDueDate}
                  onChange={(event) => setPreview({ ...preview, firstDueDate: event.target.value })}
                />
              </label>
              <label>
                Repetição
                <select
                  value={preview.recurrence}
                  onChange={(event) => setPreview({ ...preview, recurrence: event.target.value as BillRecurrence })}
                >
                  <option value="once">Somente uma vez</option>
                  <option value="monthly">Todo mês</option>
                </select>
              </label>
              <label>
                Projeto <span className="muted">(opcional)</span>
                <input
                  value={preview.project ?? ""}
                  placeholder="Nenhum projeto"
                  onChange={(event) => setPreview({ ...preview, project: event.target.value || null })}
                />
              </label>
              <label>
                Tags <span className="muted">(separadas por vírgula)</span>
                <input
                  value={preview.tags.join(", ")}
                  onChange={(event) => setPreview({
                    ...preview,
                    tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean),
                  })}
                />
              </label>
            </div>
            <p className="expense-info-note">
              Em despesas recorrentes, o valor serve como estimativa. Você poderá informar o valor real ao pagar cada mês.
            </p>
            {error && <Notice error>{error}</Notice>}
            <Button type="button" className="full" disabled={pending} onClick={saveBill}>
              {pending ? "Salvando…" : "Salvar despesa fixa"}
            </Button>
            <Button type="button" className="secondary full" onClick={() => { setPreview(null); setError(""); }}>
              Voltar ao texto
            </Button>
          </div>
        ) : (
          <div className="expense-capture">
            <label htmlFor="bill-capture">Qual despesa fixa você precisa pagar?</label>
            <textarea
              id="bill-capture"
              rows={4}
              value={capture}
              placeholder="Ex.: Energia 99,90 dia 19 todo mês @Casa #moradia"
              onChange={(event) => setCapture(event.target.value)}
            />
            <p className="muted capture-help">
              Use valor, vencimento, “todo mês”, @projeto e #tags. Você poderá revisar tudo.
            </p>
            {error && <Notice error>{error}</Notice>}
            <Button type="button" className="full" disabled={pending || !capture.trim()} onClick={reviewBill}>
              {pending ? "Interpretando…" : "Revisar despesa fixa"}
            </Button>
          </div>
        )}
      </Dialog>

      <Dialog
        dialogRef={paymentDialog}
        eyebrow={selected?.title ?? "Despesa fixa"}
        title="Confirmar pagamento"
      >
        {selected && (
          <div className="bill-payment-form">
            <div className="bill-payment-summary">
              <div><span>Valor planejado</span><strong>{money.format(selected.estimatedAmountCents / 100)}</strong></div>
              <div><span>Vencimento</span><strong>{longDate(selected.dueDate)}</strong></div>
            </div>
            <label>
              Valor pago
              <span className="finance-money-input">
                <span>R$</span>
                <input
                  value={paymentAmount}
                  inputMode="numeric"
                  placeholder="0,00"
                  onChange={(event) => setPaymentAmount(formatCurrencyInput(event.target.value))}
                />
              </span>
              <small>Ajuste para o valor real da despesa deste mês.</small>
            </label>
            <label>
              Data do pagamento
              <input type="date" value={paidAt} max={today} onChange={(event) => setPaidAt(event.target.value)} />
            </label>
            <label>
              Forma de pagamento <span className="muted">(opcional)</span>
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as BillPaymentMethod | "")}>
                {paymentOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <div className="bill-impact-note">
              <Lightbulb aria-hidden size={18} />
              <span>
                {differenceCents
                  ? `O total de ${capitalizedMonthName(data.month)} será ${differenceCents > 0 ? "aumentado" : "reduzido"} em ${money.format(Math.abs(differenceCents) / 100)}. `
                  : "O valor real corresponde à estimativa. "}
                {selected.recurrence === "monthly"
                  ? `A estimativa de ${money.format(selected.estimatedAmountCents / 100)} continuará nos próximos meses.`
                  : "O gasto deste mês será atualizado sem duplicação."}
              </span>
            </div>
            <p className="muted bill-payment-help">
              O pagamento substitui a estimativa deste mês pelo valor real e não cria outro gasto.
            </p>
            {error && <Notice error>{error}</Notice>}
            <Button type="button" className="full" disabled={pending} onClick={savePayment}>
              {pending ? "Registrando…" : "Marcar como paga"}
            </Button>
            <Button type="button" className="secondary full" onClick={() => closeDialog(paymentDialog.current)}>
              Cancelar
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
