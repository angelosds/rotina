import { getBillsMonth } from "@rotina/domain";
import { requireUser } from "@/lib/session";
import { runtime } from "@/lib/runtime";
import { dateInTimezone } from "@/lib/date";
import { BillsDashboard } from "@/components/bills-dashboard";

export const metadata = { title: "Despesas fixas" };

export default async function Bills({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; conta?: string }>;
}) {
  const session = await requireUser();
  const today = dateInTimezone(session.profile.timezone);
  const parameters = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(parameters.mes ?? "")
    ? parameters.mes!
    : today.slice(0, 7);
  const data = await getBillsMonth(
    runtime().db,
    session.user.id,
    month,
    today,
  );
  const initialBillId = data.occurrences.some(
    (occurrence) => occurrence.billId === parameters.conta,
  )
    ? parameters.conta!
    : null;
  return (
    <BillsDashboard data={data} today={today} initialBillId={initialBillId} />
  );
}
