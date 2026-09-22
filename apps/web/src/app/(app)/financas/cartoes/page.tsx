import { getFinanceMonth } from "@rotina/domain";
import { requireUser } from "@/lib/session";
import { runtime } from "@/lib/runtime";
import { dateInTimezone } from "@/lib/date";
import { FinanceDashboard } from "@/components/finance-dashboard";

export const metadata = { title: "Cartões e faturas" };

export default async function CardsAndInvoices({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; cartao?: string }>;
}) {
  const session = await requireUser();
  const today = dateInTimezone(session.profile.timezone);
  const parameters = await searchParams;
  const requestedMonth = parameters.mes;
  const month = /^\d{4}-\d{2}$/.test(requestedMonth ?? "")
    ? requestedMonth!
    : today.slice(0, 7);
  const data = await getFinanceMonth(
    runtime().db,
    session.user.id,
    month,
    today,
  );
  const initialCardId = data.invoices.some(
    (invoice) => invoice.card.id === parameters.cartao,
  )
    ? parameters.cartao
    : null;
  return (
    <FinanceDashboard
      data={data}
      today={today}
      initialCardId={initialCardId}
    />
  );
}
