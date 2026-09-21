"use client";

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Plus,
  Receipt,
  Undo2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
  type ReactNode,
} from "react";
import type { getFinanceMonth } from "@rotina/domain";
import { Button, Notice } from "@rotina/ui";

type FinanceData = Awaited<ReturnType<typeof getFinanceMonth>>;
type Invoice = FinanceData["invoices"][number];
type Charge = Invoice["charges"][number];
type PurchasePreview = {
  title: string;
  totalCents: number;
  installmentCount: number;
  installmentCents: number;
  finalInstallmentCents: number;
  cardId: string;
  cardName: string;
  purchaseDate: string;
  firstInvoiceMonth: string;
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

function monthName(value: string) {
  return monthLabel.format(new Date(`${value}-01T12:00:00`));
}

function capitalizedMonthName(value: string) {
  const label = monthName(value);
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T12:00:00`));
}

function moveMonth(value: string, amount: number) {
  const date = new Date(`${value}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

function centsFromInput(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return cents > 0 ? cents : null;
}

function formatBRLCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  return (Number(digits) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function statusClass(status: string) {
  if (status === "Vencida") return "danger-status";
  if (status === "Pago parcialmente") return "warning-status";
  if (status === "Paga" || status === "Com crédito") return "active";
  return "";
}

async function financeRequest(action: string, body: Record<string, unknown>) {
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

const dialogCloseTimers = new WeakMap<HTMLDialogElement, number>();

function openDialog(dialog: HTMLDialogElement | null) {
  if (!dialog) return;
  const closeTimer = dialogCloseTimers.get(dialog);
  if (closeTimer) window.clearTimeout(closeTimer);
  dialog.classList.remove("is-closing");
  if (!dialog.open) dialog.showModal();
}

function closeDialog(dialog: HTMLDialogElement | null) {
  if (!dialog?.open || dialog.classList.contains("is-closing")) return;
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  dialog.classList.add("is-closing");
  const timer = window.setTimeout(() => {
    dialog.close();
    dialog.classList.remove("is-closing");
    dialogCloseTimers.delete(dialog);
  }, reduceMotion ? 0 : 220);
  dialogCloseTimers.set(dialog, timer);
}

function Dialog({
  dialogRef,
  title,
  eyebrow,
  children,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  eyebrow: string;
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

export function FinanceDashboard({
  data,
  today,
}: {
  data: FinanceData;
  today: string;
}) {
  const router = useRouter();
  const cardDialog = useRef<HTMLDialogElement>(null);
  const purchaseDialog = useRef<HTMLDialogElement>(null);
  const paymentDialog = useRef<HTMLDialogElement>(null);
  const purchaseDetailDialog = useRef<HTMLDialogElement>(null);
  const purchaseKey = useRef(crypto.randomUUID());
  const paymentKey = useRef(crypto.randomUUID());
  const refundKey = useRef(crypto.randomUUID());
  const [view, setView] = useState<"invoices" | "purchases">("invoices");
  const [filter, setFilter] = useState<"all" | "single" | "installment">(
    "all",
  );
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  );
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [selectedPurchase, setSelectedPurchase] = useState<Charge | null>(null);
  const [refundConfirm, setRefundConfirm] = useState(false);
  const [refundDate, setRefundDate] = useState(today);
  const [preview, setPreview] = useState<PurchasePreview | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [cardLimit, setCardLimit] = useState("");
  const [capture, setCapture] = useState("");
  const [purchaseType, setPurchaseType] = useState<
    "single" | "installment"
  >("installment");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3800);
    return () => window.clearTimeout(timer);
  }, [message]);

  const allCharges = data.invoices.flatMap((invoice) =>
    invoice.charges.map((charge) => ({
      ...charge,
      cardName: invoice.card.name,
    })),
  );
  const charges = allCharges.filter(
    (charge) => filter === "all" || charge.kind === filter,
  );
  const selectedInvoice = data.invoices.find(
    (invoice) => invoice.card.id === selectedInvoiceId,
  );

  function navigateMonth(amount: number) {
    router.push(`/financas/cartoes?mes=${moveMonth(data.month, amount)}`);
  }

  function announce(text: string) {
    setMessage(text);
    setError("");
  }

  async function createCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setPending(true);
    setError("");
    try {
      const values = Object.fromEntries(new FormData(form));
      const result = await financeRequest("card", values);
      closeDialog(cardDialog.current);
      form.reset();
      setCardLimit("");
      announce(result.message);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível adicionar o cartão.",
      );
    } finally {
      setPending(false);
    }
  }

  async function reviewPurchase() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await financeRequest("preview-purchase", {
        text: capture,
        purchaseDate: today,
      });
      setPreview(result.preview);
      setAmountInput(
        (result.preview.totalCents / 100).toFixed(2).replace(".", ","),
      );
      setPurchaseType(
        result.preview.installmentCount > 1 ? "installment" : "single",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível revisar a compra.",
      );
    } finally {
      setPending(false);
    }
  }

  function updatePreview(values: Partial<PurchasePreview>) {
    setPreview((current) => (current ? { ...current, ...values } : current));
  }

  function selectPurchaseType(type: "single" | "installment") {
    setPurchaseType(type);
    if (!preview) return;
    updatePreview({
      installmentCount:
        type === "single"
          ? 1
          : Math.max(2, preview.installmentCount),
    });
  }

  async function savePurchase() {
    if (!preview || pending) return;
    const totalCents = centsFromInput(amountInput);
    if (!totalCents) {
      setError("Informe um valor válido, como 486,90.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await financeRequest("purchase", {
        ...preview,
        totalCents,
        installmentCount:
          purchaseType === "single" ? 1 : preview.installmentCount,
        idempotencyKey: purchaseKey.current,
      });
      purchaseKey.current = crypto.randomUUID();
      closeDialog(purchaseDialog.current);
      setPreview(null);
      announce(result.message);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível salvar a compra.",
      );
    } finally {
      setPending(false);
    }
  }

  async function savePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paymentInvoice || pending) return;
    setPending(true);
    setError("");
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const result = await financeRequest("payment", {
        ...values,
        cardId: paymentInvoice.card.id,
        invoiceMonth: `${data.month}-01`,
        idempotencyKey: paymentKey.current,
      });
      paymentKey.current = crypto.randomUUID();
      closeDialog(paymentDialog.current);
      announce(result.message);
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

  async function saveRefund() {
    if (!selectedPurchase || pending) return;
    setPending(true);
    setError("");
    try {
      const result = await financeRequest("refund-purchase", {
        purchaseId: selectedPurchase.purchaseId,
        refundedAt: refundDate,
        idempotencyKey: refundKey.current,
      });
      refundKey.current = crypto.randomUUID();
      closeDialog(purchaseDetailDialog.current);
      setSelectedPurchase(null);
      setRefundConfirm(false);
      announce(result.message);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível estornar a compra.",
      );
    } finally {
      setPending(false);
    }
  }

  function openPurchase() {
    setError("");
    setPreview(null);
    setCapture("");
    openDialog(purchaseDialog.current);
  }

  function openPurchaseDetails(charge: Charge) {
    setSelectedPurchase(charge);
    setRefundConfirm(false);
    setRefundDate(today);
    setError("");
    openDialog(purchaseDetailDialog.current);
  }

  return (
    <div className="finance-page">
      <div className="finance-content">
        <header className="finance-header">
          <div>
            <span className="finance-eyebrow">Finanças</span>
            <h1>Cartões e faturas</h1>
            <p className="muted">
              Acompanhe compras, parcelas e pagamentos sem duplicar valores.
            </p>
          </div>
          <Button
            type="button"
            onClick={openPurchase}
            disabled={!data.cards.length}
          >
            <Plus aria-hidden size={18} /> Nova compra
          </Button>
        </header>

        {!data.cards.length && (
          <section className="finance-empty-card">
            <CreditCard aria-hidden size={28} />
            <h2>Cadastre seu primeiro cartão</h2>
            <p className="muted">
              Informe fechamento e vencimento para organizar as faturas.
            </p>
            <Button
              type="button"
              onClick={() => openDialog(cardDialog.current)}
            >
              Adicionar cartão
            </Button>
          </section>
        )}

        <div className="finance-month" aria-label="Selecionar mês">
          <button
            type="button"
            className="icon-button"
            aria-label="Mês anterior"
            onClick={() => navigateMonth(-1)}
          >
            <ChevronLeft aria-hidden size={20} />
          </button>
          <strong>{capitalizedMonthName(data.month)}</strong>
          <button
            type="button"
            className="icon-button"
            aria-label="Próximo mês"
            onClick={() => navigateMonth(1)}
          >
            <ChevronRight aria-hidden size={20} />
          </button>
        </div>

        <section className="finance-featured">
          <div>
            <p>Total das faturas de {monthName(data.month).split(" de ")[0]}</p>
            <strong>{money.format(data.summary.totalCents / 100)}</strong>
            <span>
              {money.format(data.summary.paidCents / 100)} pagos ·{" "}
              {money.format(data.summary.remainingCents / 100)} restantes
            </span>
            {data.summary.creditCents > 0 && (
              <span>
                {money.format(data.summary.creditCents / 100)} em crédito
              </span>
            )}
          </div>
          <div className="finance-next-due">
            <span>Próximo vencimento</span>
            <strong>
              {data.summary.nextDueDate
                ? `${shortDate(data.summary.nextDueDate)} · ${data.summary.nextDueCard}`
                : "Nenhuma pendência"}
            </strong>
          </div>
        </section>

        <div className="finance-tabs" role="tablist" aria-label="Visão financeira">
          <button
            type="button"
            role="tab"
            aria-selected={view === "invoices"}
            onClick={() => setView("invoices")}
          >
            Faturas <span>{data.invoices.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "purchases"}
            onClick={() => setView("purchases")}
          >
            Compras <span>{allCharges.length}</span>
          </button>
        </div>

        {view === "invoices" ? (
          <section className="finance-panel">
            <div className="finance-section-heading">
              <div>
                <h2>Faturas do mês</h2>
                <p className="muted">
                  Valores das compras atribuídas a cada cartão.
                </p>
              </div>
              <Button
                type="button"
                className="secondary"
                onClick={() => openDialog(cardDialog.current)}
              >
                <CreditCard aria-hidden size={18} /> Adicionar cartão
              </Button>
            </div>
            {data.invoices.length === 0 ? (
              <div className="finance-empty-list">
                <Receipt aria-hidden size={28} />
                <p>Nenhuma fatura neste mês.</p>
              </div>
            ) : (
              data.invoices.map((invoice) => (
                <article className="invoice-row" key={invoice.card.id}>
                  <div className="invoice-identity">
                    <span className="card-symbol">
                      {invoice.card.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <div className="invoice-name">
                        <h3>{invoice.card.name}</h3>
                        <span
                          className={`status-tag ${statusClass(invoice.status)}`}
                        >
                          {invoice.status}
                        </span>
                      </div>
                      <p className="muted">
                        Fecha dia {invoice.card.closingDay} · vence em{" "}
                        {shortDate(invoice.dueDate)}
                      </p>
                    </div>
                  </div>
                  <div className="invoice-value">
                    <strong>
                      {money.format(
                        (invoice.creditCents || invoice.remainingCents) / 100,
                      )}
                    </strong>
                    <span>
                      {invoice.creditCents
                        ? "Crédito disponível"
                        : invoice.paidCents
                        ? `${money.format(invoice.totalCents / 100)} no total`
                        : "Restante da fatura"}
                    </span>
                  </div>
                  <Button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setSelectedInvoiceId(
                        selectedInvoiceId === invoice.card.id
                          ? null
                          : invoice.card.id,
                      )
                    }
                  >
                    {selectedInvoiceId === invoice.card.id
                      ? "Fechar detalhes"
                      : "Ver fatura"}
                  </Button>
                </article>
              ))
            )}

            {selectedInvoice && (
              <div className="invoice-detail">
                <div className="finance-section-heading">
                  <div>
                    <span className="finance-eyebrow">
                      {selectedInvoice.card.name} · {monthName(data.month)}
                    </span>
                    <h2>Compras e parcelas</h2>
                  </div>
                </div>
                {selectedInvoice.charges.length ? (
                  selectedInvoice.charges.map((charge) => (
                    <div className="charge-row" key={charge.id}>
                      <div>
                        <strong>{charge.title}</strong>
                        <span>
                          {charge.kind === "single"
                            ? "Compra pontual"
                            : charge.kind === "refund"
                              ? "Estorno da compra"
                              : `${charge.installmentNumber} de ${charge.installmentCount} parcelas`}
                          {charge.project ? ` · @${charge.project}` : ""}
                          {charge.tags.map((tag) => ` · #${tag}`).join("")}
                        </span>
                      </div>
                      <strong>{money.format(charge.amountCents / 100)}</strong>
                    </div>
                  ))
                ) : (
                  <p className="muted">Nenhuma compra nesta fatura.</p>
                )}
                <div className="invoice-detail-footer">
                  <div>
                    <span>
                      {selectedInvoice.creditCents
                        ? "Crédito disponível"
                        : "Restante da fatura"}
                    </span>
                    <strong>
                      {money.format(
                        (selectedInvoice.creditCents ||
                          selectedInvoice.remainingCents) / 100,
                      )}
                    </strong>
                  </div>
                  <Button
                    type="button"
                    disabled={
                      selectedInvoice.remainingCents === 0 ||
                      selectedInvoice.creditCents > 0
                    }
                    onClick={() => {
                      setPaymentInvoice(selectedInvoice);
                      setError("");
                      openDialog(paymentDialog.current);
                    }}
                  >
                    Registrar pagamento
                  </Button>
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="finance-panel">
            <div className="finance-section-heading">
              <div>
                <h2>Compras nas faturas de {monthName(data.month)}</h2>
                <p className="muted">
                  Compras pontuais e parcelas que compõem o mês selecionado.
                </p>
              </div>
            </div>
            <div className="purchase-filters" aria-label="Filtrar compras">
              {[
                ["all", "Todas"],
                ["single", "Pontuais"],
                ["installment", "Parceladas"],
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
            {charges.length ? (
              charges.map((charge) => (
                <article
                  className="purchase-row purchase-row-action"
                  key={charge.id}
                  onClick={() => openPurchaseDetails(charge)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPurchaseDetails(charge);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Ver detalhes de ${charge.originalTitle}`}
                >
                  <div className="purchase-row-top">
                    <div>
                      <div className="invoice-name">
                        <h3 className={charge.refunded ? "refunded-title" : ""}>
                          {charge.title}
                        </h3>
                        <span
                          className={`status-tag ${charge.refunded ? "refunded-status" : "active"}`}
                        >
                          {charge.kind === "refund"
                            ? "Estorno"
                            : charge.refunded
                              ? "Estornada"
                              : charge.kind === "single"
                                ? "Pontual"
                                : `Parcela ${charge.installmentNumber} de ${charge.installmentCount}`}
                        </span>
                      </div>
                      <p className="muted">
                        {charge.cardName} · {shortDate(charge.purchaseDate)}
                        {charge.project ? ` · @${charge.project}` : ""}
                        {charge.tags.map((tag) => ` · #${tag}`).join("")}
                      </p>
                    </div>
                    <strong>{money.format(charge.amountCents / 100)}</strong>
                  </div>
                  {charge.kind === "installment" && !charge.refunded && (
                    <div
                      className="installment-progress"
                      role="progressbar"
                      aria-label={`Progresso de ${charge.title}: parcela ${charge.installmentNumber} de ${charge.installmentCount}`}
                      aria-valuemin={0}
                      aria-valuemax={charge.installmentCount}
                      aria-valuenow={charge.installmentNumber}
                    >
                      <span
                        style={{
                          width: `${(charge.installmentNumber / charge.installmentCount) * 100}%`,
                        }}
                      />
                    </div>
                  )}
                  <p className="small">
                    {charge.kind === "single"
                      ? `Inteira na fatura de ${monthName(data.month)}`
                      : charge.kind === "refund"
                        ? `${charge.refund!.refundedInstallmentCount} parcelas cobradas · ${charge.refund!.canceledInstallmentCount} canceladas`
                        : `Compra total ${money.format(charge.totalCents / 100)}`}
                  </p>
                </article>
              ))
            ) : (
              <div className="finance-empty-list">
                <Receipt aria-hidden size={28} />
                <p>Nenhuma compra neste mês.</p>
              </div>
            )}
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

      <Dialog dialogRef={cardDialog} eyebrow="Cartões" title="Adicionar cartão">
        <form onSubmit={createCard} aria-busy={pending}>
          <label>
            Nome do cartão
            <input name="name" required maxLength={50} placeholder="Nubank" />
          </label>
          <div className="finance-form-grid finance-day-grid">
            <label>
              Dia de fechamento
              <input
                name="closingDay"
                type="text"
                inputMode="numeric"
                maxLength={2}
                pattern="(?:0?[1-9]|1[0-9]|2[0-8])"
                placeholder="Ex.: 15"
                aria-describedby="card-days-help"
                required
                onInput={(event) => {
                  event.currentTarget.value = event.currentTarget.value
                    .replace(/\D/g, "")
                    .slice(0, 2);
                }}
              />
            </label>
            <label>
              Dia de vencimento
              <input
                name="dueDay"
                type="text"
                inputMode="numeric"
                maxLength={2}
                pattern="(?:0?[1-9]|1[0-9]|2[0-8])"
                placeholder="Ex.: 22"
                aria-describedby="card-days-help"
                required
                onInput={(event) => {
                  event.currentTarget.value = event.currentTarget.value
                    .replace(/\D/g, "")
                    .slice(0, 2);
                }}
              />
            </label>
          </div>
          <p id="card-days-help" className="small finance-field-help">
            Digite somente o dia, entre 01 e 28.
          </p>
          <label>
            Limite do cartão <span className="small">(opcional)</span>
            <span className="finance-money-input">
              <span aria-hidden="true">R$</span>
              <input
                name="creditLimit"
                inputMode="numeric"
                placeholder="0,00"
                aria-label="Limite do cartão em reais"
                value={cardLimit}
                onChange={(event) =>
                  setCardLimit(formatBRLCurrencyInput(event.target.value))
                }
              />
            </span>
          </label>
          {error && <Notice error>{error}</Notice>}
          <Button type="submit" className="full" disabled={pending}>
            {pending ? "Salvando…" : "Adicionar cartão"}
          </Button>
        </form>
      </Dialog>

      <Dialog
        dialogRef={purchaseDialog}
        eyebrow="Nova compra"
        title="Registre do seu jeito"
      >
        {!preview ? (
          <>
            <label>
              O que você comprou?
              <textarea
                rows={3}
                value={capture}
                placeholder="Ex.: Notebook 3600 em 10x Nubank @Escritório #equipamentos"
                onChange={(event) => setCapture(event.target.value)}
              />
            </label>
            <p className="small capture-help">
              Use “em 10x”, o nome do cartão, @projeto e #tags. Você poderá
              revisar tudo.
            </p>
            {error && <Notice error>{error}</Notice>}
            <Button
              type="button"
              className="full"
              disabled={pending}
              onClick={reviewPurchase}
            >
              {pending ? "Interpretando…" : "Revisar compra"}
            </Button>
          </>
        ) : (
          <div className="purchase-review">
            <div className="purchase-type-toggle" aria-label="Tipo da compra">
              <button
                type="button"
                aria-pressed={purchaseType === "single"}
                onClick={() => selectPurchaseType("single")}
              >
                Pontual
              </button>
              <button
                type="button"
                aria-pressed={purchaseType === "installment"}
                onClick={() => selectPurchaseType("installment")}
              >
                Parcelada
              </button>
            </div>
            <label>
              Descrição
              <input
                value={preview.title}
                maxLength={120}
                onChange={(event) => updatePreview({ title: event.target.value })}
              />
            </label>
            <div className="finance-form-grid">
              <label>
                Valor total
                <input
                  value={amountInput}
                  inputMode="decimal"
                  onChange={(event) => setAmountInput(event.target.value)}
                />
              </label>
              {purchaseType === "installment" && (
                <label>
                  Parcelas
                  <input
                    type="number"
                    min="2"
                    max="120"
                    value={preview.installmentCount}
                    onChange={(event) =>
                      updatePreview({ installmentCount: Number(event.target.value) })
                    }
                  />
                </label>
              )}
            </div>
            <label>
              Cartão
              <select
                value={preview.cardId}
                onChange={(event) => updatePreview({ cardId: event.target.value })}
              >
                {data.cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="finance-form-grid">
              <label>
                Data da compra
                <input
                  type="date"
                  value={preview.purchaseDate}
                  onChange={(event) =>
                    updatePreview({ purchaseDate: event.target.value })
                  }
                />
              </label>
              <label>
                {purchaseType === "single" ? "Fatura" : "Primeira fatura"}
                <input
                  type="month"
                  value={preview.firstInvoiceMonth.slice(0, 7)}
                  onChange={(event) =>
                    updatePreview({ firstInvoiceMonth: `${event.target.value}-01` })
                  }
                />
              </label>
            </div>
            <div className="finance-form-grid">
              <label>
                Projeto <span className="small">(opcional)</span>
                <input
                  value={preview.project ?? ""}
                  maxLength={60}
                  placeholder="Escritório"
                  onChange={(event) =>
                    updatePreview({ project: event.target.value || null })
                  }
                />
              </label>
              <label>
                Tags <span className="small">(separadas por vírgula)</span>
                <input
                  value={preview.tags.join(", ")}
                  placeholder="equipamentos, trabalho"
                  onChange={(event) =>
                    updatePreview({
                      tags: event.target.value
                        .split(",")
                        .map((tag) => tag.trim().replace(/^#/, ""))
                        .filter(Boolean)
                        .slice(0, 10),
                    })
                  }
                />
              </label>
            </div>
            {(preview.project || preview.tags.length > 0) && (
              <div className="review-chips">
                {preview.project && <span>@{preview.project}</span>}
                {preview.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            )}
            <p className="small capture-help">
              {purchaseType === "single"
                ? "O valor inteiro será incluído somente na fatura escolhida."
                : `Serão ${preview.installmentCount} parcelas vinculadas à compra original.`}
            </p>
            {error && <Notice error>{error}</Notice>}
            <div className="dialog-actions">
              <Button
                type="button"
                className="secondary"
                onClick={() => setPreview(null)}
              >
                Voltar ao texto
              </Button>
              <Button type="button" disabled={pending} onClick={savePurchase}>
                {pending
                  ? "Salvando…"
                  : purchaseType === "single"
                    ? "Salvar compra pontual"
                    : "Salvar compra parcelada"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        dialogRef={paymentDialog}
        eyebrow={`${paymentInvoice?.card.name ?? "Fatura"} · ${monthName(data.month)}`}
        title="Registrar pagamento"
      >
        {paymentInvoice && (
          <form onSubmit={savePayment} aria-busy={pending}>
            <div className="payment-summary">
              <span>Restante da fatura</span>
              <strong>{money.format(paymentInvoice.remainingCents / 100)}</strong>
            </div>
            <label>
              Valor pago
              <input
                name="amount"
                inputMode="decimal"
                required
                defaultValue={(paymentInvoice.remainingCents / 100)
                  .toFixed(2)
                  .replace(".", ",")}
              />
            </label>
            <label>
              Data do pagamento
              <input name="paidAt" type="date" required defaultValue={today} />
            </label>
            <p className="small capture-help">
              O pagamento reduz o restante da fatura e não cria uma segunda
              despesa.
            </p>
            {error && <Notice error>{error}</Notice>}
            <Button type="submit" className="full" disabled={pending}>
              {pending ? "Registrando…" : "Registrar pagamento"}
            </Button>
          </form>
        )}
      </Dialog>

      <Dialog
        dialogRef={purchaseDetailDialog}
        eyebrow={refundConfirm ? "Confirmar estorno" : "Detalhes da compra"}
        title={
          refundConfirm
            ? `Estornar ${selectedPurchase?.originalTitle ?? "compra"}?`
            : selectedPurchase?.originalTitle ?? "Compra"
        }
      >
        {selectedPurchase &&
          (refundConfirm ? (
            <div className="purchase-review">
              <p className="muted">
                A compra continuará no histórico, identificada como estornada.
              </p>
              <div className="purchase-detail-summary">
                <div>
                  <span>Compra original</span>
                  <strong>
                    {money.format(selectedPurchase.totalCents / 100)}
                  </strong>
                </div>
                <div>
                  <span>Parcelas afetadas</span>
                  <strong>
                    {selectedPurchase.installmentCount === 1
                      ? "Compra pontual"
                      : `Todas as ${selectedPurchase.installmentCount}`}
                  </strong>
                </div>
              </div>
              <label>
                Data do estorno
                <input
                  type="date"
                  value={refundDate}
                  min={selectedPurchase.purchaseDate}
                  max={today}
                  onChange={(event) => setRefundDate(event.target.value)}
                />
              </label>
              <p className="refund-warning">
                O crédito entrará na fatura do mês desta data. Faturas
                anteriores e pagamentos registrados não serão apagados.
              </p>
              {error && <Notice error>{error}</Notice>}
              <div className="dialog-actions">
                <Button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setRefundConfirm(false);
                    setError("");
                  }}
                >
                  Manter compra
                </Button>
                <Button
                  type="button"
                  className="danger-confirm"
                  disabled={pending}
                  onClick={saveRefund}
                >
                  {pending ? "Estornando…" : "Confirmar estorno"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="purchase-review">
              <div className="purchase-detail-summary">
                <div>
                  <span>Valor total</span>
                  <strong>
                    {money.format(selectedPurchase.totalCents / 100)}
                  </strong>
                </div>
                <div>
                  <span>Tipo</span>
                  <strong>
                    {selectedPurchase.installmentCount === 1
                      ? "Compra pontual"
                      : `${selectedPurchase.installmentCount} parcelas`}
                  </strong>
                </div>
                <div>
                  <span>Cartão</span>
                  <strong>{selectedPurchase.cardName}</strong>
                </div>
              </div>
              {selectedPurchase.refund ? (
                <div className="refund-history">
                  <span className="status-tag refunded-status">Estornada</span>
                  <p className="muted">
                    Estorno em {shortDate(selectedPurchase.refund.refundedAt)} ·{" "}
                    {money.format(selectedPurchase.refund.creditCents / 100)} de
                    crédito
                  </p>
                </div>
              ) : (
                <Button
                  type="button"
                  className="full refund-action"
                  onClick={() => setRefundConfirm(true)}
                >
                  <Undo2 aria-hidden size={18} /> Estornar compra
                </Button>
              )}
            </div>
          ))}
      </Dialog>
    </div>
  );
}
