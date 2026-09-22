import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createDatabase, schema, sql } from "@rotina/db";
import { readConfig } from "@rotina/config";
import {
  createCardPurchase,
  createCreditCard,
  createExpense,
  getExpensesMonth,
  previewExpense,
  refundCardPurchase,
  registerInvoicePayment,
} from "@rotina/domain";

const config = readConfig({
  APP_ENV: "local",
  APP_URL: "http://localhost:3000",
  AUTH_SECRET: "expenses-test-secret-not-for-deployment-123",
  LOCAL_DB_PATH: "memory://",
});
const { db, close } = createDatabase(config);
const userId = randomUUID();
const otherUserId = randomUUID();

beforeAll(async () => {
  for (const migration of readdirSync("packages/db/migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort())
    for (const statement of readFileSync(
      `packages/db/migrations/${migration}`,
      "utf8",
    )
      .split(";")
      .filter((value) => value.trim()))
      await db.execute(sql.raw(statement));
  await db.insert(schema.user).values([
    {
      id: userId,
      name: "Expense Owner",
      email: "expenses@example.com",
      emailVerified: true,
    },
    {
      id: otherUserId,
      name: "Other Expense User",
      email: "other-expenses@example.com",
      emailVerified: true,
    },
  ]);
  await db.insert(schema.profile).values([
    { userId, role: "owner", onboarded: true },
    { userId: otherUserId, role: "member", onboarded: true },
  ]);
});

afterAll(close);

describe("Expenses", () => {
  it("interprets common payment methods, projects and tags", () => {
    expect(
      previewExpense(
        "Almoço 35,90 VR @Trabalho #alimentação",
        "2026-09-21",
      ),
    ).toMatchObject({
      title: "Almoço",
      amountCents: 3590,
      paymentMethod: "meal_voucher",
      paymentLabel: "Vale-refeição",
      project: "Trabalho",
      tags: ["alimentação"],
    });
    expect(() => previewExpense("Almoço 35,90", "2026-09-21")).toThrow(
      "Informe a forma de pagamento",
    );
  });

  it("combines manual expenses with invoice commitments without duplicating purchases or payments", async () => {
    const manualKey = randomUUID();
    const manual = {
      title: "Almoço",
      amountCents: 3590,
      spentAt: "2026-09-21",
      today: "2026-09-21",
      paymentMethod: "meal_voucher" as const,
      project: null,
      tags: ["alimentação"],
      idempotencyKey: manualKey,
    };
    await createExpense(db, userId, manual);
    await createExpense(db, userId, manual);
    const card = await createCreditCard(db, userId, {
      name: "Nubank",
      closingDay: 12,
      dueDay: 22,
    });
    const purchase = await createCardPurchase(db, userId, {
      title: "Mercado",
      totalCents: 1000,
      installmentCount: 1,
      cardId: card.id,
      purchaseDate: "2026-09-08",
      firstInvoiceMonth: "2026-09-01",
      project: "Casa",
      tags: ["casa"],
      idempotencyKey: randomUUID(),
    });
    await registerInvoicePayment(db, userId, {
      cardId: card.id,
      invoiceMonth: "2026-09-01",
      amountCents: 1000,
      paidAt: "2026-09-20",
      idempotencyKey: randomUUID(),
    });
    const september = await getExpensesMonth(
      db,
      userId,
      "2026-09",
      "2026-09-21",
    );
    expect(september.summary).toMatchObject({
      totalCents: 4590,
      invoiceCents: 1000,
      otherCents: 3590,
    });
    expect(september.entries).toHaveLength(2);
    expect(september.entries.map((entry) => entry.kind).sort()).toEqual([
      "invoice",
      "manual",
    ]);
    expect(
      september.entries.find((entry) => entry.kind === "invoice"),
    ).toMatchObject({
      title: "Fatura Nubank",
      amountCents: 1000,
      paidCents: 1000,
      remainingCents: 0,
      status: "Paga",
    });

    await refundCardPurchase(db, userId, {
      purchaseId: purchase.id,
      refundedAt: "2026-10-05",
      today: "2026-10-05",
      idempotencyKey: randomUUID(),
    });
    const october = await getExpensesMonth(
      db,
      userId,
      "2026-10",
      "2026-10-05",
    );
    expect(october.summary).toMatchObject({
      totalCents: 0,
      invoiceCents: 0,
      otherCents: 0,
    });
    expect(october.entries).toEqual([]);
  });

  it("keeps expenses private and rejects cross-user idempotency", async () => {
    const key = randomUUID();
    await createExpense(db, userId, {
      title: "Café",
      amountCents: 700,
      spentAt: "2026-11-01",
      today: "2026-11-01",
      paymentMethod: "pix",
      idempotencyKey: key,
    });
    await expect(
      createExpense(db, otherUserId, {
        title: "Outro café",
        amountCents: 900,
        spentAt: "2026-11-01",
        today: "2026-11-01",
        paymentMethod: "cash",
        idempotencyKey: key,
      }),
    ).rejects.toThrow("Não foi possível confirmar o gasto");
    const otherMonth = await getExpensesMonth(
      db,
      otherUserId,
      "2026-11",
      "2026-11-01",
    );
    expect(otherMonth.entries).toEqual([]);
    expect(otherMonth.summary.totalCents).toBe(0);
  });
});
