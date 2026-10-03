import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type Database, schema, and, eq } from "@rotina/db";
import { AccessError } from "./errors";
import { parseMoney } from "./finance";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const centsSchema = z.coerce.number().int().positive().max(2_000_000_000);
const paymentKindSchema = z.enum(["regular", "extra"]);
const paymentMethodSchema = z.enum([
  "pix",
  "cash",
  "debit",
  "bank_transfer",
  "automatic_debit",
  "other",
]);

export type DebtPaymentKind = z.infer<typeof paymentKindSchema>;
export type DebtPaymentMethod = z.infer<typeof paymentMethodSchema>;

function validateDate(value: string) {
  if (!dateSchema.safeParse(value).success)
    throw new AccessError("Informe uma data válida.");
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value)
    throw new AccessError("Informe uma data válida.");
  return value;
}

function addMonths(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
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

export function debtPaymentMethodLabel(method: DebtPaymentMethod | null) {
  return method
    ? {
        pix: "Pix",
        cash: "Dinheiro",
        debit: "Cartão de débito",
        bank_transfer: "Transferência bancária",
        automatic_debit: "Débito automático",
        other: "Outro",
      }[method]
    : "Não informada";
}

export function previewDebt(text: string, referenceDate: string) {
  text = z.string().trim().min(3).max(500).parse(text);
  validateDate(referenceDate);
  const installmentMatch = text.match(
    /\bem\s+(\d{1,3})x(?:\s+de)?\s+(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)/i,
  );
  if (!installmentMatch)
    throw new AccessError("Informe as parcelas, como em 24x de 650.");
  const installmentCount = Number(installmentMatch[1]);
  if (installmentCount < 1 || installmentCount > 600)
    throw new AccessError("Informe uma quantidade de parcelas entre 1 e 600.");
  const dayMatch = text.match(/\bdia\s+(\d{1,2})\b/i);
  if (!dayMatch)
    throw new AccessError("Informe o dia do vencimento, como dia 10.");
  const dueDay = Number(dayMatch[1]);
  if (dueDay < 1 || dueDay > 28)
    throw new AccessError("Use um vencimento entre os dias 01 e 28.");
  const withoutInstallment = text.replace(installmentMatch[0], " ");
  const balanceMatch = withoutInstallment.match(
    /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)/,
  );
  if (!balanceMatch)
    throw new AccessError("Informe o saldo original da dívida.");
  const tags = Array.from(
    text.matchAll(/#([\p{L}\d_-]+)/gu),
    (match) => match[1]!,
  );
  const project = text.match(/@([\p{L}\d_-]+)/u)?.[1] ?? null;
  const title = text
    .replace(installmentMatch[0], " ")
    .replace(balanceMatch[0], " ")
    .replace(dayMatch[0], " ")
    .replace(/#[\p{L}\d_-]+/gu, " ")
    .replace(/@[\p{L}\d_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-–—·,;:]+|[-–—·,;:]+$/g, "")
    .trim();
  if (!title) throw new AccessError("Informe um nome para a dívida.");
  let firstDueDate = `${referenceDate.slice(0, 7)}-${String(dueDay).padStart(2, "0")}`;
  if (firstDueDate < referenceDate) firstDueDate = addMonths(firstDueDate, 1);
  return {
    title,
    originalBalanceCents: parseMoney(balanceMatch[1]!),
    installmentCount,
    installmentCents: parseMoney(installmentMatch[2]!),
    firstDueDate,
    project,
    tags,
  };
}

export async function createDebt(
  db: Database,
  userId: string,
  input: {
    title: string;
    originalBalanceCents: number;
    installmentCount: number;
    installmentCents: number;
    firstDueDate: string;
    project?: string | null;
    tags?: string[];
    idempotencyKey: string;
  },
) {
  const parsed = z
    .object({
      title: z.string().trim().min(1).max(120),
      originalBalanceCents: centsSchema,
      installmentCount: z.coerce.number().int().min(1).max(600),
      installmentCents: centsSchema,
      firstDueDate: dateSchema,
      project: z.string().trim().max(60).nullable().optional(),
      tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
      idempotencyKey: z.uuid(),
    })
    .parse(input);
  validateDate(parsed.firstDueDate);
  const dueDay = Number(parsed.firstDueDate.slice(8, 10));
  if (dueDay > 28)
    throw new AccessError("Use um vencimento entre os dias 01 e 28.");
  const [idempotent] = await db
    .select()
    .from(schema.debt)
    .where(eq(schema.debt.idempotencyKey, parsed.idempotencyKey));
  if (idempotent) {
    if (idempotent.userId !== userId)
      throw new AccessError("Não foi possível confirmar a dívida.");
    return idempotent;
  }
  const [created] = await db
    .insert(schema.debt)
    .values({
      id: randomUUID(),
      userId,
      title: parsed.title,
      originalBalanceCents: parsed.originalBalanceCents,
      installmentCount: parsed.installmentCount,
      installmentCents: parsed.installmentCents,
      firstDueDate: parsed.firstDueDate,
      dueDay,
      project: parsed.project || null,
      tags: JSON.stringify(parsed.tags),
      idempotencyKey: parsed.idempotencyKey,
    })
    .onConflictDoNothing({ target: schema.debt.idempotencyKey })
    .returning();
  if (created) return created;
  const [existing] = await db
    .select()
    .from(schema.debt)
    .where(eq(schema.debt.idempotencyKey, parsed.idempotencyKey));
  if (!existing || existing.userId !== userId)
    throw new AccessError("Não foi possível confirmar a dívida.");
  return existing;
}

export async function getDebts(db: Database, userId: string, today: string) {
  validateDate(today);
  const [debts, payments] = await Promise.all([
    db.select().from(schema.debt).where(eq(schema.debt.userId, userId)),
    db
      .select()
      .from(schema.debtPayment)
      .where(eq(schema.debtPayment.userId, userId)),
  ]);
  const items = debts.map((debt) => {
    const debtPayments = payments
      .filter((payment) => payment.debtId === debt.id)
      .sort(
        (a, b) =>
          a.paidAt.localeCompare(b.paidAt) ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
    const paidCents = debtPayments.reduce(
      (total, payment) => total + payment.amountCents,
      0,
    );
    const balanceCents = Math.max(0, debt.originalBalanceCents - paidCents);
    const regularCount = debtPayments.filter(
      (payment) => payment.kind === "regular",
    ).length;
    const installmentNumber = Math.min(
      regularCount + 1,
      debt.installmentCount,
    );
    const nextDueDate = balanceCents
      ? addMonths(debt.firstDueDate, Math.min(regularCount, debt.installmentCount - 1))
      : null;
    const daysUntilDue = nextDueDate
      ? Math.round(
          (new Date(`${nextDueDate}T12:00:00Z`).getTime() -
            new Date(`${today}T12:00:00Z`).getTime()) /
            86_400_000,
        )
      : null;
    const status = !balanceCents
      ? ("Quitada" as const)
      : daysUntilDue! < 0
        ? ("Vencida" as const)
        : daysUntilDue! <= 7
          ? ("Vence em breve" as const)
          : ("Em dia" as const);
    let regularNumber = 0;
    const history = debtPayments
      .map((payment) => ({
        id: payment.id,
        kind: paymentKindSchema.parse(payment.kind),
        amountCents: payment.amountCents,
        paidAt: payment.paidAt,
        paymentMethod: payment.paymentMethod
          ? paymentMethodSchema.parse(payment.paymentMethod)
          : null,
        installmentNumber:
          payment.kind === "regular" ? ++regularNumber : null,
      }))
      .reverse();
    return {
      id: debt.id,
      title: debt.title,
      originalBalanceCents: debt.originalBalanceCents,
      balanceCents,
      paidCents,
      installmentCount: debt.installmentCount,
      installmentNumber,
      paidInstallmentCount: regularCount,
      installmentCents: Math.min(debt.installmentCents, balanceCents),
      firstDueDate: debt.firstDueDate,
      nextDueDate,
      project: debt.project,
      tags: tagsFromStorage(debt.tags),
      status,
      history,
    };
  });
  items.sort((a, b) => {
    if (!a.nextDueDate) return 1;
    if (!b.nextDueDate) return -1;
    return a.nextDueDate.localeCompare(b.nextDueDate) || a.title.localeCompare(b.title);
  });
  const balanceCents = items.reduce((total, item) => total + item.balanceCents, 0);
  const originalBalanceCents = items.reduce(
    (total, item) => total + item.originalBalanceCents,
    0,
  );
  return {
    items,
    summary: {
      balanceCents,
      originalBalanceCents,
      paidCents: originalBalanceCents - balanceCents,
      nextDue: items.find((item) => item.nextDueDate) ?? null,
    },
  };
}

export async function registerDebtPayment(
  db: Database,
  userId: string,
  input: {
    debtId: string;
    kind: DebtPaymentKind;
    amountCents: number;
    paidAt: string;
    today: string;
    paymentMethod?: DebtPaymentMethod | null;
    idempotencyKey: string;
  },
) {
  const parsed = z
    .object({
      debtId: z.uuid(),
      kind: paymentKindSchema,
      amountCents: centsSchema,
      paidAt: dateSchema,
      today: dateSchema,
      paymentMethod: paymentMethodSchema.nullable().optional(),
      idempotencyKey: z.uuid(),
    })
    .parse(input);
  validateDate(parsed.paidAt);
  validateDate(parsed.today);
  if (parsed.paidAt > parsed.today)
    throw new AccessError("A data do pagamento não pode estar no futuro.");
  const [idempotent] = await db
    .select()
    .from(schema.debtPayment)
    .where(eq(schema.debtPayment.idempotencyKey, parsed.idempotencyKey));
  if (idempotent) {
    if (idempotent.userId !== userId)
      throw new AccessError("Não foi possível confirmar o pagamento.");
    return idempotent;
  }
  return db.transaction(async (tx) => {
    const [debt] = await tx
      .select()
      .from(schema.debt)
      .where(and(eq(schema.debt.id, parsed.debtId), eq(schema.debt.userId, userId)));
    if (!debt) throw new AccessError("Dívida não encontrada.");
    const payments = await tx
      .select()
      .from(schema.debtPayment)
      .where(and(eq(schema.debtPayment.debtId, debt.id), eq(schema.debtPayment.userId, userId)));
    const paidCents = payments.reduce(
      (total, payment) => total + payment.amountCents,
      0,
    );
    const balanceCents = Math.max(0, debt.originalBalanceCents - paidCents);
    if (!balanceCents) throw new AccessError("Esta dívida já está quitada.");
    if (parsed.amountCents > balanceCents)
      throw new AccessError("O pagamento não pode ser maior que o saldo devedor.");
    if (
      parsed.kind === "regular" &&
      payments.filter((payment) => payment.kind === "regular").length >=
        debt.installmentCount
    )
      throw new AccessError("Todas as parcelas previstas já foram registradas.");
    const [created] = await tx
      .insert(schema.debtPayment)
      .values({
        id: randomUUID(),
        userId,
        debtId: debt.id,
        kind: parsed.kind,
        amountCents: parsed.amountCents,
        paidAt: parsed.paidAt,
        paymentMethod: parsed.paymentMethod ?? null,
        idempotencyKey: parsed.idempotencyKey,
      })
      .onConflictDoNothing({ target: schema.debtPayment.idempotencyKey })
      .returning();
    if (!created) {
      const [existing] = await tx
        .select()
        .from(schema.debtPayment)
        .where(eq(schema.debtPayment.idempotencyKey, parsed.idempotencyKey));
      if (!existing || existing.userId !== userId)
        throw new AccessError("Não foi possível confirmar o pagamento.");
      return existing;
    }
    if (parsed.amountCents === balanceCents)
      await tx
        .update(schema.debt)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(schema.debt.id, debt.id));
    return created;
  });
}
