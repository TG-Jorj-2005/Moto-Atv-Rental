import Link from "next/link";
import { ListChecks } from "lucide-react";
import type { BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { getCurrency } from "@/lib/currency-server";
import { formatMoney } from "@/lib/currency";
import { formatLocalDateTime } from "@/lib/business-time";
import { BookingStatusBadge } from "@/components/status-badges";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Bookings" };
export const dynamic = "force-dynamic";

const STATUSES: BookingStatus[] = ["PENDING", "CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED"];
const PAGE = 25;

export default async function ProviderBookings({ searchParams }: { searchParams: Promise<{ status?: string; vehicle?: string; page?: string }> }) {
  const user = await requireRole("OWNER", "RENTAL_COMPANY");
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const page = Math.max(1, Math.min(10_000, Number.parseInt(sp.page ?? "1", 10) || 1));
  const vehicles = await prisma.vehicle.findMany({ where: { ownerId: user.id }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const vehicleId = vehicles.find((v) => v.id === sp.vehicle)?.id;
  // Always scoped to the vehicles of this account, whatever the query string says.
  const where = { vehicle: { ownerId: user.id }, ...(status ? { status } : {}), ...(vehicleId ? { vehicleId } : {}) };
  const [currency, total, bookings] = await Promise.all([
    getCurrency(),
    prisma.booking.count({ where }),
    prisma.booking.findMany({ where, orderBy: [{ startAt: "desc" }, { id: "asc" }], skip: (page - 1) * PAGE, take: PAGE, select: { id: true, startAt: true, endAt: true, status: true, totalPrice: true, commissionBps: true, commissionAmount: true, ownerAmount: true, vehicle: { select: { id: true, name: true } }, customer: { select: { fullName: true } } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => { const q = new URLSearchParams(); if (status) q.set("status", status); if (vehicleId) q.set("vehicle", vehicleId); if (p > 1) q.set("page", String(p)); const s = q.toString(); return `/provider/bookings${s ? `?${s}` : ""}`; };

  return (
    <>
      <PageHeader title="Bookings on your vehicles" description="Handovers and cancellations are handled by our team. You see the customer's name only." />
      <Card>
        <CardContent className="p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">Status
              <Select name="status" defaultValue={status ?? ""} className="w-48"><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}</Select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Vehicle
              <Select name="vehicle" defaultValue={vehicleId ?? ""} className="w-64"><option value="">All vehicles</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
            </label>
            <Button variant="dark">Filter</Button>
            <Link href="/provider/bookings" className={buttonVariants({ variant: "ghost" })}>Reset</Link>
          </form>
        </CardContent>
      </Card>
      {bookings.length === 0 ? <EmptyState icon={ListChecks} title="No bookings found" description="Bookings of your vehicles will appear here." /> : (
        <Card>
          <Table>
            <THead><TR><TH>Vehicle</TH><TH>Customer</TH><TH>Period (Bucharest time)</TH><TH>Status</TH><TH className="text-right">Total</TH><TH className="text-right">Commission</TH><TH className="text-right">Your share</TH></TR></THead>
            <TBody>
              {bookings.map((b) => (
                <TR key={b.id}>
                  <TD className="font-medium"><Link className="hover:underline" href={`/provider/vehicles/${b.vehicle.id}?tab=bookings`}>{b.vehicle.name}</Link></TD>
                  <TD>{b.customer.fullName}</TD>
                  <TD className="whitespace-nowrap text-stone-600">{formatLocalDateTime(b.startAt)} → {formatLocalDateTime(b.endAt)}</TD>
                  <TD><BookingStatusBadge status={b.status} /></TD>
                  <TD className="text-right">{formatMoney(b.totalPrice, currency)}</TD>
                  <TD className="text-right text-stone-600">{b.commissionAmount != null ? `${formatMoney(b.commissionAmount, currency)} (${(b.commissionBps ?? 0) / 100}%)` : "—"}</TD>
                  <TD className="text-right font-medium">{b.ownerAmount != null ? formatMoney(b.ownerAmount, currency) : "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          <Link aria-disabled={page <= 1} href={qs(page - 1)} className={buttonVariants({ variant: "outline", size: "sm", className: page <= 1 ? "pointer-events-none opacity-50" : "" })}>Previous</Link>
          <span className="text-sm text-stone-600">Page {page} of {pages} · {total} bookings</span>
          <Link aria-disabled={page >= pages} href={qs(page + 1)} className={buttonVariants({ variant: "outline", size: "sm", className: page >= pages ? "pointer-events-none opacity-50" : "" })}>Next</Link>
        </nav>
      )}
    </>
  );
}
