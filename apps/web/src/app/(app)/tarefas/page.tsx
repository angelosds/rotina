import { getTaskWorkspace } from "@rotina/domain";
import { requireUser } from "@/lib/session";
import { runtime } from "@/lib/runtime";
import { dateInTimezone } from "@/lib/date";
import { TasksDashboard } from "@/components/tasks-dashboard";

export const metadata = { title: "Tarefas" };

export default async function Tasks({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; projeto?: string }>;
}) {
  const session = await requireUser();
  const today = dateInTimezone(session.profile.timezone);
  const data = await getTaskWorkspace(runtime().db, session.user.id, today);
  const query = await searchParams;
  return (
    <TasksDashboard
      data={data}
      initialSection={query.aba === "projetos" ? "projects" : "tasks"}
      initialProjectId={query.projeto ?? null}
    />
  );
}
