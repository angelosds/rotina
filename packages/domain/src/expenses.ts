import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type Database, schema, eq } from "@rotina/db";
import { AccessError } from "./errors";
import { parseMoney } from "./finance";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const paymentMethodSchema = z.enum([
  "pix",
  "cash",
  "debit",
  "meal_voucher",
  "food_voucher",
]);

export type ExpensePaymentMethod = z.infer<typeof paymentMethodSchema>;

const paymentLabels: Record<ExpensePaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  debit: "Cartão de débito",
  meal_voucher: "Vale-refeição",
  food_voucher: "Vale-alimentação",
};

function tagsFromStorage(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

function identifyPaymentMethod(text: string) {
  const folded = fold(text);
  const candidates: Array<{
    method: ExpensePaymentMethod;
    pattern: RegExp;
    originalPattern: RegExp;
  }> = [
    {
      method: "meal_voucher",
      pattern: /\b(?:vr|vale refeicao)\b/,
      originalPattern: /\b(?:VR|vale[- ]?refei[cç][aã]o)\b/i,
    },
    {
      method: "food_voucher",
      pattern: /\b(?:va|vale alimentacao)\b/,
      originalPattern: /\b(?:VA|vale[- ]?alimenta[cç][aã]o)\b/i,
    },
    {
      method: "debit",
      pattern: /\b(?:debito|cartao de debito)\b/,
      originalPattern: /\b(?:d[eé]bito|cart[aã]o de d[eé]bito)\b/i,
    },
    {
      method: "cash",
      pattern: /\bdinheiro\b/,
      originalPattern: /\bdinheiro\b/i,
    },
    {
      method: "pix",
      pattern: /\bpix\b/,
      originalPattern: /\bpix\b/i,
    },
  ];
  return candidates.find((candidate) => candidate.pattern.test(folded)) ?? null;
}

export function expensePaymentLabel(method: ExpensePaymentMethod) {
  return paymentLabels[method];
}

export function previewExpense(text: string, spentAt: string) {
  text = z.string().trim().min(3).max(500).parse(text);
  dateSchema.parse(spentAt);
  const amountMatch = text.match(
    /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)/,
  );
  if (!amountMatch)
    throw new AccessError("Informe o valor do gasto no texto.");
  const payment = identifyPaymentMethod(text);
  if (!payment)
    throw new AccessError(
      "Informe a forma de pagamento: Pix, dinheiro, débito, VR ou VA.",
    );
  const tags = Array.from(
    text.matchAll(/#([\p{L}\d_-]+)/gu),
    (match) => match[1]!,
  );
  const project = text.match(/@([\p{L}\d_-]+)/u)?.[1] ?? null;
  const title = text
    .replace(amountMatch[0], " ")
    .replace(payment.originalPattern, " ")
    .replace(/#[\p{L}\d_-]+/gu, " ")
    .replace(/@[\p{L}\d_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-–—·,;:]+|[-–—·,;:]+$/g, "")
    .trim();
  if (!title) throw new AccessError("Informe uma descrição para o gasto.");
  return {
    title,
    amountCents: parseMoney(amountMatch[1]!),
    spentAt,
    paymentMethod: payment.method,
    paymentLabel: paymentLabels[payment.method],
    project,
    tags,
  };
}

export async function createExpense(
  db: Database,
  userId: string,
  input: {
    title: string;
    amountCents: number;
    spentAt: string;
    today: string;
    paymentMethod: ExpensePaymentMethod;
    project?: string | null;
    tags?: string[];
    idempotencyKey: string;
  },
) {
  const parsed = z
    .object({
      title: z.string().trim().min(1).max(120),
      amountCents: z.coerce.number().int().positive().max(2_000_000_000),
      spentAt: dateSchema,
      today: dateSchema,
      paymentMethod: paymentMethodSchema,
      project: z.string().trim().max(60).nullable().optional(),
      tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
      idempotencyKey: z.uuid(),
    })
    .parse(input);
  if (parsed.spentAt > parsed.today)
    throw new AccessError("A data do gasto não pode estar no futuro.");
  const [idempotent] = await db
    .select()
    .from(schema.expense)
    .where(eq(schema.expense.idempotencyKey, parsed.idempotencyKey));
  if (idempotent) {
    if (idempotent.userId !== userId)
      throw new AccessError("Não foi possível confirmar o gasto.");
    return idempotent;
  }
  const [created] = await db
    .insert(schema.expense)
    .values({
      id: randomUUID(),
      userId,
      title: parsed.title,
      amountCents: parsed.amountCents,
      spentAt: parsed.spentAt,
      paymentMethod: parsed.paymentMethod,
      project: parsed.project || null,
      tags: JSON.stringify(parsed.tags),
      idempotencyKey: parsed.idempotencyKey,
    })
    .onConflictDoNothing({ target: schema.expense.idempotencyKey })
    .returning();
  if (created) return created;
  const [existing] = await db
    .select()
    .from(schema.expense)
    .where(eq(schema.expense.idempotencyKey, parsed.idempotencyKey));
  if (!existing || existing.userId !== userId)
    throw new AccessError("Não foi possível confirmar o gasto.");
  return existing;
}

export async function getExpensesMonth(
  db: Database,
  userId: string,
  requestedMonth: string,
) {
  const month = monthSchema.parse(requestedMonth);
  const [manualExpenses, purchases, cards, refunds] = await Promise.all([
    db
      .select()
      .from(schema.expense)
      .where(eq(schema.expense.userId, userId)),
    db
      .select()
      .from(schema.cardPurchase)
      .where(eq(schema.cardPurchase.userId, userId)),
    db
      .select()
      .from(schema.creditCard)
      .where(eq(schema.creditCard.userId, userId)),
    db
      .select()
      .from(schema.cardPurchaseRefund)
      .where(eq(schema.cardPurchaseRefund.userId, userId)),
  ]);
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const purchasesById = new Map(
    purchases.map((purchase) => [purchase.id, purchase]),
  );
  const refundsByPurchase = new Map(
    refunds.map((refund) => [refund.purchaseId, refund]),
  );
  const manualEntries = manualExpenses
    .filter((expense) => expense.spentAt.startsWith(month))
    .map((expense) => {
      const method = paymentMethodSchema.parse(expense.paymentMethod);
      return {
        id: expense.id,
        title: expense.title,
        amountCents: expense.amountCents,
        spentAt: expense.spentAt,
        kind: "manual" as const,
        sourceKind:
          method === "meal_voucher" || method === "food_voucher"
            ? ("benefit" as const)
            : ("account" as const),
        sourceLabel: paymentLabels[method],
        project: expense.project,
        tags: tagsFromStorage(expense.tags),
        refunded: false,
      };
    });
  const cardEntries = purchases
    .filter((purchase) => purchase.purchaseDate.startsWith(month))
    .map((purchase) => ({
      id: `card:${purchase.id}`,
      title: purchase.title,
      amountCents: purchase.totalCents,
      spentAt: purchase.purchaseDate,
      kind: "card" as const,
      sourceKind: "card" as const,
      sourceLabel: cardsById.get(purchase.cardId)?.name ?? "Cartão",
      project: purchase.project,
      tags: tagsFromStorage(purchase.tags),
      refunded: refundsByPurchase.has(purchase.id),
    }));
  const refundEntries = refunds
    .filter((refund) => refund.refundedAt.startsWith(month))
    .flatMap((refund) => {
      const purchase = purchasesById.get(refund.purchaseId);
      if (!purchase) return [];
      return [
        {
          id: `refund:${refund.id}`,
          title: `Estorno · ${purchase.title}`,
          amountCents: -purchase.totalCents,
          spentAt: refund.refundedAt,
          kind: "refund" as const,
          sourceKind: "card" as const,
          sourceLabel: cardsById.get(purchase.cardId)?.name ?? "Cartão",
          project: purchase.project,
          tags: tagsFromStorage(purchase.tags),
          refunded: true,
        },
      ];
    });
  const entries = [...manualEntries, ...cardEntries, ...refundEntries].sort(
    (a, b) =>
      b.spentAt.localeCompare(a.spentAt) || a.title.localeCompare(b.title),
  );
  const categories = new Map<string, number>();
  for (const entry of entries) {
    const category = entry.tags[0] ? capitalize(entry.tags[0]) : "Sem categoria";
    categories.set(category, (categories.get(category) ?? 0) + entry.amountCents);
  }
  const largestCategory = [...categories.entries()]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])[0];
  return {
    month,
    entries,
    summary: {
      totalCents: entries.reduce((total, entry) => total + entry.amountCents, 0),
      largestCategory: largestCategory?.[0] ?? null,
      largestCategoryCents: largestCategory?.[1] ?? 0,
    },
  };
}
