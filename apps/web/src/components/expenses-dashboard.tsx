"use client";

import {
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Plus,
  Receipt,
  RotateCcw,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";
import type {
  ExpensePaymentMethod,
  getExpensesMonth,
} from "@rotina/domain";
import { Button, Notice } from "@rotina/ui";

type ExpenseData = Awaited<ReturnType<typeof getExpensesMonth>>;
type ExpenseEntry = ExpenseData["entries"][number];
type ExpensePreview = {
  title: string;
  amountCents: number;
  spentAt: string;
  paymentMethod: ExpensePaymentMethod;
  paymentLabel: string;
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
const paymentOptions: Array<[ExpensePaymentMethod, string]> = [
  ["pix", "Pix"],
  ["cash", "Dinheiro"],
  ["debit", "Cartão de débito"],
  ["meal_voucher", "Vale-refeição"],
  ["food_voucher", "Vale-alimentação"],
];

function monthName(value: string) {
  return monthLabel.format(new Date(`${value}-01T12:00:00`));
}

function capitalizedMonthName(value: string) {
  const label = monthName(value);
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

function moveMonth(value: string, amount: number) {
  const date = new Date(`${value}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
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

async function expenseRequest(action: string, body: Record<string, unknown>) {
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

function dayHeading(value: string, today: string) {
  if (value === today) return "Hoje";
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (value === yesterday.toISOString().slice(0, 10)) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
  }).format(new Date(`${value}T12:00:00`));
}

function EntryIcon({ entry }: { entry: ExpenseEntry }) {
  if (entry.kind === "refund") return <RotateCcw aria-hidden size={19} />;
  if (entry.sourceKind === "card") return <CreditCard aria-hidden size={19} />;
  if (entry.sourceKind === "benefit") return <Utensils aria-hidden size={19} />;
  return <Banknote aria-hidden size={19} />;
}

export function ExpensesDashboard({
  data,
  today,
}: {
  data: ExpenseData;
  today: string;
}) {
  const router = useRouter();
  const captureDialog = useRef<HTMLDialogElement>(null);
  const expenseKey = useRef(crypto.randomUUID());
  const [capture, setCapture] = useState("");
  const [preview, setPreview] = useState<ExpensePreview | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [filter, setFilter] = useState<
    "all" | "account" | "card" | "benefit"
  >("all");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3800);
    return () => window.clearTimeout(timer);
  }, [message]);

  const entries = data.entries.filter(
    (entry) => filter === "all" || entry.sourceKind === filter,
  );
  const groups = new Map<string, ExpenseEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.spentAt) ?? [];
    group.push(entry);
    groups.set(entry.spentAt, group);
  }

  function startExpense() {
    setCapture("");
    setPreview(null);
    setAmountInput("");
    setError("");
    openDialog(captureDialog.current);
  }

  async function reviewExpense() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await expenseRequest("preview-expense", {
        text: capture,
        spentAt: today,
      });
      setPreview(result.preview);
      setAmountInput(
        (result.preview.amountCents / 100).toFixed(2).replace(".", ","),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível interpretar o gasto.",
      );
    } finally {
      setPending(false);
    }
  }

  async function saveExpense() {
    if (!preview || pending) return;
    const amountCents = centsFromInput(amountInput);
    if (!amountCents) {
      setError("Informe um valor válido, como 35,90.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await expenseRequest("expense", {
        ...preview,
        amountCents,
        idempotencyKey: expenseKey.current,
      });
      closeDialog(captureDialog.current);
      expenseKey.current = crypto.randomUUID();
      setCapture("");
      setPreview(null);
      setAmountInput("");
      setMessage(result.message);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível salvar o gasto.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="finance-page expenses-page">
      <div className="finance-content">
        <nav className="finance-module-nav" aria-label="Módulos financeiros">
          <Link href="/financas/gastos" aria-current="page">
            Gastos
          </Link>
          <Link href="/financas/cartoes">Cartões e faturas</Link>
        </nav>

        <header className="finance-header">
          <div>
            <span className="finance-eyebrow">Finanças</span>
            <h1>Gastos</h1>
            <p className="muted">Acompanhe onde seu dinheiro foi usado.</p>
          </div>
          <Button type="button" onClick={startExpense}>
            <Plus aria-hidden size={18} /> Novo gasto
          </Button>
        </header>

        <div className="finance-month" aria-label="Selecionar mês">
          <button
            type="button"
            className="icon-button"
            aria-label="Mês anterior"
            onClick={() =>
              router.push(`/financas/gastos?mes=${moveMonth(data.month, -1)}`)
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
              router.push(`/financas/gastos?mes=${moveMonth(data.month, 1)}`)
            }
          >
            <ChevronRight aria-hidden size={20} />
          </button>
        </div>

        <section className="finance-featured expenses-featured">
          <div>
            <p>Total gasto no mês</p>
            <strong>{money.format(data.summary.totalCents / 100)}</strong>
            <span>Inclui compras no cartão pela data da compra</span>
          </div>
          <div className="finance-next-due">
            <span>Maior categoria</span>
            <strong>
              {data.summary.largestCategory
                ? `${data.summary.largestCategory} · ${money.format(data.summary.largestCategoryCents / 100)}`
                : "Nenhuma categoria"}
            </strong>
          </div>
        </section>

        <div className="purchase-filters expense-filters" aria-label="Filtrar gastos">
          {[
            ["all", "Todos"],
            ["account", "Contas"],
            ["card", "Cartões"],
            ["benefit", "Benefícios"],
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

        {entries.length ? (
          <div className="expense-groups">
            {[...groups.entries()].map(([date, dayEntries]) => (
              <section className="finance-panel expense-day" key={date}>
                <div className="expense-day-heading">
                  <h2>{dayHeading(date, today)}</h2>
                  <span>
                    {money.format(
                      dayEntries.reduce(
                        (total, entry) => total + entry.amountCents,
                        0,
                      ) / 100,
                    )}
                  </span>
                </div>
                {dayEntries.map((entry) => (
                  <article className="expense-row" key={entry.id}>
                    <span className={`expense-icon ${entry.kind}`}>
                      <EntryIcon entry={entry} />
                    </span>
                    <div className="expense-identity">
                      <div className="invoice-name">
                        <h3 className={entry.refunded && entry.kind !== "refund" ? "refunded-title" : ""}>
                          {entry.title}
                        </h3>
                        {entry.refunded && (
                          <span className="status-tag refunded-status">
                            {entry.kind === "refund" ? "Estorno" : "Estornada"}
                          </span>
                        )}
                      </div>
                      <p className="muted">
                        {entry.sourceLabel}
                        {entry.sourceKind === "card" && entry.kind !== "refund"
                          ? " · Cartão de crédito"
                          : ""}
                        {entry.project ? ` · @${entry.project}` : ""}
                        {entry.tags.map((tag) => ` · #${tag}`).join("")}
                      </p>
                    </div>
                    <strong className={entry.amountCents < 0 ? "refund-value" : ""}>
                      {money.format(entry.amountCents / 100)}
                    </strong>
                  </article>
                ))}
              </section>
            ))}
          </div>
        ) : (
          <section className="finance-panel finance-empty-list expense-empty">
            <Receipt aria-hidden size={28} />
            <h2>Nenhum gasto neste mês</h2>
            <p>Registre um gasto para começar a acompanhar o período.</p>
            <Button type="button" onClick={startExpense}>
              Adicionar gasto
            </Button>
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
        eyebrow={preview ? "Revisar gasto" : "Novo gasto"}
        title={preview ? "Confira antes de salvar" : "Registre do seu jeito"}
      >
        {preview ? (
          <div className="purchase-review expense-review">
            <div className="expense-recognized">
              <Sparkles aria-hidden size={18} />
              Entendi como <strong>gasto pontual</strong>
            </div>
            <div className="finance-form-grid">
              <label>
                Título
                <input
                  value={preview.title}
                  maxLength={120}
                  onChange={(event) =>
                    setPreview({ ...preview, title: event.target.value })
                  }
                />
              </label>
              <label>
                Valor
                <span className="finance-money-input">
                  <span>R$</span>
                  <input
                    value={amountInput}
                    inputMode="numeric"
                    placeholder="0,00"
                    onChange={(event) =>
                      setAmountInput(formatCurrencyInput(event.target.value))
                    }
                  />
                </span>
              </label>
              <label>
                Data
                <input
                  type="date"
                  value={preview.spentAt}
                  max={today}
                  onChange={(event) =>
                    setPreview({ ...preview, spentAt: event.target.value })
                  }
                />
              </label>
              <label>
                Forma de pagamento
                <select
                  value={preview.paymentMethod}
                  onChange={(event) =>
                    setPreview({
                      ...preview,
                      paymentMethod: event.target.value as ExpensePaymentMethod,
                    })
                  }
                >
                  {paymentOptions.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Projeto <span className="muted">(opcional)</span>
                <input
                  value={preview.project ?? ""}
                  placeholder="Nenhum projeto"
                  onChange={(event) =>
                    setPreview({
                      ...preview,
                      project: event.target.value || null,
                    })
                  }
                />
              </label>
              <label>
                Tags <span className="muted">(separadas por vírgula)</span>
                <input
                  value={preview.tags.join(", ")}
                  onChange={(event) =>
                    setPreview({
                      ...preview,
                      tags: event.target.value
                        .split(",")
                        .map((tag) => tag.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
            </div>
            <p className="expense-info-note">
              Compras no cartão são registradas em Cartões e aparecem aqui
              automaticamente, sem duplicação.
            </p>
            {error && <Notice error>{error}</Notice>}
            <Button
              type="button"
              className="full"
              disabled={pending}
              onClick={saveExpense}
            >
              {pending ? "Salvando…" : "Salvar gasto"}
            </Button>
            <Button
              type="button"
              className="secondary full"
              onClick={() => {
                setPreview(null);
                setError("");
              }}
            >
              Voltar ao texto
            </Button>
          </div>
        ) : (
          <div className="expense-capture">
            <label htmlFor="expense-capture">O que você gastou?</label>
            <textarea
              id="expense-capture"
              rows={4}
              value={capture}
              placeholder="Ex.: Almoço 35,90 VR #alimentação"
              onChange={(event) => setCapture(event.target.value)}
            />
            <p className="muted capture-help">
              Use o valor, a forma de pagamento, @projeto e #tags. Você poderá
              revisar tudo.
            </p>
            {error && <Notice error>{error}</Notice>}
            <Button
              type="button"
              className="full"
              disabled={pending || !capture.trim()}
              onClick={reviewExpense}
            >
              {pending ? "Interpretando…" : "Revisar gasto"}
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
