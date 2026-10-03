"use client";

import {
  Archive,
  Check,
  CheckCircle2,
  Folder,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type { getTaskWorkspace } from "@rotina/domain";
import { Button, Notice } from "@rotina/ui";

type TaskData = Awaited<ReturnType<typeof getTaskWorkspace>>;
type TaskItem = TaskData["todayTasks"][number];
type TaskView = "today" | "upcoming" | "undated" | "completed";
type Preview = {
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  project: string | null;
  tags: string[];
};

async function taskRequest(action: string, body: object) {
  const response = await fetch(`/api/tasks/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as {
    error?: string;
    message?: string;
    preview?: Preview;
  };
  if (!response.ok) throw new Error(result.error ?? "Não foi possível concluir.");
  return result;
}

const closeTimers = new WeakMap<HTMLDialogElement, number>();
function openDialog(dialog: HTMLDialogElement | null) {
  if (!dialog) return;
  const timer = closeTimers.get(dialog);
  if (timer) window.clearTimeout(timer);
  dialog.classList.remove("is-closing");
  if (!dialog.open) dialog.showModal();
}
function closeDialog(dialog: HTMLDialogElement | null) {
  if (!dialog?.open || dialog.classList.contains("is-closing")) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  dialog.classList.add("is-closing");
  const timer = window.setTimeout(() => {
    dialog.close();
    dialog.classList.remove("is-closing");
    closeTimers.delete(dialog);
  }, reduced ? 0 : 220);
  closeTimers.set(dialog, timer);
}
function Dialog({
  dialogRef,
  eyebrow,
  title,
  children,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <dialog
      ref={dialogRef}
      className="finance-dialog"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog(dialogRef.current);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeDialog(dialogRef.current);
      }}
    >
      <div className="finance-dialog-content">
        <div className="finance-dialog-heading">
          <div>
            <span className="finance-eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar"
            onClick={() => closeDialog(dialogRef.current)}
          >
            <X aria-hidden size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
    .format(new Date(`${value}T12:00:00`));
}

function longDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${value}T12:00:00`));
}

function TaskRow({
  task,
  completed,
  pending,
  onStatus,
}: {
  task: TaskItem;
  completed?: boolean;
  pending: boolean;
  onStatus: (task: TaskItem, completed: boolean) => void;
}) {
  return (
    <div className={`task-row${completed ? " completed" : ""}`}>
      <button
        type="button"
        className="task-check"
        aria-label={completed ? `Reabrir ${task.title}` : `Concluir ${task.title}`}
        aria-pressed={Boolean(completed)}
        disabled={pending}
        onClick={() => onStatus(task, !completed)}
      >
        {completed && <Check aria-hidden size={16} />}
      </button>
      <div className="task-identity">
        <h3>{task.title}</h3>
        <p>
          {task.dueDate && <span>{shortDate(task.dueDate)}</span>}
          {task.project && <span>@{task.project}</span>}
          {task.tags.map((tag) => <span key={tag}>#{tag}</span>)}
        </p>
      </div>
      <strong>{task.dueTime ?? "—"}</strong>
    </div>
  );
}

export function TasksDashboard({
  data,
  initialSection,
  initialProjectId,
}: {
  data: TaskData;
  initialSection: "tasks" | "projects";
  initialProjectId: string | null;
}) {
  const router = useRouter();
  const taskDialog = useRef<HTMLDialogElement>(null);
  const projectDialog = useRef<HTMLDialogElement>(null);
  const taskKey = useRef(crypto.randomUUID());
  const [section, setSection] = useState(initialSection);
  const [view, setView] = useState<TaskView>("today");
  const [capture, setCapture] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [projectName, setProjectName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [undo, setUndo] = useState<
    | { kind: "task"; id: string; restoreCompleted: boolean }
    | { kind: "project"; id: string }
    | null
  >(null);

  useEffect(() => setSection(initialSection), [initialSection]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => {
      setMessage("");
      setUndo(null);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [message]);

  const selectedProject = data.projects.find((project) => project.id === initialProjectId) ?? null;
  const allPending = [...data.overdue, ...data.todayTasks, ...data.upcoming, ...data.undated];
  const projectTasks = selectedProject
    ? allPending.filter((task) => task.projectId === selectedProject.id)
    : [];
  const groups = useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    for (const task of data.upcoming) {
      const key = task.dueDate!;
      map.set(key, [...(map.get(key) ?? []), task]);
    }
    return map;
  }, [data.upcoming]);
  const completedGroups = useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    for (const task of data.completed) {
      const key = task.completedAt!.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), task]);
    }
    return map;
  }, [data.completed]);

  function startTask(project?: string) {
    setCapture(project ? `@${project.replaceAll(" ", "_")}` : "");
    setPreview(null);
    setError("");
    openDialog(taskDialog.current);
  }

  async function reviewTask() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await taskRequest("preview", { text: capture });
      setPreview(result.preview!);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível interpretar a tarefa.");
    } finally {
      setPending(false);
    }
  }

  async function saveTask() {
    if (!preview || pending) return;
    setPending(true);
    setError("");
    try {
      const result = await taskRequest("create", {
        ...preview,
        idempotencyKey: taskKey.current,
      });
      closeDialog(taskDialog.current);
      taskKey.current = crypto.randomUUID();
      setCapture("");
      setPreview(null);
      setMessage(result.message ?? "Tarefa salva.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível salvar a tarefa.");
    } finally {
      setPending(false);
    }
  }

  async function changeStatus(task: TaskItem, completed: boolean) {
    if (pending) return;
    setPending(true);
    try {
      const result = await taskRequest("status", { taskId: task.id, completed });
      setMessage(result.message ?? (completed ? "Tarefa concluída." : "Tarefa reaberta."));
      setUndo({ kind: "task", id: task.id, restoreCompleted: !completed });
      router.refresh();
    } catch (requestError) {
      setMessage(requestError instanceof Error ? requestError.message : "Não foi possível alterar a tarefa.");
      setUndo(null);
    } finally {
      setPending(false);
    }
  }

  async function saveProject() {
    if (pending || !projectName.trim()) return;
    setPending(true);
    setError("");
    try {
      const result = await taskRequest("project", { name: projectName });
      closeDialog(projectDialog.current);
      setProjectName("");
      setMessage(result.message ?? "Projeto criado.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível criar o projeto.");
    } finally {
      setPending(false);
    }
  }

  async function archive(projectId: string, archived = true) {
    if (pending) return;
    setPending(true);
    try {
      const result = await taskRequest("archive-project", { projectId, archived });
      setMessage(result.message ?? "Projeto arquivado.");
      setUndo(archived ? { kind: "project", id: projectId } : null);
      router.refresh();
    } catch (requestError) {
      setMessage(requestError instanceof Error ? requestError.message : "Não foi possível arquivar o projeto.");
      setUndo(null);
    } finally {
      setPending(false);
    }
  }

  async function undoLast() {
    if (!undo) return;
    if (undo.kind === "task") {
      const task = data.completed.find((item) => item.id === undo.id) ?? allPending.find((item) => item.id === undo.id);
      if (task) await changeStatus(task, undo.restoreCompleted);
    } else await archive(undo.id, false);
    setUndo(null);
  }

  const renderRows = (tasks: TaskItem[], completed = false) =>
    tasks.map((task) => (
      <TaskRow key={task.id} task={task} completed={completed} pending={pending} onStatus={changeStatus} />
    ));

  return (
    <div className="tasks-page">
      <div className="tasks-content">
        <nav className="task-module-nav" aria-label="Tarefas e projetos">
          <Link
            href="/tarefas"
            className={section === "tasks" ? "active" : undefined}
            aria-current={section === "tasks" ? "page" : undefined}
            onClick={() => setSection("tasks")}
          >Tarefas</Link>
          <Link
            href="/tarefas?aba=projetos"
            className={section === "projects" ? "active" : undefined}
            aria-current={section === "projects" ? "page" : undefined}
            onClick={() => setSection("projects")}
          >Projetos</Link>
        </nav>

        {section === "tasks" ? (
          <>
            <header className="tasks-header">
              <div>
                <span className="finance-eyebrow">Organização</span>
                <h1>{selectedProject?.name ?? "Tarefas"}</h1>
                <p className="muted">{selectedProject ? "Tarefas pendentes deste projeto." : "O que precisa da sua atenção."}</p>
              </div>
              <Button type="button" onClick={() => startTask(selectedProject?.name)}><Plus aria-hidden size={18} /> Nova tarefa</Button>
            </header>
            {!selectedProject && (
              <div className="task-filters" aria-label="Filtrar tarefas">
                {([
                  ["today", `Hoje ${data.todayTasks.length}`],
                  ["upcoming", `Próximas ${data.upcoming.length}`],
                  ["undated", `Sem prazo ${data.undated.length}`],
                  ["completed", "Concluídas"],
                ] as Array<[TaskView, string]>).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>
                ))}
              </div>
            )}

            {selectedProject ? (
              projectTasks.length ? <section className="task-list single">{renderRows(projectTasks)}</section> : <section className="task-empty"><Folder aria-hidden size={28} /><h2>Nenhuma tarefa pendente</h2><p>Adicione uma tarefa vinculada a este projeto.</p><Button type="button" onClick={() => startTask(selectedProject.name)}>Adicionar tarefa</Button></section>
            ) : view === "today" ? (
              data.overdue.length || data.todayTasks.length ? <>
                {data.overdue.length > 0 && <section className="task-group danger"><div className="task-group-heading"><h2>Atrasadas</h2><span>{data.overdue.length}</span></div>{renderRows(data.overdue)}</section>}
                {data.todayTasks.length > 0 && <section className="task-group"><div className="task-group-heading"><h2>{longDate(data.today)}</h2><span>{data.todayTasks.length}</span></div>{renderRows(data.todayTasks)}</section>}
              </> : <section className="task-empty"><CheckCircle2 aria-hidden size={28} /><h2>Nada para hoje</h2><p>Você não tem tarefas com vencimento hoje.</p><Button type="button" onClick={() => startTask()}>Adicionar tarefa</Button></section>
            ) : view === "upcoming" ? (
              groups.size ? [...groups.entries()].map(([date, tasks]) => <section className="task-group" key={date}><div className="task-group-heading"><h2>{longDate(date)}</h2><span>{tasks.length}</span></div>{renderRows(tasks)}</section>) : <section className="task-empty"><CheckCircle2 aria-hidden size={28} /><h2>Nenhuma tarefa futura</h2><p>As próximas tarefas aparecerão aqui.</p></section>
            ) : view === "undated" ? (
              data.undated.length ? <section className="task-list single">{renderRows(data.undated)}</section> : <section className="task-empty"><CheckCircle2 aria-hidden size={28} /><h2>Nenhuma tarefa sem prazo</h2><p>Todas as tarefas pendentes têm uma data.</p></section>
            ) : data.completed.length ? [...completedGroups.entries()].map(([date, tasks]) => <section className="task-group" key={date}><div className="task-group-heading"><h2>Concluídas em {shortDate(date)}</h2><span>{tasks.length}</span></div>{renderRows(tasks, true)}</section>) : <section className="task-empty"><CheckCircle2 aria-hidden size={28} /><h2>Nenhuma tarefa concluída</h2><p>As tarefas concluídas aparecerão aqui.</p></section>}
          </>
        ) : (
          <>
            <header className="tasks-header">
              <div><span className="finance-eyebrow">Organização</span><h1>Projetos</h1><p className="muted">Contexto para suas tarefas.</p></div>
              <Button type="button" onClick={() => { setError(""); openDialog(projectDialog.current); }}><Plus aria-hidden size={18} /> Novo projeto</Button>
            </header>
            {data.projects.length ? <section className="project-list">{data.projects.map((project) => <div className="project-row" key={project.id}><Link href={`/tarefas?projeto=${project.id}`}><span className="project-icon"><Folder aria-hidden size={19} /></span><div><h2>{project.name}</h2><p>{project.nextTask ? `Próxima: ${project.nextTask.title}` : "Nenhuma tarefa pendente"}</p></div><span>{project.pendingCount} {project.pendingCount === 1 ? "pendente" : "pendentes"}</span></Link><button type="button" className="icon-button" aria-label={`Arquivar ${project.name}`} title="Arquivar projeto" disabled={pending} onClick={() => void archive(project.id)}><Archive aria-hidden size={18} /></button></div>)}</section> : <section className="task-empty"><Folder aria-hidden size={28} /><h2>Nenhum projeto ativo</h2><p>Crie um projeto ou use @projeto em uma nova tarefa.</p><Button type="button" onClick={() => openDialog(projectDialog.current)}>Criar projeto</Button></section>}
          </>
        )}
      </div>

      {message && <div className="success-toast" role="status" aria-live="polite"><CheckCircle2 aria-hidden size={20} /><span>{message}</span>{undo && <button type="button" className="toast-undo" onClick={() => void undoLast()}>Desfazer</button>}<button type="button" aria-label="Fechar confirmação" onClick={() => { setMessage(""); setUndo(null); }}><X aria-hidden size={18} /></button></div>}

      <Dialog dialogRef={taskDialog} eyebrow={preview ? "Revisar tarefa" : "Nova tarefa"} title={preview ? "Confira antes de salvar" : "Registre do seu jeito"}>
        {preview ? <div className="task-review"><div className="task-recognized"><Sparkles aria-hidden size={18} /> Entendi como <strong>tarefa</strong></div><div className="finance-form-grid"><label>Título<input value={preview.title} maxLength={160} onChange={(event) => setPreview({ ...preview, title: event.target.value })} /></label><div className="task-date-grid"><label>Data<input type="date" value={preview.dueDate ?? ""} onChange={(event) => setPreview({ ...preview, dueDate: event.target.value || null, dueTime: event.target.value ? preview.dueTime : null })} /></label><label>Horário<input type="time" value={preview.dueTime ?? ""} disabled={!preview.dueDate} onChange={(event) => setPreview({ ...preview, dueTime: event.target.value || null })} /></label></div><label>Projeto <span className="muted">(opcional)</span><input value={preview.project ?? ""} placeholder="Nenhum projeto" onChange={(event) => setPreview({ ...preview, project: event.target.value || null })} /></label><label>Tags <span className="muted">(separadas por vírgula)</span><input value={preview.tags.join(", ")} onChange={(event) => setPreview({ ...preview, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} /></label></div>{error && <Notice error>{error}</Notice>}<Button type="button" className="full" disabled={pending || !preview.title.trim()} onClick={saveTask}>{pending ? "Salvando…" : "Salvar tarefa"}</Button><Button type="button" className="secondary full" onClick={() => { setPreview(null); setError(""); }}>Voltar ao texto</Button></div> : <div className="task-capture"><label htmlFor="task-capture">O que você precisa fazer?</label><textarea id="task-capture" rows={4} value={capture} placeholder="Ex.: Enviar proposta amanhã 14h @Trabalho #cliente" onChange={(event) => setCapture(event.target.value)} /><p className="muted capture-help">Use datas, horários, @projeto e #tags. Você poderá revisar tudo.</p>{error && <Notice error>{error}</Notice>}<Button type="button" className="full" disabled={pending || !capture.trim()} onClick={reviewTask}>{pending ? "Interpretando…" : "Revisar tarefa"}</Button></div>}
      </Dialog>

      <Dialog dialogRef={projectDialog} eyebrow="Projetos" title="Criar projeto"><div className="finance-form-grid"><label>Nome do projeto<input value={projectName} maxLength={60} placeholder="Ex.: Casa" onChange={(event) => setProjectName(event.target.value)} /></label></div>{error && <Notice error>{error}</Notice>}<Button type="button" className="full" disabled={pending || !projectName.trim()} onClick={saveProject}>{pending ? "Criando…" : "Criar projeto"}</Button></Dialog>
    </div>
  );
}
