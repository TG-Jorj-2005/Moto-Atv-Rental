import Link from "next/link";
import { AlertTriangle, CalendarClock, ClipboardList, FileText, Hourglass, Timer, Wallet, Wrench } from "lucide-react";
import { requireRole } from "@/lib/session";
import { getCurrency } from "@/lib/currency-server";
import { formatMoney } from "@/lib/currency";
import { formatLocalDateTime } from "@/lib/business-time";
import { adminOverview, monthlyFigures } from "@/lib/admin-data";
import { BarChart } from "@/components/bar-chart";
import { BookingStatusBadge } from "@/components/status-badges";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Section, Stat } from "@/components/ui/misc";

export const metadata = { title: "Administration" };
export const dynamic = "force-dynamic";

const MONTH = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });

export default async function AdminOverview() {
  await requireRole("ADMIN");
  const now = new Date();
  const [currency, o, months] = await Promise.all([getCurrency(), adminOverview(now), monthlyFigures(6, now)]);
  const count = <T extends { _count: number }>(rows: T[], match: (r: T) => boolean) => rows.find(match)?._count ?? 0;
  const pendingListings = count(o.vehiclesByListing, (r) => r.listingStatus === "PENDING");
  const live = count(o.vehiclesByListing, (r) => r.listingStatus === "APPROVED");
  const users = o.users.reduce((s, r) => s + r._count, 0);
  const thisMonth = months.at(-1)!;
  const attention = o.delayedHandovers.length + o.overdueReturns.length + pendingListings + o.docProblems.length + (o.unpaid.count > 0 ? 1 : 0) > 0;

  return (
    <>
      <PageHeader title="Overview" description="What needs your attention, and how the marketplace is doing." actions={<Link href="/admin/bookings" className={buttonVariants({ variant: "outline" })}>All bookings</Link>} />

      <Section title="Needs attention">
        {!attention ? <Alert tone="success">Nothing is waiting: no delayed handovers, overdue returns, listings to review, unpaid balances or document problems.</Alert> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Link href="/admin/bookings?status=CONFIRMED&flag=delayed" className="block"><Stat label="Delayed handovers" value={o.delayedHandovers.length} hint="Confirmed, more than 1 hour after the start" icon={Timer} tone={o.delayedHandovers.length ? "danger" : undefined} /></Link>
            <Link href="/admin/bookings?status=ACTIVE&flag=overdue" className="block"><Stat label="Overdue returns" value={o.overdueReturns.length} hint="Still out after the end time" icon={CalendarClock} tone={o.overdueReturns.length ? "danger" : undefined} /></Link>
            <Link href="/admin/vehicles?listing=PENDING" className="block"><Stat label="Listings to review" value={pendingListings} hint="Not visible until approved" icon={Hourglass} tone={pendingListings ? "warning" : undefined} /></Link>
            <Link href="/admin/bookings?unpaid=1" className="block"><Stat label="Unpaid balances" value={formatMoney(o.unpaid.total, currency)} hint={`${o.unpaid.count} active or completed booking${o.unpaid.count === 1 ? "" : "s"}`} icon={Wallet} tone={o.unpaid.count ? "warning" : undefined} /></Link>
            <Link href="/admin/maintenance" className="block"><Stat label="Vehicles with document problems" value={o.docProblems.length} hint="ITP / RCA / service overdue, due soon or missing" icon={Wrench} tone={o.docProblems.length ? "warning" : undefined} /></Link>
            <Link href="/admin/quotes" className="block"><Stat label="Open bulk offers" value={o.openQuotes} hint="Waiting for the company to answer" icon={FileText} /></Link>
          </div>
        )}
      </Section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Users" value={users} hint={`${count(o.users, (r) => r.role === "CUSTOMER")} customer(s) · ${count(o.users, (r) => r.role === "OWNER")} owner(s) · ${count(o.users, (r) => r.role === "RENTAL_COMPANY")} compan${count(o.users, (r) => r.role === "RENTAL_COMPANY") === 1 ? "y" : "ies"}`} />
        <Stat label="Vehicles on the site" value={live} hint={`${count(o.vehiclesByStatus, (r) => r.status === "IN_SERVICE")} in service · ${count(o.vehiclesByStatus, (r) => r.status === "RETIRED")} retired`} icon={ClipboardList} />
        <Stat label="Platform revenue this month" value={formatMoney(thisMonth.platformRevenue, currency)} hint="Commission plus own-fleet rentals, on completed bookings" />
        <Stat label="Owed to owners and companies" value={formatMoney(o.owedToProviders, currency)} hint="Earned and not paid out yet" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Bookings made per month</CardTitle></CardHeader>
          <CardContent><BarChart title="Bookings made per month, last 6 months" labels={months.map((m) => MONTH(m.month))} series={[{ name: "Bookings", color: "#c2410c", values: months.map((m) => m.bookings) }]} format={(v) => String(Math.round(v))} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Revenue on completed bookings ({currency})</CardTitle></CardHeader>
          <CardContent>
            <BarChart
              title="Revenue and platform revenue per month, last 6 months"
              labels={months.map((m) => MONTH(m.month))}
              series={[{ name: "Charged to customers", color: "#9aa4b2", values: months.map((m) => m.revenue) }, { name: "Kept by the platform", color: "#c2410c", values: months.map((m) => m.platformRevenue) }]}
              format={(v) => formatMoney(Math.round(v), currency)}
            />
          </CardContent>
        </Card>
      </div>

      {(o.delayedHandovers.length > 0 || o.overdueReturns.length > 0) && (
        <Card>
          <CardHeader><CardTitle>Time-sensitive bookings</CardTitle></CardHeader>
          <ul className="divide-y divide-line text-sm">
            {[...o.delayedHandovers.map((b) => ({ b, label: "Handover delayed" })), ...o.overdueReturns.map((b) => ({ b, label: "Return overdue" }))].slice(0, 10).map(({ b, label }) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <span className="flex items-center gap-2"><AlertTriangle aria-hidden className="size-4 text-danger" /><span className="font-medium">{b.vehicle.name}</span><span className="text-muted">{b.customer.fullName}</span></span>
                <span className="flex items-center gap-3"><span className="text-muted">{formatLocalDateTime(b.startAt)} → {formatLocalDateTime(b.endAt)}</span><BookingStatusBadge status={b.status} /><span className="font-semibold text-danger">{label}</span><Link href={`/admin/bookings/${b.id}`} className="font-semibold text-accent-fg hover:underline">Open</Link></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
