import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createDatabase, schema, sql } from "@rotina/db";
import { readConfig } from "@rotina/config";
import {
  createCardPurchase,
  createCreditCard,
  getFinanceMonth,
  installmentAmount,
  previewCardPurchase,
  registerInvoicePayment,
} from "@rotina/domain";

const config = readConfig({
  APP_ENV: "local",
  APP_URL: "http://localhost:3000",
  AUTH_SECRET: "finance-test-secret-not-for-deployment-123",
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
      name: "Finance Owner",
      email: "finance@example.com",
      emailVerified: true,
    },
    {
      id: otherUserId,
      name: "Other User",
      email: "other-finance@example.com",
      emailVerified: true,
    },
  ]);
  await db.insert(schema.profile).values([
    { userId, role: "owner", onboarded: true },
    { userId: otherUserId, role: "member", onboarded: true },
  ]);
});

afterAll(close);

describe("Card purchases and invoices", () => {
  it("interprets single and installment purchases around the closing day", async () => {
    const card = await createCreditCard(db, userId, {
      name: "Nubank",
      closingDay: 12,
      dueDay: 22,
      creditLimit: "5.000,00",
    });
    const single = await previewCardPurchase(
      db,
      userId,
      "Mercado 486,90 Nubank #casa",
      "2026-09-08",
    );
    expect(single).toMatchObject({
      title: "Mercado",
      totalCents: 48690,
      installmentCount: 1,
      firstInvoiceMonth: "2026-09-01",
      tags: ["casa"],
      cardId: card.id,
    });
    const installment = await previewCardPurchase(
      db,
      userId,
      "Notebook 3600 em 10x Nubank @Escritório #equipamentos",
      "2026-09-20",
    );
    expect(installment).toMatchObject({
      title: "Notebook",
      totalCents: 360000,
      installmentCount: 10,
      installmentCents: 36000,
      firstInvoiceMonth: "2026-10-01",
      project: "Escritório",
      tags: ["equipamentos"],
    });
    expect(installmentAmount(1000, 3, 1)).toBe(333);
    expect(installmentAmount(1000, 3, 3)).toBe(334);
  });

  it("changes charges with the selected invoice month and preserves idempotency", async () => {
    const cards = await db.select().from(schema.creditCard);
    const card = cards.find((candidate) => candidate.userId === userId)!;
    const singleKey = randomUUID();
    const singleInput = {
      title: "Mercado",
      totalCents: 48690,
      installmentCount: 1,
      cardId: card.id,
      purchaseDate: "2026-09-08",
      firstInvoiceMonth: "2026-09-01",
      project: null,
      tags: ["casa"],
      idempotencyKey: singleKey,
    };
    await createCardPurchase(db, userId, singleInput);
    await createCardPurchase(db, userId, singleInput);
    await createCardPurchase(db, userId, {
      title: "Notebook",
      totalCents: 360000,
      installmentCount: 10,
      cardId: card.id,
      purchaseDate: "2026-09-20",
      firstInvoiceMonth: "2026-10-01",
      project: "Escritório",
      tags: ["equipamentos"],
      idempotencyKey: randomUUID(),
    });

    const september = await getFinanceMonth(
      db,
      userId,
      "2026-09",
      "2026-09-20",
    );
    expect(september.summary.totalCents).toBe(48690);
    expect(september.invoices[0]!.charges).toHaveLength(1);
    expect(september.invoices[0]!.charges[0]!.kind).toBe("single");

    const october = await getFinanceMonth(
      db,
      userId,
      "2026-10",
      "2026-09-20",
    );
    expect(october.summary.totalCents).toBe(36000);
    expect(october.invoices[0]!.charges[0]).toMatchObject({
      title: "Notebook",
      installmentNumber: 1,
      installmentCount: 10,
      amountCents: 36000,
    });
  });

  it("records partial payments once without creating another charge", async () => {
    const [card] = await db.select().from(schema.creditCard);
    const key = randomUUID();
    const payment = {
      cardId: card!.id,
      invoiceMonth: "2026-09-01",
      amountCents: 10000,
      paidAt: "2026-09-20",
      idempotencyKey: key,
    };
    await registerInvoicePayment(db, userId, payment);
    await registerInvoicePayment(db, userId, payment);
    const september = await getFinanceMonth(
      db,
      userId,
      "2026-09",
      "2026-09-20",
    );
    expect(september.invoices[0]).toMatchObject({
      totalCents: 48690,
      paidCents: 10000,
      remainingCents: 38690,
      status: "Pago parcialmente",
    });
    expect(september.invoices[0]!.charges).toHaveLength(1);
    await expect(
      registerInvoicePayment(db, userId, {
        ...payment,
        amountCents: 999999,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow("superar");
    const finalPayment = {
      ...payment,
      amountCents: 38690,
      idempotencyKey: randomUUID(),
    };
    await registerInvoicePayment(db, userId, finalPayment);
    await registerInvoicePayment(db, userId, finalPayment);
    const paid = await getFinanceMonth(
      db,
      userId,
      "2026-09",
      "2026-09-20",
    );
    expect(paid.invoices[0]).toMatchObject({
      totalCents: 48690,
      paidCents: 48690,
      remainingCents: 0,
      status: "Paga",
    });
  });

  it("keeps cards, purchases and invoices private per user", async () => {
    const [card] = await db.select().from(schema.creditCard);
    await expect(
      createCardPurchase(db, otherUserId, {
        title: "Tentativa",
        totalCents: 1000,
        installmentCount: 1,
        cardId: card!.id,
        purchaseDate: "2026-09-10",
        firstInvoiceMonth: "2026-09-01",
        tags: [],
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow("Cartão não encontrado");
    const other = await getFinanceMonth(
      db,
      otherUserId,
      "2026-09",
      "2026-09-20",
    );
    expect(other.cards).toHaveLength(0);
    expect(other.summary.totalCents).toBe(0);
  });
});
