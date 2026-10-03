import { NextRequest, NextResponse } from "next/server";
import { eq, schema } from "@rotina/db";
import {
  AccessError,
  consumeLimit,
  createBill,
  createDebt,
  createCardPurchase,
  createCreditCard,
  createExpense,
  parseMoney,
  previewCardPurchase,
  previewBill,
  previewDebt,
  previewExpense,
  refundCardPurchase,
  registerInvoicePayment,
  registerBillPayment,
  registerDebtPayment,
} from "@rotina/domain";
import { runtime as getRuntime } from "@/lib/runtime";
import { dateInTimezone } from "@/lib/date";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { config, db, auth } = getRuntime();
    if (request.headers.get("origin") !== new URL(config.APP_URL).origin)
      return NextResponse.json(
        { error: "Origem não autorizada." },
        { status: 403 },
      );
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return NextResponse.json({ error: "Formato inválido." }, { status: 415 });
    const raw = await request.text();
    if (raw.length > 8192)
      return NextResponse.json(
        { error: "Solicitação muito grande." },
        { status: 413 },
      );
    const body = JSON.parse(raw) as Record<string, unknown>;
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session)
      return NextResponse.json(
        { error: "Entre para continuar." },
        { status: 401 },
      );
    const [profile] = await db
      .select()
      .from(schema.profile)
      .where(eq(schema.profile.userId, session.user.id));
    if (!profile || profile.suspendedAt) {
      await db
        .delete(schema.session)
        .where(eq(schema.session.userId, session.user.id));
      return NextResponse.json(
        { error: "Seu acesso está suspenso." },
        { status: 403 },
      );
    }
    const limiter = await consumeLimit(
      db,
      `finance:${session.user.id}`,
      40,
      60,
    );
    if (!limiter.allowed)
      return NextResponse.json(
        { error: "Muitas operações. Aguarde um minuto e tente novamente." },
        { status: 429 },
      );
    const { action } = await params;
    if (action === "card") {
      await createCreditCard(db, session.user.id, {
        name: String(body.name ?? ""),
        closingDay: String(body.closingDay ?? ""),
        dueDay: String(body.dueDay ?? ""),
        creditLimit:
          typeof body.creditLimit === "string" ? body.creditLimit : null,
      });
      return NextResponse.json({
        message: "Cartão adicionado.",
        refresh: true,
      });
    }
    if (action === "preview-purchase") {
      const purchaseDate =
        typeof body.purchaseDate === "string"
          ? body.purchaseDate
          : dateInTimezone(profile.timezone);
      const preview = await previewCardPurchase(
        db,
        session.user.id,
        String(body.text ?? ""),
        purchaseDate,
      );
      return NextResponse.json({ preview });
    }
    if (action === "purchase") {
      await createCardPurchase(db, session.user.id, {
        title: String(body.title ?? ""),
        totalCents: Number(body.totalCents),
        installmentCount: Number(body.installmentCount),
        cardId: String(body.cardId ?? ""),
        purchaseDate: String(body.purchaseDate ?? ""),
        firstInvoiceMonth: String(body.firstInvoiceMonth ?? ""),
        project:
          typeof body.project === "string" && body.project
            ? body.project
            : null,
        tags: Array.isArray(body.tags)
          ? body.tags.filter((tag): tag is string => typeof tag === "string")
          : [],
        idempotencyKey: String(body.idempotencyKey ?? ""),
      });
      return NextResponse.json({
        message:
          Number(body.installmentCount) > 1
            ? "Compra parcelada salva."
            : "Compra pontual salva.",
        refresh: true,
      });
    }
    if (action === "payment") {
      await registerInvoicePayment(db, session.user.id, {
        cardId: String(body.cardId ?? ""),
        invoiceMonth: String(body.invoiceMonth ?? ""),
        amountCents: parseMoney(String(body.amount ?? "")),
        paidAt: String(body.paidAt ?? ""),
        idempotencyKey: String(body.idempotencyKey ?? ""),
      });
      return NextResponse.json({
        message: "Pagamento registrado sem duplicar o gasto.",
        refresh: true,
      });
    }
    if (action === "refund-purchase") {
      const today = dateInTimezone(profile.timezone);
      await refundCardPurchase(db, session.user.id, {
        purchaseId: String(body.purchaseId ?? ""),
        refundedAt: String(body.refundedAt ?? ""),
        today,
        idempotencyKey: String(body.idempotencyKey ?? ""),
      });
      return NextResponse.json({
        message: "Compra estornada. Faturas atualizadas.",
        refresh: true,
      });
    }
    if (action === "preview-expense") {
      const spentAt =
        typeof body.spentAt === "string"
          ? body.spentAt
          : dateInTimezone(profile.timezone);
      return NextResponse.json({
        preview: previewExpense(String(body.text ?? ""), spentAt),
      });
    }
    if (action === "expense") {
      const today = dateInTimezone(profile.timezone);
      await createExpense(db, session.user.id, {
        title: String(body.title ?? ""),
        amountCents: Number(body.amountCents),
        spentAt: String(body.spentAt ?? ""),
        today,
        paymentMethod: String(body.paymentMethod ?? "") as
          | "pix"
          | "cash"
          | "debit"
          | "meal_voucher"
          | "food_voucher",
        project:
          typeof body.project === "string" && body.project
            ? body.project
            : null,
        tags: Array.isArray(body.tags)
          ? body.tags.filter((tag): tag is string => typeof tag === "string")
          : [],
        idempotencyKey: String(body.idempotencyKey ?? ""),
      });
      return NextResponse.json({
        message: "Gasto salvo.",
        refresh: true,
      });
    }
    if (action === "preview-bill") {
      const referenceDate =
        typeof body.referenceDate === "string"
          ? body.referenceDate
          : dateInTimezone(profile.timezone);
      return NextResponse.json({
        preview: previewBill(String(body.text ?? ""), referenceDate),
      });
    }
    if (action === "bill") {
      await createBill(db, session.user.id, {
        title: String(body.title ?? ""),
        estimatedAmountCents: Number(body.estimatedAmountCents),
        firstDueDate: String(body.firstDueDate ?? ""),
        recurrence: String(body.recurrence ?? "") as "once" | "monthly",
        project:
          typeof body.project === "string" && body.project
            ? body.project
            : null,
        tags: Array.isArray(body.tags)
          ? body.tags.filter((tag): tag is string => typeof tag === "string")
          : [],
        idempotencyKey: String(body.idempotencyKey ?? ""),
      });
      return NextResponse.json({
        message: "Despesa fixa salva.",
        refresh: true,
      });
    }
    if (action === "bill-payment") {
      const today = dateInTimezone(profile.timezone);
      await registerBillPayment(db, session.user.id, {
        billId: String(body.billId ?? ""),
        dueDate: String(body.dueDate ?? ""),
        amountCents: parseMoney(String(body.amount ?? "")),
        paidAt: String(body.paidAt ?? ""),
        today,
        paymentMethod:
          typeof body.paymentMethod === "string" && body.paymentMethod
            ? (body.paymentMethod as
                | "pix"
                | "cash"
                | "debit"
                | "bank_transfer"
                | "automatic_debit"
                | "other")
            : null,
        idempotencyKey: String(body.idempotencyKey ?? ""),
      });
      return NextResponse.json({
        message: "Pagamento registrado sem duplicar o gasto.",
        refresh: true,
      });
    }
    if (action === "preview-debt") {
      const referenceDate =
        typeof body.referenceDate === "string"
          ? body.referenceDate
          : dateInTimezone(profile.timezone);
      return NextResponse.json({
        preview: previewDebt(String(body.text ?? ""), referenceDate),
      });
    }
    if (action === "debt") {
      await createDebt(db, session.user.id, {
        title: String(body.title ?? ""),
        originalBalanceCents: Number(body.originalBalanceCents),
        installmentCount: Number(body.installmentCount),
        installmentCents: Number(body.installmentCents),
        firstDueDate: String(body.firstDueDate ?? ""),
        project:
          typeof body.project === "string" && body.project
            ? body.project
            : null,
        tags: Array.isArray(body.tags)
          ? body.tags.filter((tag): tag is string => typeof tag === "string")
          : [],
        idempotencyKey: String(body.idempotencyKey ?? ""),
      });
      return NextResponse.json({
        message: "Dívida salva.",
        refresh: true,
      });
    }
    if (action === "debt-payment") {
      const today = dateInTimezone(profile.timezone);
      await registerDebtPayment(db, session.user.id, {
        debtId: String(body.debtId ?? ""),
        kind: String(body.kind ?? "") as "regular" | "extra",
        amountCents: parseMoney(String(body.amount ?? "")),
        paidAt: String(body.paidAt ?? ""),
        today,
        paymentMethod:
          typeof body.paymentMethod === "string" && body.paymentMethod
            ? (body.paymentMethod as
                | "pix"
                | "cash"
                | "debit"
                | "bank_transfer"
                | "automatic_debit"
                | "other")
            : null,
        idempotencyKey: String(body.idempotencyKey ?? ""),
      });
      return NextResponse.json({
        message:
          body.kind === "extra"
            ? "Pagamento extra registrado."
            : "Pagamento da parcela registrado.",
        refresh: true,
      });
    }
    return NextResponse.json(
      { error: "Ação não encontrada." },
      { status: 404 },
    );
  } catch (error) {
    if (error instanceof AccessError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.name === "ZodError")
      return NextResponse.json(
        { error: "Confira os campos e tente novamente." },
        { status: 400 },
      );
    console.error("Finance operation failed");
    return NextResponse.json(
      { error: "Não foi possível concluir. Tente novamente." },
      { status: 503 },
    );
  }
}
