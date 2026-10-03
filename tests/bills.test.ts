import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createDatabase, schema, sql } from "@rotina/db";
import { readConfig } from "@rotina/config";
import {
  createBill,
  getBillsMonth,
  getExpensesMonth,
  previewBill,
  registerBillPayment,
} from "@rotina/domain";

const config = readConfig({
  APP_ENV: "local",
  APP_URL: "http://localhost:3000",
  AUTH_SECRET: "bills-test-secret-not-for-deployment-123",
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
      name: "Bill Owner",
      email: "bills@example.com",
      emailVerified: true,
    },
    {
      id: otherUserId,
      name: "Other Bill User",
      email: "other-bills@example.com",
      emailVerified: true,
    },
  ]);
  await db.insert(schema.profile).values([
    { userId, role: "owner", onboarded: true },
    { userId: otherUserId, role: "member", onboarded: true },
  ]);
});

afterAll(close);

describe("Bills", () => {
  it("interprets estimated recurring bills, projects and tags", () => {
    expect(
      previewBill(
        "Energia 99,90 dia 19 todo mês @Casa #moradia",
        "2026-09-22",
      ),
    ).toEqual({
      title: "Energia",
      estimatedAmountCents: 9990,
      firstDueDate: "2026-09-19",
      recurrence: "monthly",
      project: "Casa",
      tags: ["moradia"],
    });
    expect(() => previewBill("Energia 99,90", "2026-09-22")).toThrow(
      "dia do vencimento",
    );
    expect(
      previewBill("Água dia 20 todo mês 85,00", "2026-09-22"),
    ).toMatchObject({
      title: "Água",
      estimatedAmountCents: 8500,
      firstDueDate: "2026-09-20",
    });
  });

  it("uses the real paid amount for the current month and keeps the future estimate", async () => {
    const bill = await createBill(db, userId, {
      title: "Energia",
      estimatedAmountCents: 9990,
      firstDueDate: "2026-09-19",
      recurrence: "monthly",
      project: "Casa",
      tags: ["moradia"],
      idempotencyKey: randomUUID(),
    });
    const septemberBefore = await getBillsMonth(
      db,
      userId,
      "2026-09",
      "2026-09-22",
    );
    expect(septemberBefore.occurrences[0]).toMatchObject({
      amountCents: 9990,
      estimatedAmountCents: 9990,
      status: "Vencida",
    });

    const paymentKey = randomUUID();
    const payment = {
      billId: bill.id,
      dueDate: "2026-09-19",
      amountCents: 12743,
      paidAt: "2026-09-22",
      today: "2026-09-22",
      paymentMethod: "pix" as const,
      idempotencyKey: paymentKey,
    };
    await registerBillPayment(db, userId, payment);
    await registerBillPayment(db, userId, payment);

    const september = await getBillsMonth(
      db,
      userId,
      "2026-09",
      "2026-09-22",
    );
    expect(september.summary).toMatchObject({
      totalCents: 12743,
      paidCents: 12743,
      remainingCents: 0,
    });
    expect(september.occurrences[0]).toMatchObject({
      amountCents: 12743,
      estimatedAmountCents: 9990,
      status: "Paga",
      paidAt: "2026-09-22",
    });

    const october = await getBillsMonth(
      db,
      userId,
      "2026-10",
      "2026-09-22",
    );
    expect(october.occurrences[0]).toMatchObject({
      amountCents: 9990,
      estimatedAmountCents: 9990,
      status: "A pagar",
    });
  });

  it("adds one bill commitment to expenses without duplicating its payment", async () => {
    const september = await getExpensesMonth(
      db,
      userId,
      "2026-09",
      "2026-09-22",
    );
    const bills = september.entries.filter((entry) => entry.kind === "bill");
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({
      title: "Energia",
      amountCents: 12743,
      status: "Paga",
    });
    expect(september.summary).toMatchObject({
      totalCents: 12743,
      otherCents: 12743,
    });
  });

  it("keeps bills private and rejects cross-user idempotency", async () => {
    const key = randomUUID();
    await createBill(db, userId, {
      title: "Internet",
      estimatedAmountCents: 12000,
      firstDueDate: "2026-11-10",
      recurrence: "once",
      idempotencyKey: key,
    });
    await expect(
      createBill(db, otherUserId, {
        title: "Outra internet",
        estimatedAmountCents: 13000,
        firstDueDate: "2026-11-10",
        recurrence: "once",
        idempotencyKey: key,
      }),
    ).rejects.toThrow("Não foi possível confirmar a conta");
    const otherMonth = await getBillsMonth(
      db,
      otherUserId,
      "2026-11",
      "2026-11-01",
    );
    expect(otherMonth.occurrences).toEqual([]);
  });
});
