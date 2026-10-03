import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type Database, schema, and, eq } from "@rotina/db";
import { AccessError } from "./errors";
import { parseMoney } from "./finance";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const centsSchema = z.coerce.number().int().positive().max(2_000_000_000);
const recurrenceSchema = z.enum(["once", "monthly"]);
const paymentMethodSchema = z.enum([
  "pix",
  "cash",
  "debit",
  "bank_transfer",
  "automatic_debit",
  "other",
]);

export type BillRecurrence = z.infer<typeof recurrenceSchema>;
export type BillPaymentMethod = z.infer<typeof paymentMethodSchema>;

function isValidDate(value: string) {
  if (!dateSchema.safeParse(value).success) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validateDate(value: string) {
  if (!isValidDate(value)) throw new AccessError("Informe uma data válida.");
  return value;
}

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

function billOccursInMonth(
  bill: typeof schema.bill.$inferSelect,
  month: string,
) {
  const firstMonth = bill.firstDueDate.slice(0, 7);
  if (bill.recurrence === "once") return firstMonth === month;
  return bill.active && month >= firstMonth;
}

function dueDateForMonth(
  bill: typeof schema.bill.$inferSelect,
  month: string,
) {
  return bill.recurrence === "once"
    ? bill.firstDueDate
    : `${month}-${String(bill.dueDay).padStart(2, "0")}`;
}

export function previewBill(text: string, referenceDate: string) {
  text = z.string().trim().min(3).max(500).parse(text);
  validateDate(referenceDate);
  const recurrence: BillRecurrence = /\b(?:todo\s+m[eê]s|mensal)\b/i.test(text)
    ? "monthly"
    : "once";
  const dayMatch = text.match(/\bdia\s+(\d{1,2})\b/i);
  if (!dayMatch)
    throw new AccessError("Informe o dia do vencimento, como dia 19.");
  const dueDay = Number(dayMatch[1]);
  const [year, month] = referenceDate.slice(0, 7).split("-").map(Number);
  const lastDay = recurrence === "monthly"
    ? 28
    : new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  if (dueDay < 1 || dueDay > lastDay)
    throw new AccessError(
      recurrence === "monthly"
        ? "Para recorrências, use um vencimento entre os dias 01 e 28."
        : "Informe um dia válido para o mês do vencimento.",
    );
  const textWithoutDay = text.replace(dayMatch[0], " ");
  const amountMatch = textWithoutDay.match(
    /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)/,
  );
  if (!amountMatch)
    throw new AccessError("Informe o valor estimado da conta no texto.");
  const tags = Array.from(
    text.matchAll(/#([\p{L}\d_-]+)/gu),
    (match) => match[1]!,
  );
  const project = text.match(/@([\p{L}\d_-]+)/u)?.[1] ?? null;
  const title = text
    .replace(amountMatch[0], " ")
    .replace(dayMatch[0], " ")
    .replace(/\b(?:todo\s+m[eê]s|mensal)\b/gi, " ")
    .replace(/#[\p{L}\d_-]+/gu, " ")
    .replace(/@[\p{L}\d_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-–—·,;:]+|[-–—·,;:]+$/g, "")
    .trim();
  if (!title) throw new AccessError("Informe um nome para a conta.");
  return {
    title,
    estimatedAmountCents: parseMoney(amountMatch[1]!),
    firstDueDate: `${referenceDate.slice(0, 7)}-${String(dueDay).padStart(2, "0")}`,
    recurrence,
    project,
    tags,
  };
}

export async function createBill(
  db: Database,
  userId: string,
  input: {
    title: string;
    estimatedAmountCents: number;
    firstDueDate: string;
    recurrence: BillRecurrence;
    project?: string | null;
    tags?: string[];
    idempotencyKey: string;
  },
) {
  const parsed = z
    .object({
      title: z.string().trim().min(1).max(120),
      estimatedAmountCents: centsSchema,
      firstDueDate: dateSchema,
      recurrence: recurrenceSchema,
      project: z.string().trim().max(60).nullable().optional(),
      tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
      idempotencyKey: z.uuid(),
    })
    .parse(input);
  validateDate(parsed.firstDueDate);
  const dueDay = Number(parsed.firstDueDate.slice(8, 10));
  if (parsed.recurrence === "monthly" && dueDay > 28)
    throw new AccessError("Contas mensais devem vencer entre os dias 01 e 28.");
  const [idempotent] = await db
    .select()
    .from(schema.bill)
    .where(eq(schema.bill.idempotencyKey, parsed.idempotencyKey));
  if (idempotent) {
    if (idempotent.userId !== userId)
      throw new AccessError("Não foi possível confirmar a conta.");
    return idempotent;
  }
  const [created] = await db
    .insert(schema.bill)
    .values({
      id: randomUUID(),
      userId,
      title: parsed.title,
      estimatedAmountCents: parsed.estimatedAmountCents,
      firstDueDate: parsed.firstDueDate,
      dueDay,
      recurrence: parsed.recurrence,
      project: parsed.project || null,
      tags: JSON.stringify(parsed.tags),
      idempotencyKey: parsed.idempotencyKey,
    })
    .onConflictDoNothing({ target: schema.bill.idempotencyKey })
    .returning();
  if (created) return created;
  const [existing] = await db
    .select()
    .from(schema.bill)
    .where(eq(schema.bill.idempotencyKey, parsed.idempotencyKey));
  if (!existing || existing.userId !== userId)
    throw new AccessError("Não foi possível confirmar a conta.");
  return existing;
}

export async function getBillsMonth(
  db: Database,
  userId: string,
  requestedMonth: string,
  today: string,
) {
  const month = monthSchema.parse(requestedMonth);
  validateDate(today);
  const [bills, payments] = await Promise.all([
    db.select().from(schema.bill).where(eq(schema.bill.userId, userId)),
    db
      .select()
      .from(schema.billPayment)
      .where(eq(schema.billPayment.userId, userId)),
  ]);
  const occurrences = bills
    .filter((bill) => billOccursInMonth(bill, month))
    .map((bill) => {
      const dueDate = dueDateForMonth(bill, month);
      const payment = payments.find(
        (candidate) =>
          candidate.billId === bill.id && candidate.dueDate === dueDate,
      );
      const status = payment
        ? ("Paga" as const)
        : dueDate < today
          ? ("Vencida" as const)
          : ("A pagar" as const);
      return {
        id: `${bill.id}:${dueDate}`,
        billId: bill.id,
        title: bill.title,
        dueDate,
        estimatedAmountCents: bill.estimatedAmountCents,
        amountCents: payment?.amountCents ?? bill.estimatedAmountCents,
        recurrence: recurrenceSchema.parse(bill.recurrence),
        project: bill.project,
        tags: tagsFromStorage(bill.tags),
        status,
        paidAt: payment?.paidAt ?? null,
        paymentMethod: payment?.paymentMethod
          ? paymentMethodSchema.parse(payment.paymentMethod)
          : null,
      };
    })
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title),
    );
  const totalCents = occurrences.reduce(
    (total, occurrence) => total + occurrence.amountCents,
    0,
  );
  const paidCents = occurrences.reduce(
    (total, occurrence) =>
      total + (occurrence.status === "Paga" ? occurrence.amountCents : 0),
    0,
  );
  return {
    month,
    occurrences,
    summary: {
      totalCents,
      paidCents,
      remainingCents: totalCents - paidCents,
      paidCount: occurrences.filter((item) => item.status === "Paga").length,
      pendingCount: occurrences.filter((item) => item.status !== "Paga").length,
    },
  };
}

export async function registerBillPayment(
  db: Database,
  userId: string,
  input: {
    billId: string;
    dueDate: string;
    amountCents: number;
    paidAt: string;
    today: string;
    paymentMethod?: BillPaymentMethod | null;
    idempotencyKey: string;
  },
) {
  const parsed = z
    .object({
      billId: z.uuid(),
      dueDate: dateSchema,
      amountCents: centsSchema,
      paidAt: dateSchema,
      today: dateSchema,
      paymentMethod: paymentMethodSchema.nullable().optional(),
      idempotencyKey: z.uuid(),
    })
    .parse(input);
  validateDate(parsed.dueDate);
  validateDate(parsed.paidAt);
  validateDate(parsed.today);
  if (parsed.paidAt > parsed.today)
    throw new AccessError("A data do pagamento não pode estar no futuro.");
  const [idempotent] = await db
    .select()
    .from(schema.billPayment)
    .where(eq(schema.billPayment.idempotencyKey, parsed.idempotencyKey));
  if (idempotent) {
    if (idempotent.userId !== userId)
      throw new AccessError("Não foi possível confirmar o pagamento.");
    return idempotent;
  }
  const [bill] = await db
    .select()
    .from(schema.bill)
    .where(and(eq(schema.bill.id, parsed.billId), eq(schema.bill.userId, userId)));
  if (!bill) throw new AccessError("Conta não encontrada.");
  const month = parsed.dueDate.slice(0, 7);
  if (
    !billOccursInMonth(bill, month) ||
    dueDateForMonth(bill, month) !== parsed.dueDate
  )
    throw new AccessError("Esse vencimento não pertence à conta.");
  const [alreadyPaid] = await db
    .select()
    .from(schema.billPayment)
    .where(
      and(
        eq(schema.billPayment.billId, bill.id),
        eq(schema.billPayment.dueDate, parsed.dueDate),
      ),
    );
  if (alreadyPaid) throw new AccessError("Esta conta já foi paga.");
  const [created] = await db
    .insert(schema.billPayment)
    .values({
      id: randomUUID(),
      userId,
      billId: bill.id,
      dueDate: parsed.dueDate,
      amountCents: parsed.amountCents,
      paidAt: parsed.paidAt,
      paymentMethod: parsed.paymentMethod ?? null,
      idempotencyKey: parsed.idempotencyKey,
    })
    .onConflictDoNothing({ target: schema.billPayment.idempotencyKey })
    .returning();
  if (created) return created;
  const [existing] = await db
    .select()
    .from(schema.billPayment)
    .where(eq(schema.billPayment.idempotencyKey, parsed.idempotencyKey));
  if (!existing || existing.userId !== userId)
    throw new AccessError("Não foi possível confirmar o pagamento.");
  return existing;
}
