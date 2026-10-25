import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { getCurrency } from "@/lib/currency-server";
import { formatMoney } from "@/lib/currency";
import { commissionBpsFor } from "@/lib/commission";
import { formatLocalDate, formatLocalDateTime } from "@/lib/business-time";
import { ownerMoney } from "@/lib/provider-data";
import { BookingStatusBadge } from "@/components/status-badges";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Section, Stat } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Earnings" };
export const dynamic = "force-dynamic";

export default async function ProviderFinance() {
  const user = await requireRole("OWNER", "RENTAL_COMPANY");
  const [currency, money, me, bookings, payouts] = await Promise.all([
    getCurrency(),
    ownerMoney(user.id),
    prisma.user.findUnique({ where: { id: user.id }, select: { commissionBps: true } }),
    prisma.booking.findMany({
      where: { vehicle: { ownerId: user.id }, status: { not: "CANCELLED" } },
      orderBy: { startAt: "desc" },
      take: 50,
      select: { id: true, startAt: true, endAt: true, status: true, totalPrice: true, commissionBps: true, commissionAmount: true, ownerAmount: true, vehicle: { select: { name: true } } },
    }),
    prisma.payout.findMany({ where: { ownerId: user.id }, orderBy: { paidAt: "desc" }, take: 50 }),
  ]);
  const rate = commissionBpsFor({ role: user.role, commissionBps: me?.commissionBps ?? null });

  return (
    <>
      <PageHeader title="Earnings" description="What your vehicles earned, what is still to come and what we have paid you." />
      <Alert tone="info" title={`Commission: ${rate / 100}%`}>
        {user.role === "OWNER" ? "Individual owners pay a fixed 15% on the price the customer was charged." : "Your rate is set by an administrator for your company (never below 5%)."} Each booking keeps the rate it had when it was made, so a later change never alters old bookings. Deposits and penalties, if any, carry no commission.
      </Alert>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Earned" value={formatMoney(money.earned, currency)} hint={`From ${money.completedCount} completed bookings`} />
        <Stat label="Expected" value={formatMoney(money.expected, currency)} hint={`${money.openCount} confirmed or active, not due until completed`} />
        <Stat label="Paid out to you" value={formatMoney(money.paid, currency)} />
        <Stat label="Balance we owe you" value={formatMoney(money.balance, currency)} hint="Earned minus paid out" tone={money.balance > 0 ? "warning" : undefined} />
      </div>
      <Section title="Bookings" description="Your share is due once the booking is completed. Pending and cancelled bookings never count.">
        <Card>
          {bookings.length === 0 ? <CardContent className="py-10 text-center text-sm text-stone-600">No bookings yet.</CardContent> : (
            <Table>
              <THead><TR><TH>Vehicle</TH><TH>Period</TH><TH>Status</TH><TH className="text-right">Charged</TH><TH className="text-right">Commission</TH><TH className="text-right">Your share</TH></TR></THead>
              <TBody>
                {bookings.map((b) => (
                  <TR key={b.id}>
                    <TD className="font-medium">{b.vehicle.name}</TD>
                    <TD className="whitespace-nowrap text-stone-600">{formatLocalDateTime(b.startAt)} → {formatLocalDateTime(b.endAt)}</TD>
                    <TD><BookingStatusBadge status={b.status} /></TD>
                    <TD className="text-right">{formatMoney(b.totalPrice, currency)}</TD>
                    <TD className="text-right text-stone-600">{b.commissionAmount != null ? `${formatMoney(b.commissionAmount, currency)} · ${(b.commissionBps ?? 0) / 100}%` : "—"}</TD>
                    <TD className="text-right font-semibold">{b.ownerAmount != null ? formatMoney(b.ownerAmount, currency) : "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </Section>
      <Card>
        <CardHeader><CardTitle>Payments we made to you</CardTitle></CardHeader>
        <CardContent className="p-0">
          {payouts.length === 0 ? <p className="px-5 py-8 text-center text-sm text-stone-600">No payment recorded yet.</p> : (
            <Table>
              <THead><TR><TH>Date</TH><TH>Note</TH><TH className="text-right">Amount</TH></TR></THead>
              <TBody>{payouts.map((p) => <TR key={p.id}><TD>{formatLocalDate(p.paidAt)}</TD><TD className="text-stone-600">{p.note ?? "—"}</TD><TD className="text-right font-semibold">{formatMoney(p.amount, currency)}</TD></TR>)}</TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
