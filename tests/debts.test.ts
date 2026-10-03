import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createDatabase, schema, sql } from "@rotina/db";
import { readConfig } from "@rotina/config";
import {
  createDebt,
  getDebts,
  getExpensesMonth,
  previewDebt,
  registerDebtPayment,
} from "@rotina/domain";

const config = readConfig({
  APP_ENV: "local",
  APP_URL: "http://localhost:3000",
  AUTH_SECRET: "debts-test-secret-not-for-deployment-123",
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
      name: "Debt Owner",
      email: "debts@example.com",
      emailVerified: true,
    },
    {
      id: otherUserId,
      name: "Other Debt User",
      email: "other-debts@example.com",
      emailVerified: true,
    },
  ]);
  await db.insert(schema.profile).values([
    { userId, role: "owner", onboarded: true },
    { userId: otherUserId, role: "member", onboarded: true },
  ]);
});

afterAll(close);

describe("Debts", () => {
  it("interprets balance, installments, due date, project and tags", () => {
    expect(
      previewDebt(
        "Empréstimo Nubank 12000 em 24x de 650 dia 10 @Casa #reforma",
        "2026-10-03",
      ),
    ).toEqual({
      title: "Empréstimo Nubank",
      originalBalanceCents: 1_200_000,
      installmentCount: 24,
      installmentCents: 65_000,
      firstDueDate: "2026-10-10",
      project: "Casa",
      tags: ["reforma"],
    });
    expect(
      previewDebt("Empréstimo 1000 em 5x de 200 dia 10", "2026-10-12"),
    ).toMatchObject({ firstDueDate: "2026-11-10" });
  });

  it("reduces the balance and advances only regular installments", async () => {
    const debt = await createDebt(db, userId, {
      title: "Empréstimo Nubank",
      originalBalanceCents: 1_200_000,
      installmentCount: 24,
      installmentCents: 65_000,
      firstDueDate: "2026-10-10",
      project: "Casa",
      tags: ["reforma"],
      idempotencyKey: randomUUID(),
    });
    const regularKey = randomUUID();
    const regular = {
      debtId: debt.id,
      kind: "regular" as const,
      amountCents: 65_000,
      paidAt: "2026-10-10",
      today: "2026-10-10",
      paymentMethod: "pix" as const,
      idempotencyKey: regularKey,
    };
    await registerDebtPayment(db, userId, regular);
    await registerDebtPayment(db, userId, regular);
    await registerDebtPayment(db, userId, {
      debtId: debt.id,
      kind: "extra",
      amountCents: 100_000,
      paidAt: "2026-10-12",
      today: "2026-10-12",
      paymentMethod: "bank_transfer",
      idempotencyKey: randomUUID(),
    });
    const result = await getDebts(db, userId, "2026-10-12");
    expect(result.summary).toMatchObject({
      originalBalanceCents: 1_200_000,
      paidCents: 165_000,
      balanceCents: 1_035_000,
    });
    expect(result.items[0]).toMatchObject({
      installmentNumber: 2,
      paidInstallmentCount: 1,
      nextDueDate: "2026-11-10",
      balanceCents: 1_035_000,
      status: "Em dia",
    });
    expect(result.items[0]!.history.map((payment) => payment.kind)).toEqual([
      "extra",
      "regular",
    ]);

    const october = await getExpensesMonth(
      db,
      userId,
      "2026-10",
      "2026-10-12",
    );
    const octoberDebtEntries = october.entries.filter(
      (entry) => entry.sourceKind === "debt",
    );
    expect(octoberDebtEntries).toHaveLength(2);
    expect(octoberDebtEntries.map((entry) => entry.amountCents)).toEqual([
      100_000,
      65_000,
    ]);
    expect(octoberDebtEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          debtEntryKind: "installment",
          status: "Paga",
          spentAt: "2026-10-10",
        }),
        expect.objectContaining({
          debtEntryKind: "extra",
          status: "Paga",
          spentAt: "2026-10-12",
        }),
      ]),
    );

    const november = await getExpensesMonth(
      db,
      userId,
      "2026-11",
      "2026-10-12",
    );
    expect(
      november.entries.filter((entry) => entry.sourceKind === "debt"),
    ).toEqual([
      expect.objectContaining({
        debtEntryKind: "installment",
        amountCents: 65_000,
        status: "A pagar",
        spentAt: "2026-11-10",
      }),
    ]);
  });

  it("uses the actual regular payment amount instead of duplicating the estimate", async () => {
    const debt = await createDebt(db, userId, {
      title: "Energia solar",
      originalBalanceCents: 300_000,
      installmentCount: 3,
      installmentCents: 100_000,
      firstDueDate: "2027-01-08",
      idempotencyKey: randomUUID(),
    });
    await registerDebtPayment(db, userId, {
      debtId: debt.id,
      kind: "regular",
      amountCents: 90_000,
      paidAt: "2027-01-05",
      today: "2027-01-05",
      paymentMethod: "pix",
      idempotencyKey: randomUUID(),
    });
    const january = await getExpensesMonth(
      db,
      userId,
      "2027-01",
      "2027-01-10",
    );
    const entries = january.entries.filter(
      (entry) => entry.sourceKind === "debt" && entry.title === "Energia solar",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      amountCents: 90_000,
      spentAt: "2027-01-08",
      status: "Paga",
    });
  });

  it("keeps debts private and rejects cross-user idempotency", async () => {
    const key = randomUUID();
    await createDebt(db, userId, {
      title: "Financiamento",
      originalBalanceCents: 500_000,
      installmentCount: 10,
      installmentCents: 50_000,
      firstDueDate: "2026-11-15",
      idempotencyKey: key,
    });
    await expect(
      createDebt(db, otherUserId, {
        title: "Outra dívida",
        originalBalanceCents: 300_000,
        installmentCount: 6,
        installmentCents: 50_000,
        firstDueDate: "2026-11-15",
        idempotencyKey: key,
      }),
    ).rejects.toThrow("Não foi possível confirmar a dívida");
    expect((await getDebts(db, otherUserId, "2026-10-03")).items).toEqual([]);
  });
});
