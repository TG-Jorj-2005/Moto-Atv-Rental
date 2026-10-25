import Link from "next/link";
import { Download } from "lucide-react";
import { requireRole } from "@/lib/session";
import { getCurrency } from "@/lib/currency-server";
import { formatMoney } from "@/lib/currency";
import { monthlyFigures } from "@/lib/admin-data";
import { BarChart } from "@/components/bar-chart";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Finance and reports" };
export const dynamic = "force-dynamic";

const LABEL = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

export default async function AdminFinance({ searchParams }: { searchParams: Promise<{ months?: string }> }) {
  await requireRole("ADMIN");
  const { months: m } = await searchParams;
  const count = m === "12" ? 12 : m === "3" ? 3 : 6;
  const [currency, rows] = await Promise.all([getCurrency(), monthlyFigures(count)]);
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + f(r), 0);
  const fmt = (n: number) => formatMoney(Math.round(n), currency);

  return (
    <>
      <PageHeader
        title="Finance and reports"
        description="Figures are computed on completed bookings, by the month in which they were completed (Bucharest time). The commission is the one recorded on each booking when it was made."
        actions={<><Link href="/admin/finance/export" className={buttonVariants({ variant: "outline" })}><Download aria-hidden className="size-4" /> Download completed bookings (CSV)</Link></>}
      />
      <nav aria-label="Period" className="flex gap-2">
        {[3, 6, 12].map((n) => <Link key={n} href={`/admin/finance?months=${n}`} aria-current={count === n ? "page" : undefined} className={buttonVariants({ variant: count === n ? "dark" : "outline", size: "sm" })}>Last {n} months</Link>)}
      </nav>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Charged to customers" value={fmt(sum((r) => r.revenue))} hint={`Completed bookings, last ${count} months`} />
        <Stat label="Commission" value={fmt(sum((r) => r.commission))} hint="On owner and company vehicles" />
        <Stat label="Kept by the platform" value={fmt(sum((r) => r.platformRevenue))} hint="Commission plus own-fleet rentals (0% commission)" />
        <Stat label="Bookings made" value={sum((r) => r.bookings)} hint="Not cancelled" />
      </div>
      <Card>
        <CardHeader><CardTitle>Revenue per month ({currency})</CardTitle></CardHeader>
        <CardContent>
          <BarChart title={`Revenue per month, last ${count} months`} labels={rows.map((r) => LABEL(r.month))} series={[{ name: "Charged to customers", color: "#44403c", values: rows.map((r) => r.revenue) }, { name: "Commission", color: "#ea580c", values: rows.map((r) => r.commission) }, { name: "Kept by the platform", color: "#16a34a", values: rows.map((r) => r.platformRevenue) }]} format={fmt} />
        </CardContent>
      </Card>
      <Card>
        <Table>
          <THead><TR><TH>Month</TH><TH className="text-right">Bookings made</TH><TH className="text-right">Charged</TH><TH className="text-right">Commission</TH><TH className="text-right">Kept by the platform</TH></TR></THead>
          <TBody>{[...rows].reverse().map((r) => <TR key={r.month}><TD className="font-medium">{LABEL(r.month)}</TD><TD className="text-right">{r.bookings}</TD><TD className="text-right">{fmt(r.revenue)}</TD><TD className="text-right">{fmt(r.commission)}</TD><TD className="text-right font-semibold">{fmt(r.platformRevenue)}</TD></TR>)}</TBody>
        </Table>
      </Card>
      <p className="text-sm text-stone-600">Amounts owed to owners and companies, and their payouts, are on the <Link className="font-semibold text-brand-700 hover:underline" href="/admin/payouts">Payouts</Link> page.</p>
    </>
  );
}
