import { getDebts } from "@rotina/domain";
import { requireUser } from "@/lib/session";
import { runtime } from "@/lib/runtime";
import { dateInTimezone } from "@/lib/date";
import { DebtsDashboard } from "@/components/debts-dashboard";

export const metadata = { title: "Dívidas" };

export default async function Debts() {
  const session = await requireUser();
  const today = dateInTimezone(session.profile.timezone);
  const data = await getDebts(runtime().db, session.user.id, today);
  return <DebtsDashboard data={data} today={today} />;
}
