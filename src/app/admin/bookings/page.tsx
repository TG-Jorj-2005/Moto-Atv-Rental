import Link from "next/link";
import { CalendarX2 } from "lucide-react";
import { Prisma, type BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { getCurrency } from "@/lib/currency-server";
import { formatMoney } from "@/lib/currency";
import { formatLocalDateTime } from "@/lib/business-time";
import { bookingFlags, HANDOVER_DELAY_LIMIT_MS } from "@/lib/booking-rules";
import { BookingStatusBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, LinkTabs, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Bookings" };
export const dynamic = "force-dynamic";

const STATUSES: BookingStatus[] = ["PENDING", "CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED"];
const PAGE = 25;

export default async function AdminBookings({ searchParams }: { searchParams: Promise<{ status?: string; flag?: string; unpaid?: string; q?: string; page?: string }> }) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const flag = sp.flag === "delayed" || sp.flag === "overdue" ? sp.flag : undefined;
  const unpaid = sp.unpaid === "1";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(sp.page ?? "1", 10) || 1));
  const now = new Date();
  const q = sp.q?.trim().slice(0, 60);

  const and: Prisma.BookingWhereInput[] = [];
  if (flag === "delayed") and.push({ status: "CONFIRMED", startAt: { lt: new Date(now.getTime() - HANDOVER_DELAY_LIMIT_MS) } });
  if (flag === "overdue") and.push({ status: "ACTIVE", endAt: { lt: now } });
  if (q) and.push({ OR: [{ vehicle: { name: { contains: q, mode: "insensitive" } } }, { customer: { fullName: { contains: q, mode: "insensitive" } } }, { customer: { email: { contains: q, mode: "insensitive" } } }] });
  if (unpaid) {
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      SELECT b.id FROM bookings b CROSS JOIN LATERAL (SELECT coalesce(sum(p.amount), 0) AS sum FROM payments p WHERE p.booking_id = b.id) paid
      WHERE b.status IN ('COMPLETED', 'ACTIVE') AND b.total_price > paid.sum LIMIT 500`;
    and.push({ id: { in: ids.map((r) => r.id) } });
  }
  const where: Prisma.BookingWhereInput = { ...(status && !flag ? { status } : {}), ...(and.length ? { AND: and } : {}) };

  const [currency, counts, total, bookings] = await Promise.all([
    getCurrency(),
    prisma.booking.groupBy({ by: ["status"], _count: true }),
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where, orderBy: [{ startAt: "desc" }, { id: "asc" }], skip: (page - 1) * PAGE, take: PAGE,
      select: { id: true, startAt: true, endAt: true, status: true, totalPrice: true, vehicle: { select: { name: true, owner: { select: { name: true } } } }, customer: { select: { fullName: true } }, payments: { select: { amount: true } } },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const base = (s?: string) => { const p = new URLSearchParams(); if (s) p.set("status", s); if (q) p.set("q", q); const t = p.toString(); return `/admin/bookings${t ? `?${t}` : ""}`; };
  const qs = (p: number) => { const u = new URLSearchParams(); if (status) u.set("status", status); if (flag) u.set("flag", flag); if (unpaid) u.set("unpaid", "1"); if (q) u.set("q", q); if (p > 1) u.set("page", String(p)); const t = u.toString(); return `/admin/bookings${t ? `?${t}` : ""}`; };
  const countOf = (s: BookingStatus) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <>
      <PageHeader title="Bookings" description="Confirm, hand over, complete or cancel. Open a booking to act on it. Times are Bucharest time." />
      <LinkTabs items={[{ href: base(), label: "All", active: !status && !flag && !unpaid }, ...STATUSES.map((s) => ({ href: base(s), label: s.charAt(0) + s.slice(1).toLowerCase(), active: status === s && !flag && !unpaid, count: countOf(s) }))]} />
      <Card>
        <CardContent className="p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            {status && <input type="hidden" name="status" value={status} />}
            <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm font-medium">Search<Input name="q" defaultValue={q ?? ""} placeholder="Vehicle, customer name or email" maxLength={60} /></label>
            <label className="flex flex-col gap-1 text-sm font-medium">Show only<Select name="flag" defaultValue={flag ?? ""} className="w-56"><option value="">Everything</option><option value="delayed">Delayed handovers</option><option value="overdue">Overdue returns</option></Select></label>
            <label className="flex items-center gap-2 pb-2 text-sm font-medium"><input type="checkbox" name="unpaid" value="1" defaultChecked={unpaid} className="size-4" /> Unpaid balance</label>
            <Button variant="dark">Filter</Button>
            <Link href="/admin/bookings" className={buttonVariants({ variant: "ghost" })}>Reset</Link>
          </form>
        </CardContent>
      </Card>
      {bookings.length === 0 ? <EmptyState icon={CalendarX2} title="No bookings match" /> : (
        <Card>
          <Table>
            <THead><TR><TH>Vehicle</TH><TH>Customer</TH><TH>Period</TH><TH>Status</TH><TH className="text-right">Total</TH><TH className="text-right">Paid</TH><TH><span className="sr-only">Open</span></TH></TR></THead>
            <TBody>
              {bookings.map((b) => {
                const flags = bookingFlags(b, now);
                const paid = b.payments.reduce((n, p) => n + p.amount, 0);
                return (
                  <TR key={b.id}>
                    <TD>
                      <Link href={`/admin/bookings/${b.id}`} className="font-medium hover:underline">{b.vehicle.name}</Link>
                      <span className="block text-xs text-muted">{b.vehicle.owner?.name ?? "Platform fleet"}</span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5 md:hidden"><BookingStatusBadge status={b.status} />{flags.handoverDelayed && <Badge tone="danger">HANDOVER_DELAYED</Badge>}</span>
                    </TD>
                    <TD>{b.customer.fullName}</TD>
                    <TD className="whitespace-nowrap text-muted">{formatLocalDateTime(b.startAt)} → {formatLocalDateTime(b.endAt)}</TD>
                    <TD><div className="flex flex-wrap items-center gap-1.5"><BookingStatusBadge status={b.status} />{flags.handoverDelayed && <Badge tone="danger">HANDOVER_DELAYED</Badge>}{flags.returnOverdue && <Badge tone="danger">Return overdue</Badge>}</div></TD>
                    <TD className="text-right">{formatMoney(b.totalPrice, currency)}</TD>
                    <TD className={paid < b.totalPrice && b.status !== "CANCELLED" && b.status !== "PENDING" ? "text-right font-medium text-warning" : "text-right"}>{formatMoney(paid, currency)}</TD>
                    <TD><Link href={`/admin/bookings/${b.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Open</Link></TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          <Link aria-disabled={page <= 1} href={qs(page - 1)} className={buttonVariants({ variant: "outline", size: "sm", className: page <= 1 ? "pointer-events-none opacity-50" : "" })}>Previous</Link>
          <span className="text-sm text-muted">Page {page} of {pages} · {total} bookings</span>
          <Link aria-disabled={page >= pages} href={qs(page + 1)} className={buttonVariants({ variant: "outline", size: "sm", className: page >= pages ? "pointer-events-none opacity-50" : "" })}>Next</Link>
        </nav>
      )}
    </>
  );
}
