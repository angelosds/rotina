import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type Database, schema, and, eq } from "@rotina/db";
import { AccessError } from "./errors";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

function validateDate(value: string) {
  if (!dateSchema.safeParse(value).success)
    throw new AccessError("Informe uma data válida.");
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value)
    throw new AccessError("Informe uma data válida.");
  return value;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateFromDay(referenceDate: string, day: number) {
  const reference = new Date(`${referenceDate}T12:00:00Z`);
  const candidate = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), day, 12),
  );
  if (candidate.getUTCDate() !== day)
    throw new AccessError("Este dia não existe no mês atual.");
  if (candidate.toISOString().slice(0, 10) < referenceDate)
    candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  return candidate.toISOString().slice(0, 10);
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

function folded(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function previewTask(text: string, referenceDate: string) {
  text = z.string().trim().min(2).max(500).parse(text);
  validateDate(referenceDate);
  const tags = Array.from(
    text.matchAll(/#([\p{L}\d_-]+)/gu),
    (match) => match[1]!,
  );
  const project = text.match(/@([\p{L}\d_-]+)/u)?.[1]?.replaceAll("_", " ") ?? null;
  const timeMatch = text.match(/\b([01]?\d|2[0-3])(?:h(?:(\d{2}))?|:(\d{2}))\b/i);
  let dueTime: string | null = null;
  if (timeMatch) {
    const minutes = timeMatch[2] ?? timeMatch[3] ?? "00";
    if (Number(minutes) > 59) throw new AccessError("Informe um horário válido.");
    dueTime = `${timeMatch[1]!.padStart(2, "0")}:${minutes}`;
  }
  let dueDate: string | null = null;
  let dateText = "";
  const explicitDate = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  const dayMatch = text.match(/\bdia\s+(\d{1,2})\b/i);
  if (/\bamanh[aã](?=\s|$)/i.test(text)) {
    dueDate = addDays(referenceDate, 1);
    dateText = text.match(/\bamanh[aã](?=\s|$)/i)![0];
  } else if (/\bhoje\b/i.test(text)) {
    dueDate = referenceDate;
    dateText = text.match(/\bhoje\b/i)![0];
  } else if (explicitDate) {
    let year = Number(explicitDate[3] ?? referenceDate.slice(0, 4));
    dueDate = `${year}-${explicitDate[2]!.padStart(2, "0")}-${explicitDate[1]!.padStart(2, "0")}`;
    validateDate(dueDate);
    if (!explicitDate[3] && dueDate < referenceDate) {
      year += 1;
      dueDate = `${year}-${explicitDate[2]!.padStart(2, "0")}-${explicitDate[1]!.padStart(2, "0")}`;
      validateDate(dueDate);
    }
    dateText = explicitDate[0];
  } else if (dayMatch) {
    const day = Number(dayMatch[1]);
    if (day < 1 || day > 31) throw new AccessError("Informe um dia válido.");
    dueDate = dateFromDay(referenceDate, day);
    dateText = dayMatch[0];
  } else if (dueTime) {
    dueDate = referenceDate;
  }
  const title = text
    .replace(timeMatch?.[0] ?? "", " ")
    .replace(dateText, " ")
    .replace(/#[\p{L}\d_-]+/gu, " ")
    .replace(/@[\p{L}\d_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-–—·,;:]+|[-–—·,;:]+$/g, "")
    .trim();
  if (!title) throw new AccessError("Informe um título para a tarefa.");
  return { title, dueDate, dueTime, project, tags };
}

async function ensureProject(
  db: Database,
  userId: string,
  name: string | null | undefined,
) {
  if (!name?.trim()) return null;
  const cleanName = z.string().trim().min(1).max(60).parse(name);
  const projects = await db
    .select()
    .from(schema.project)
    .where(eq(schema.project.userId, userId));
  const existing = projects.find(
    (project) => folded(project.name) === folded(cleanName),
  );
  if (existing) {
    if (existing.archivedAt)
      await db
        .update(schema.project)
        .set({ archivedAt: null, updatedAt: new Date() })
        .where(eq(schema.project.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(schema.project)
    .values({ id: randomUUID(), userId, name: cleanName })
    .returning();
  return created!.id;
}

export async function createProject(db: Database, userId: string, name: string) {
  const projectId = await ensureProject(db, userId, name);
  const [project] = await db
    .select()
    .from(schema.project)
    .where(and(eq(schema.project.id, projectId!), eq(schema.project.userId, userId)));
  return project!;
}

export async function createTask(
  db: Database,
  userId: string,
  input: {
    title: string;
    dueDate?: string | null;
    dueTime?: string | null;
    project?: string | null;
    tags?: string[];
    idempotencyKey: string;
  },
) {
  const parsed = z.object({
    title: z.string().trim().min(1).max(160),
    dueDate: dateSchema.nullable().optional(),
    dueTime: timeSchema.nullable().optional(),
    project: z.string().trim().max(60).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
    idempotencyKey: z.uuid(),
  }).parse(input);
  if (parsed.dueDate) validateDate(parsed.dueDate);
  if (parsed.dueTime && !parsed.dueDate)
    throw new AccessError("Escolha uma data para usar um horário.");
  const [idempotent] = await db
    .select()
    .from(schema.task)
    .where(eq(schema.task.idempotencyKey, parsed.idempotencyKey));
  if (idempotent) {
    if (idempotent.userId !== userId)
      throw new AccessError("Não foi possível confirmar a tarefa.");
    return idempotent;
  }
  const projectId = await ensureProject(db, userId, parsed.project);
  const [created] = await db
    .insert(schema.task)
    .values({
      id: randomUUID(),
      userId,
      projectId,
      title: parsed.title,
      dueDate: parsed.dueDate ?? null,
      dueTime: parsed.dueTime ?? null,
      tags: JSON.stringify(parsed.tags),
      idempotencyKey: parsed.idempotencyKey,
    })
    .onConflictDoNothing({ target: schema.task.idempotencyKey })
    .returning();
  if (created) return created;
  const [existing] = await db
    .select()
    .from(schema.task)
    .where(eq(schema.task.idempotencyKey, parsed.idempotencyKey));
  if (!existing || existing.userId !== userId)
    throw new AccessError("Não foi possível confirmar a tarefa.");
  return existing;
}

export async function setTaskCompleted(
  db: Database,
  userId: string,
  taskId: string,
  completed: boolean,
) {
  const id = z.uuid().parse(taskId);
  const [updated] = await db
    .update(schema.task)
    .set({ completedAt: completed ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(schema.task.id, id), eq(schema.task.userId, userId)))
    .returning();
  if (!updated) throw new AccessError("Tarefa não encontrada.");
  return updated;
}

export async function setProjectArchived(
  db: Database,
  userId: string,
  projectId: string,
  archived: boolean,
) {
  const id = z.uuid().parse(projectId);
  const [updated] = await db
    .update(schema.project)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(schema.project.id, id), eq(schema.project.userId, userId)))
    .returning();
  if (!updated) throw new AccessError("Projeto não encontrado.");
  return updated;
}

export async function getTaskWorkspace(
  db: Database,
  userId: string,
  today: string,
) {
  validateDate(today);
  const [tasks, projects] = await Promise.all([
    db.select().from(schema.task).where(eq(schema.task.userId, userId)),
    db.select().from(schema.project).where(eq(schema.project.userId, userId)),
  ]);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const items = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    dueDate: task.dueDate,
    dueTime: task.dueTime,
    projectId: task.projectId,
    project: task.projectId ? projectById.get(task.projectId)?.name ?? null : null,
    tags: tagsFromStorage(task.tags),
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
  }));
  const bySchedule = (a: (typeof items)[number], b: (typeof items)[number]) =>
    (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") ||
    (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99") ||
    a.createdAt.localeCompare(b.createdAt);
  const pending = items.filter((task) => !task.completedAt).sort(bySchedule);
  const completed = items
    .filter((task) => task.completedAt)
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!));
  const projectItems = projects
    .filter((project) => !project.archivedAt)
    .map((project) => {
      const projectTasks = pending.filter((task) => task.projectId === project.id);
      return {
        id: project.id,
        name: project.name,
        pendingCount: projectTasks.length,
        nextTask: projectTasks[0] ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return {
    today,
    overdue: pending.filter((task) => task.dueDate && task.dueDate < today),
    todayTasks: pending.filter((task) => task.dueDate === today),
    upcoming: pending.filter((task) => task.dueDate && task.dueDate > today),
    undated: pending.filter((task) => !task.dueDate),
    completed,
    projects: projectItems,
    summary: {
      pendingCount: pending.length,
      todayCount: pending.filter((task) => task.dueDate === today).length,
      overdueCount: pending.filter((task) => task.dueDate && task.dueDate < today).length,
    },
  };
}
