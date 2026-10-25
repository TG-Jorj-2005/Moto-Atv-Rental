import Link from "next/link";
import { AlertTriangle, Bike, CalendarCheck, Clock, Hourglass, Plus, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { getCurrency } from "@/lib/currency-server";
import { formatMoney } from "@/lib/currency";
import { commissionBpsFor } from "@/lib/commission";
import { formatLocalDate, formatLocalDateTime } from "@/lib/business-time";
import { ownerMoney, ownerVehicleRows } from "@/lib/provider-data";
import { BookingStatusBadge } from "@/components/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Section, Stat } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Provider overview" };
export const dynamic = "force-dynamic";

const DOC = { ITP: "ITP (technical inspection)", RCA: "RCA (insurance)", SERVICE: "Service", OTHER: "Maintenance" } as const;

export default async function ProviderOverview() {
  const user = await requireRole("OWNER", "RENTAL_COMPANY");
  const now = new Date();
  const [currency, vehicles, money, recent, me] = await Promise.all([
    getCurrency(),
    ownerVehicleRows(user.id, now),
    ownerMoney(user.id),
    prisma.booking.findMany({ where: { vehicle: { ownerId: user.id } }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, startAt: true, endAt: true, status: true, totalPrice: true, ownerAmount: true, vehicle: { select: { name: true } }, customer: { select: { fullName: true } } } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { commissionBps: true } }),
  ]);
  const rate = commissionBpsFor({ role: user.role, commissionBps: me?.commissionBps ?? null });
  const live = vehicles.filter((v) => v.listingStatus === "APPROVED" && v.display !== "RETIRED");
  const pending = vehicles.filter((v) => v.listingStatus === "PENDING").length;
  const rejected = vehicles.filter((v) => v.listingStatus === "REJECTED").length;
  const rented = vehicles.filter((v) => v.display === "RENTED").length;
  const upcoming = vehicles.reduce((n, v) => n + v.upcomingBookings, 0);
  const alerts = vehicles.flatMap((v) => v.warnings.map((w) => ({ vehicle: v, warning: w }))).sort((a, b) => (a.warning.state === "OVERDUE" ? -1 : 0) - (b.warning.state === "OVERDUE" ? -1 : 0));

  return (
    <>
      <PageHeader title="Overview" description={`Your commission rate is ${rate / 100}%${user.role === "OWNER" ? " (fixed for individual owners)" : " (set by an administrator for your company)"}.`} actions={<Link href="/provider/vehicles/new" className={buttonVariants()}><Plus aria-hidden className="size-4" /> Add a vehicle</Link>} />

      {rejected > 0 && <Alert tone="error" title={`${rejected} listing${rejected > 1 ? "s were" : " was"} rejected`}>Open the vehicle, fix it and send it for approval again.</Alert>}
      {pending > 0 && <Alert tone="info">{pending} listing{pending > 1 ? "s are" : " is"} waiting for approval and not visible to customers yet.</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Vehicles on the site" value={live.length} hint={`${vehicles.length} in total`} icon={Bike} />
        <Stat label="Rented right now" value={rented} hint="Handed over to a customer" icon={CalendarCheck} />
        <Stat label="Upcoming bookings" value={upcoming} hint="Awaiting or confirmed" icon={Clock} />
        <Stat label="Awaiting approval" value={pending} icon={Hourglass} tone={pending > 0 ? "warning" : undefined} />
      </div>

      <Section title="Earnings" description="Amounts come from the commission recorded on each booking when it was made.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Earned" value={formatMoney(money.earned, currency)} hint={`${money.completedCount} completed bookings`} icon={Wallet} />
          <Stat label="Expected" value={formatMoney(money.expected, currency)} hint={`${money.openCount} confirmed or active bookings, not due yet`} />
          <Stat label="Paid out to you" value={formatMoney(money.paid, currency)} />
          <Stat label="Balance we owe you" value={formatMoney(money.balance, currency)} hint="Earned minus paid out" tone={money.balance > 0 ? "warning" : undefined} />
        </div>
      </Section>

      <Section title="Documents and deadlines" description="ITP, RCA and service deadlines of your vehicles.">
        {alerts.length === 0 ? (
          <Alert tone="success">Nothing needs attention: every vehicle has valid ITP and RCA records.</Alert>
        ) : (
          <Card>
            <ul className="divide-y divide-stone-100">
              {alerts.map(({ vehicle, warning }, i) => (
                <li key={`${vehicle.id}-${warning.type}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="flex items-center gap-2"><AlertTriangle aria-hidden className={warning.state === "OVERDUE" || warning.state === "NO_RECORD" ? "size-4 text-red-700" : "size-4 text-amber-700"} /><span className="font-medium">{vehicle.name}</span><span className="text-stone-600">{DOC[warning.type]}</span></span>
                  <span className="flex items-center gap-3">
                    {warning.state === "OVERDUE" && <Badge tone="danger">Overdue since {formatLocalDate(warning.dueAt!)}</Badge>}
                    {warning.state === "DUE_SOON" && <Badge tone="warning">Due {formatLocalDate(warning.dueAt!)}</Badge>}
                    {warning.state === "NO_RECORD" && <Badge tone="danger">No record</Badge>}
                    <Link href={`/provider/vehicles/${vehicle.id}?tab=maintenance`} className="font-semibold text-brand-700 hover:underline">Update</Link>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>

      <Card>
        <CardHeader className="flex-row items-center justify-between"><CardTitle>Latest bookings</CardTitle><Link href="/provider/bookings" className="text-sm font-semibold text-brand-700 hover:underline">All bookings</Link></CardHeader>
        <CardContent className="p-0">
          {recent.length === 0 ? <p className="px-5 py-8 text-center text-sm text-stone-600">No bookings on your vehicles yet.</p> : (
            <Table>
              <THead><TR><TH>Vehicle</TH><TH>Customer</TH><TH>Period</TH><TH>Status</TH><TH className="text-right">Your share</TH></TR></THead>
              <TBody>
                {recent.map((b) => (
                  <TR key={b.id}>
                    <TD className="font-medium">{b.vehicle.name}</TD>
                    <TD>{b.customer.fullName}</TD>
                    <TD className="whitespace-nowrap text-stone-600">{formatLocalDateTime(b.startAt)} → {formatLocalDateTime(b.endAt)}</TD>
                    <TD><BookingStatusBadge status={b.status} /></TD>
                    <TD className="text-right font-medium">{b.ownerAmount != null ? formatMoney(b.ownerAmount, currency) : "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
