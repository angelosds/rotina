import { NextRequest, NextResponse } from "next/server";
import { eq, schema } from "@rotina/db";
import {
  AccessError,
  consumeLimit,
  createProject,
  createTask,
  previewTask,
  setTaskCompleted,
  setProjectArchived,
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
      return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return NextResponse.json({ error: "Formato inválido." }, { status: 415 });
    const raw = await request.text();
    if (raw.length > 8192)
      return NextResponse.json({ error: "Solicitação muito grande." }, { status: 413 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session)
      return NextResponse.json({ error: "Entre para continuar." }, { status: 401 });
    const [profile] = await db
      .select()
      .from(schema.profile)
      .where(eq(schema.profile.userId, session.user.id));
    if (!profile || profile.suspendedAt)
      return NextResponse.json({ error: "Seu acesso está suspenso." }, { status: 403 });
    const limiter = await consumeLimit(db, `tasks:${session.user.id}`, 40, 60);
    if (!limiter.allowed)
      return NextResponse.json(
        { error: "Muitas operações. Aguarde um minuto e tente novamente." },
        { status: 429 },
      );
    const { action } = await params;
    const today = dateInTimezone(profile.timezone);
    if (action === "preview")
      return NextResponse.json({ preview: previewTask(String(body.text ?? ""), today) });
    if (action === "create") {
      await createTask(db, session.user.id, {
        title: String(body.title ?? ""),
        dueDate: typeof body.dueDate === "string" && body.dueDate ? body.dueDate : null,
        dueTime: typeof body.dueTime === "string" && body.dueTime ? body.dueTime : null,
        project: typeof body.project === "string" && body.project ? body.project : null,
        tags: Array.isArray(body.tags)
          ? body.tags.filter((tag): tag is string => typeof tag === "string")
          : [],
        idempotencyKey: String(body.idempotencyKey ?? ""),
      });
      return NextResponse.json({ message: "Tarefa salva.", refresh: true });
    }
    if (action === "status") {
      const completed = body.completed === true;
      await setTaskCompleted(db, session.user.id, String(body.taskId ?? ""), completed);
      return NextResponse.json({
        message: completed ? "Tarefa concluída." : "Tarefa reaberta.",
        refresh: true,
      });
    }
    if (action === "project") {
      await createProject(db, session.user.id, String(body.name ?? ""));
      return NextResponse.json({ message: "Projeto criado.", refresh: true });
    }
    if (action === "archive-project") {
      const archived = body.archived !== false;
      await setProjectArchived(
        db,
        session.user.id,
        String(body.projectId ?? ""),
        archived,
      );
      return NextResponse.json({
        message: archived ? "Projeto arquivado." : "Projeto restaurado.",
        refresh: true,
      });
    }
    return NextResponse.json({ error: "Ação não encontrada." }, { status: 404 });
  } catch (error) {
    if (error instanceof AccessError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.name === "ZodError")
      return NextResponse.json(
        { error: "Confira os campos e tente novamente." },
        { status: 400 },
      );
    console.error("Task operation failed");
    return NextResponse.json(
      { error: "Não foi possível concluir. Tente novamente." },
      { status: 503 },
    );
  }
}
