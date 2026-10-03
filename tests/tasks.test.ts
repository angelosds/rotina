import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createDatabase, schema, sql } from "@rotina/db";
import { readConfig } from "@rotina/config";
import {
  createProject,
  createTask,
  getTaskWorkspace,
  previewTask,
  setProjectArchived,
  setTaskCompleted,
} from "@rotina/domain";

const config = readConfig({
  APP_ENV: "local",
  APP_URL: "http://localhost:3000",
  AUTH_SECRET: "tasks-test-secret-not-for-deployment-123",
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
    { id: userId, name: "Task Owner", email: "tasks@example.com", emailVerified: true },
    { id: otherUserId, name: "Other", email: "other-tasks@example.com", emailVerified: true },
  ]);
  await db.insert(schema.profile).values([
    { userId, role: "owner", onboarded: true },
    { userId: otherUserId, role: "member", onboarded: true },
  ]);
});

afterAll(close);

describe("Tasks and projects", () => {
  it("interprets dates, time, project and tags", () => {
    expect(
      previewTask(
        "Enviar proposta amanhã 14h @Trabalho #cliente",
        "2026-10-03",
      ),
    ).toEqual({
      title: "Enviar proposta",
      dueDate: "2026-10-04",
      dueTime: "14:00",
      project: "Trabalho",
      tags: ["cliente"],
    });
    expect(previewTask("Comprar remédio #saúde", "2026-10-03")).toMatchObject({
      dueDate: null,
      dueTime: null,
    });
    expect(previewTask("Dentista dia 18 17:30", "2026-10-03")).toMatchObject({
      dueDate: "2026-10-18",
      dueTime: "17:30",
    });
  });

  it("creates projects from natural input and groups task states", async () => {
    const overdue = await createTask(db, userId, {
      title: "Renovar seguro",
      dueDate: "2026-10-02",
      project: "Pessoal",
      tags: ["carro"],
      idempotencyKey: randomUUID(),
    });
    const today = await createTask(db, userId, {
      title: "Enviar proposta",
      dueDate: "2026-10-03",
      dueTime: "14:00",
      project: "Trabalho",
      tags: ["cliente"],
      idempotencyKey: randomUUID(),
    });
    await createTask(db, userId, {
      title: "Comprar remédio",
      tags: ["saúde"],
      idempotencyKey: randomUUID(),
    });
    await createTask(db, userId, {
      title: "Reunião mensal",
      dueDate: "2026-10-10",
      project: "Trabalho",
      idempotencyKey: randomUUID(),
    });
    const workspace = await getTaskWorkspace(db, userId, "2026-10-03");
    expect(workspace.summary).toEqual({ pendingCount: 4, todayCount: 1, overdueCount: 1 });
    expect(workspace.overdue[0]).toMatchObject({ id: overdue.id, project: "Pessoal" });
    expect(workspace.todayTasks[0]).toMatchObject({ id: today.id, dueTime: "14:00" });
    expect(workspace.upcoming).toHaveLength(1);
    expect(workspace.undated).toHaveLength(1);
    expect(workspace.projects.find((project) => project.name === "Trabalho")).toMatchObject({
      pendingCount: 2,
      nextTask: expect.objectContaining({ title: "Enviar proposta" }),
    });
  });

  it("completes, reopens and preserves tasks when archiving projects", async () => {
    const workspace = await getTaskWorkspace(db, userId, "2026-10-03");
    const task = workspace.todayTasks[0]!;
    await setTaskCompleted(db, userId, task.id, true);
    expect((await getTaskWorkspace(db, userId, "2026-10-03")).completed[0]).toMatchObject({ id: task.id });
    await setTaskCompleted(db, userId, task.id, false);
    expect((await getTaskWorkspace(db, userId, "2026-10-03")).todayTasks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: task.id })]),
    );
    const project = await createProject(db, userId, "Casa");
    await createTask(db, userId, {
      title: "Pedir orçamento",
      project: "Casa",
      idempotencyKey: randomUUID(),
    });
    await setProjectArchived(db, userId, project.id, true);
    const archived = await getTaskWorkspace(db, userId, "2026-10-03");
    expect(archived.projects.some((item) => item.id === project.id)).toBe(false);
    expect(archived.undated.some((item) => item.title === "Pedir orçamento")).toBe(true);
  });

  it("keeps tasks private and rejects cross-user changes", async () => {
    const own = await createTask(db, userId, {
      title: "Privada",
      idempotencyKey: randomUUID(),
    });
    await expect(setTaskCompleted(db, otherUserId, own.id, true)).rejects.toThrow(
      "Tarefa não encontrada",
    );
    expect((await getTaskWorkspace(db, otherUserId, "2026-10-03")).undated).toEqual([]);
  });
});
