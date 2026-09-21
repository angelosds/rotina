import { NextRequest, NextResponse } from "next/server";
import { eq, schema } from "@rotina/db";
import {
  AccessError,
  consumeLimit,
  createCardPurchase,
  createCreditCard,
  parseMoney,
  previewCardPurchase,
  registerInvoicePayment,
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
