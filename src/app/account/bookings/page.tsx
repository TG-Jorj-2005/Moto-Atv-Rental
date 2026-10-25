import Link from "next/link";
import { CalendarX2 } from "lucide-react";
import type { BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { getCurrency } from "@/lib/currency-server";
import { formatMoney } from "@/lib/currency";
import { formatLocalDateTime } from "@/lib/business-time";
import { coverOf } from "@/lib/photos";
import { remainingBani } from "@/lib/payments";
import { BookingStatusBadge } from "@/components/status-badges";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, LinkTabs, PageHeader } from "@/components/ui/misc";

export const metadata = { title: "My bookings" };
export const dynamic = "force-dynamic";

const TABS: { key: "upcoming" | "past" | "cancelled"; label: string; statuses: BookingStatus[] }[] = [
  { key: "upcoming", label: "Upcoming", statuses: ["PENDING", "CONFIRMED", "ACTIVE"] },
  { key: "past", label: "Completed", statuses: ["COMPLETED"] },
  { key: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] },
];

export default async function MyBookingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireRole("CUSTOMER", "OWNER", "RENTAL_COMPANY");
  const { tab } = await searchParams;
  const current = TABS.find((t) => t.key === tab) ?? TABS[0]!;
  const [currency, counts, bookings] = await Promise.all([
    getCurrency(),
    prisma.booking.groupBy({ by: ["status"], where: { userId: user.id }, _count: true }),
    prisma.booking.findMany({
      where: { userId: user.id, status: { in: current.statuses } },
      orderBy: { startAt: current.key === "upcoming" ? "asc" : "desc" },
      take: 100,
      include: {
        vehicle: { select: { name: true, location: { select: { name: true, city: true } }, photos: { orderBy: { position: "asc" }, take: 1, select: { path: true } } } },
        payments: { select: { amount: true } },
      },
    }),
  ]);
  const countOf = (statuses: BookingStatus[]) => counts.filter((c) => statuses.includes(c.status)).reduce((n, c) => n + c._count, 0);

  return (
    <>
      <PageHeader title="My bookings" description="Times are shown in Bucharest time." />
      <LinkTabs items={TABS.map((t) => ({ href: `/account/bookings?tab=${t.key}`, label: t.label, active: t.key === current.key, count: countOf(t.statuses) }))} />
      {bookings.length === 0 ? (
        <EmptyState icon={CalendarX2} title={`No ${current.label.toLowerCase()} bookings`} description={current.key === "upcoming" ? "Find a vehicle and make a booking." : undefined} action={current.key === "upcoming" ? <Link href="/vehicles" className={buttonVariants()}>Browse vehicles</Link> : undefined} />
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => {
            const cover = coverOf(b.vehicle.photos);
            const owing = b.status === "CANCELLED" ? 0 : remainingBani(b.totalPrice, b.payments.map((p) => p.amount));
            return (
              <li key={b.id}>
                <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  <div className="aspect-[4/3] w-full shrink-0 overflow-hidden rounded-lg bg-stone-200 sm:w-40">{cover && <img src={cover} alt="" loading="lazy" className="size-full object-cover" />}</div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{b.vehicle.name}</h2><BookingStatusBadge status={b.status} /></div>
                    <p className="text-sm text-stone-600">{formatLocalDateTime(b.startAt)} → {formatLocalDateTime(b.endAt)}</p>
                    {b.vehicle.location && <p className="text-sm text-stone-600">Pick-up: {b.vehicle.location.name}, {b.vehicle.location.city}</p>}
                  </div>
                  <div className="space-y-1 text-left sm:text-right">
                    <p className="text-lg font-bold">{formatMoney(b.totalPrice, currency)}</p>
                    {owing > 0 && <p className="text-xs text-amber-800">{formatMoney(owing, currency)} still to pay</p>}
                    <Link href={`/account/bookings/${b.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Details</Link>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
