import { getExpensesMonth } from "@rotina/domain";
import { requireUser } from "@/lib/session";
import { runtime } from "@/lib/runtime";
import { dateInTimezone } from "@/lib/date";
import { ExpensesDashboard } from "@/components/expenses-dashboard";

export const metadata = { title: "Gastos" };

export default async function Expenses({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const session = await requireUser();
  const today = dateInTimezone(session.profile.timezone);
  const requestedMonth = (await searchParams).mes;
  const month = /^\d{4}-\d{2}$/.test(requestedMonth ?? "")
    ? requestedMonth!
    : today.slice(0, 7);
  const data = await getExpensesMonth(
    runtime().db,
    session.user.id,
    month,
    today,
  );
  return <ExpensesDashboard data={data} today={today} />;
}
