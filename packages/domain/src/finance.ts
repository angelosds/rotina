import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type Database, schema, and, eq } from "@rotina/db";
import { AccessError } from "./errors";

const daySchema = z.coerce.number().int().min(1).max(28);
const centsSchema = z.coerce.number().int().positive().max(2_000_000_000);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .transform((value) => `${value}-01`);
const storedMonthSchema = z.string().regex(/^\d{4}-\d{2}-01$/);

function monthIndex(value: string) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  return year! * 12 + month! - 1;
}

export function addMonths(value: string, amount: number) {
  const index = monthIndex(value) + amount;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function installmentAmount(
  totalCents: number,
  count: number,
  installment: number,
) {
  const base = Math.floor(totalCents / count);
  return installment === count ? base + (totalCents - base * count) : base;
}

export function parseMoney(value: string) {
  const input = value.replace(/R\$/gi, "").replace(/\s/g, "");
  const normalized = input.includes(",")
    ? input.replaceAll(".", "").replace(",", ".")
    : input;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized))
    throw new AccessError("Informe um valor válido, como 486,90.");
  const cents = Math.round(Number(normalized) * 100);
  return centsSchema.parse(cents);
}

function tagsFromStorage(value: string) {
  try {
    const result = JSON.parse(value);
    return Array.isArray(result)
      ? result.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

export async function createCreditCard(
  db: Database,
  userId: string,
  input: {
    name: string;
    closingDay: number | string;
    dueDay: number | string;
    creditLimit?: string | null;
  },
) {
  const name = z.string().trim().min(1).max(50).parse(input.name);
  const closingDay = daySchema.parse(input.closingDay);
  const dueDay = daySchema.parse(input.dueDay);
  const creditLimitCents = input.creditLimit?.trim()
    ? parseMoney(input.creditLimit)
    : null;
  const cards = await db
    .select({ name: schema.creditCard.name })
    .from(schema.creditCard)
    .where(eq(schema.creditCard.userId, userId));
  if (cards.some((card) => card.name.toLowerCase() === name.toLowerCase()))
    throw new AccessError("Você já tem um cartão com esse nome.");
  const [card] = await db
    .insert(schema.creditCard)
    .values({
      id: randomUUID(),
      userId,
      name,
      closingDay,
      dueDay,
      creditLimitCents,
    })
    .returning();
  return card!;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function previewCardPurchase(
  db: Database,
  userId: string,
  text: string,
  purchaseDate: string,
) {
  text = z.string().trim().min(3).max(500).parse(text);
  dateSchema.parse(purchaseDate);
  const cards = await db
    .select()
    .from(schema.creditCard)
    .where(eq(schema.creditCard.userId, userId));
  if (!cards.length)
    throw new AccessError("Cadastre um cartão antes de registrar uma compra.");
  const folded = text.toLocaleLowerCase("pt-BR");
  const card = [...cards]
    .sort((a, b) => b.name.length - a.name.length)
    .find((candidate) =>
      folded.includes(candidate.name.toLocaleLowerCase("pt-BR")),
    );
  if (!card)
    throw new AccessError("Informe no texto qual cartão foi usado.");

  const installmentMatch = text.match(/\bem\s+(\d{1,3})x\b/i);
  const installmentCount = installmentMatch
    ? z.coerce.number().int().min(2).max(120).parse(installmentMatch[1])
    : 1;
  const amountMatch = text.match(
    /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)/,
  );
  if (!amountMatch)
    throw new AccessError("Informe o valor da compra no texto.");
  const totalCents = parseMoney(amountMatch[1]!);
  const tags = Array.from(
    text.matchAll(/#([\p{L}\d_-]+)/gu),
    (match) => match[1]!,
  );
  const project = text.match(/@([\p{L}\d_-]+)/u)?.[1] ?? null;
  let title = text
    .replace(amountMatch[0], " ")
    .replace(/\bem\s+\d{1,3}x\b/i, " ")
    .replace(new RegExp(escapeRegex(card.name), "i"), " ")
    .replace(/#[\p{L}\d_-]+/gu, " ")
    .replace(/@[\p{L}\d_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  title = title.replace(/^[-–—·,;:]+|[-–—·,;:]+$/g, "").trim();
  if (!title) throw new AccessError("Informe uma descrição para a compra.");
  const day = Number(purchaseDate.slice(8, 10));
  const purchaseMonth = `${purchaseDate.slice(0, 7)}-01`;
  const firstInvoiceMonth =
    day <= card.closingDay ? purchaseMonth : addMonths(purchaseMonth, 1);
  return {
    title,
    totalCents,
    installmentCount,
    installmentCents: installmentAmount(totalCents, installmentCount, 1),
    finalInstallmentCents: installmentAmount(
      totalCents,
      installmentCount,
      installmentCount,
    ),
    cardId: card.id,
    cardName: card.name,
    purchaseDate,
    firstInvoiceMonth,
    project,
    tags,
  };
}

export async function createCardPurchase(
  db: Database,
  userId: string,
  input: {
    title: string;
    totalCents: number;
    installmentCount: number;
    cardId: string;
    purchaseDate: string;
    firstInvoiceMonth: string;
    project?: string | null;
    tags?: string[];
    idempotencyKey: string;
  },
) {
  const parsed = z
    .object({
      title: z.string().trim().min(1).max(120),
      totalCents: centsSchema,
      installmentCount: z.coerce.number().int().min(1).max(120),
      cardId: z.uuid(),
      purchaseDate: dateSchema,
      firstInvoiceMonth: storedMonthSchema,
      project: z.string().trim().max(60).nullable().optional(),
      tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
      idempotencyKey: z.uuid(),
    })
    .parse(input);
  const [idempotentPurchase] = await db
    .select()
    .from(schema.cardPurchase)
    .where(eq(schema.cardPurchase.idempotencyKey, parsed.idempotencyKey));
  if (idempotentPurchase) {
    if (idempotentPurchase.userId !== userId)
      throw new AccessError("Não foi possível confirmar a compra.");
    return idempotentPurchase;
  }
  const [card] = await db
    .select({ id: schema.creditCard.id })
    .from(schema.creditCard)
    .where(
      and(
        eq(schema.creditCard.id, parsed.cardId),
        eq(schema.creditCard.userId, userId),
      ),
    );
  if (!card) throw new AccessError("Cartão não encontrado.");
  const [created] = await db
    .insert(schema.cardPurchase)
    .values({
      id: randomUUID(),
      userId,
      cardId: parsed.cardId,
      title: parsed.title,
      purchaseDate: parsed.purchaseDate,
      totalCents: parsed.totalCents,
      installmentCount: parsed.installmentCount,
      firstInvoiceMonth: parsed.firstInvoiceMonth,
      project: parsed.project || null,
      tags: JSON.stringify(parsed.tags),
      idempotencyKey: parsed.idempotencyKey,
    })
    .onConflictDoNothing({ target: schema.cardPurchase.idempotencyKey })
    .returning();
  if (created) return created;
  const [existing] = await db
    .select()
    .from(schema.cardPurchase)
    .where(eq(schema.cardPurchase.idempotencyKey, parsed.idempotencyKey));
  if (!existing || existing.userId !== userId)
    throw new AccessError("Não foi possível confirmar a compra.");
  return existing;
}

export async function getFinanceMonth(
  db: Database,
  userId: string,
  requestedMonth: string,
  today: string,
) {
  const invoiceMonth = monthSchema.parse(requestedMonth);
  dateSchema.parse(today);
  const [cards, purchases, payments] = await Promise.all([
    db
      .select()
      .from(schema.creditCard)
      .where(eq(schema.creditCard.userId, userId)),
    db
      .select()
      .from(schema.cardPurchase)
      .where(eq(schema.cardPurchase.userId, userId)),
    db
      .select()
      .from(schema.invoicePayment)
      .where(eq(schema.invoicePayment.userId, userId)),
  ]);
  const currentMonth = `${today.slice(0, 7)}-01`;
  const todayDay = Number(today.slice(8, 10));
  const invoices = cards.map((card) => {
    const charges = purchases
      .filter((purchase) => purchase.cardId === card.id)
      .map((purchase) => {
        const offset =
          monthIndex(invoiceMonth) - monthIndex(purchase.firstInvoiceMonth);
        if (offset < 0 || offset >= purchase.installmentCount) return null;
        const installmentNumber = offset + 1;
        return {
          id: purchase.id,
          title: purchase.title,
          purchaseDate: purchase.purchaseDate,
          kind: purchase.installmentCount === 1 ? "single" : "installment",
          installmentNumber,
          installmentCount: purchase.installmentCount,
          amountCents: installmentAmount(
            purchase.totalCents,
            purchase.installmentCount,
            installmentNumber,
          ),
          totalCents: purchase.totalCents,
          project: purchase.project,
          tags: tagsFromStorage(purchase.tags),
        };
      })
      .filter((charge): charge is NonNullable<typeof charge> => Boolean(charge))
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
    const totalCents = charges.reduce(
      (total, charge) => total + charge.amountCents,
      0,
    );
    const paidCents = payments
      .filter(
        (payment) =>
          payment.cardId === card.id && payment.invoiceMonth === invoiceMonth,
      )
      .reduce((total, payment) => total + payment.amountCents, 0);
    const remainingCents = Math.max(0, totalCents - paidCents);
    const dueDate = `${invoiceMonth.slice(0, 8)}${String(card.dueDay).padStart(2, "0")}`;
    let status = "Aberta";
    if (!totalCents) status = "Sem lançamentos";
    else if (remainingCents === 0) status = "Paga";
    else if (paidCents > 0) status = "Pago parcialmente";
    else if (invoiceMonth > currentMonth) status = "Prevista";
    else if (dueDate < today) status = "Vencida";
    else if (invoiceMonth < currentMonth || todayDay > card.closingDay)
      status = "Fechada";
    return {
      card,
      invoiceMonth,
      dueDate,
      status,
      totalCents,
      paidCents,
      remainingCents,
      charges,
    };
  });
  const totalCents = invoices.reduce(
    (total, invoice) => total + invoice.totalCents,
    0,
  );
  const paidCents = invoices.reduce(
    (total, invoice) => total + Math.min(invoice.paidCents, invoice.totalCents),
    0,
  );
  const remainingCents = invoices.reduce(
    (total, invoice) => total + invoice.remainingCents,
    0,
  );
  const nextInvoice = [...invoices]
    .filter((invoice) => invoice.remainingCents > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  return {
    month: requestedMonth,
    cards,
    invoices,
    summary: {
      totalCents,
      paidCents,
      remainingCents,
      nextDueDate: nextInvoice?.dueDate ?? null,
      nextDueCard: nextInvoice?.card.name ?? null,
    },
  };
}

export async function registerInvoicePayment(
  db: Database,
  userId: string,
  input: {
    cardId: string;
    invoiceMonth: string;
    amountCents: number;
    paidAt: string;
    idempotencyKey: string;
  },
) {
  const parsed = z
    .object({
      cardId: z.uuid(),
      invoiceMonth: storedMonthSchema,
      amountCents: centsSchema,
      paidAt: dateSchema,
      idempotencyKey: z.uuid(),
    })
    .parse(input);
  const [idempotentPayment] = await db
    .select()
    .from(schema.invoicePayment)
    .where(eq(schema.invoicePayment.idempotencyKey, parsed.idempotencyKey));
  if (idempotentPayment) {
    if (idempotentPayment.userId !== userId)
      throw new AccessError("Não foi possível confirmar o pagamento.");
    return idempotentPayment;
  }
  const summary = await getFinanceMonth(
    db,
    userId,
    parsed.invoiceMonth.slice(0, 7),
    parsed.paidAt,
  );
  const invoice = summary.invoices.find(
    (candidate) => candidate.card.id === parsed.cardId,
  );
  if (!invoice) throw new AccessError("Fatura não encontrada.");
  if (parsed.amountCents > invoice.remainingCents)
    throw new AccessError("O pagamento não pode superar o valor restante.");
  const [created] = await db
    .insert(schema.invoicePayment)
    .values({
      id: randomUUID(),
      userId,
      cardId: parsed.cardId,
      invoiceMonth: parsed.invoiceMonth,
      amountCents: parsed.amountCents,
      paidAt: parsed.paidAt,
      idempotencyKey: parsed.idempotencyKey,
    })
    .onConflictDoNothing({ target: schema.invoicePayment.idempotencyKey })
    .returning();
  if (created) return created;
  const [existing] = await db
    .select()
    .from(schema.invoicePayment)
    .where(eq(schema.invoicePayment.idempotencyKey, parsed.idempotencyKey));
  if (!existing || existing.userId !== userId)
    throw new AccessError("Não foi possível confirmar o pagamento.");
  return existing;
}
