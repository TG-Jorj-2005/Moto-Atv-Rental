import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { localDateOf } from "@/lib/business-time";
import { bookingDays } from "@/lib/calendar-days";
import { monthBounds, monthParam, parseMonth, shiftMonth } from "@/lib/month-view";
import { MonthCalendar, type DayMarks } from "@/components/month-calendar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

const TONE = { PENDING: "warning", CONFIRMED: "info", ACTIVE: "success", COMPLETED: "neutral", CANCELLED: "neutral" } as const;

export default async function ProviderCalendar({ searchParams }: { searchParams: Promise<{ month?: string; vehicle?: string }> }) {
  const user = await requireRole("OWNER", "RENTAL_COMPANY");
  const sp = await searchParams;
  const ym = parseMonth(sp.month);
  const { first, days, start, end } = monthBounds(ym);
  const vehicles = await prisma.vehicle.findMany({ where: { ownerId: user.id }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const vehicleId = vehicles.find((v) => v.id === sp.vehicle)?.id;
  const bookings = await prisma.booking.findMany({
    where: { vehicle: { ownerId: user.id }, ...(vehicleId ? { vehicleId } : {}), status: { not: "CANCELLED" }, startAt: { lt: end }, endAt: { gt: start } },
    orderBy: { startAt: "asc" },
    select: { id: true, startAt: true, endAt: true, status: true, vehicle: { select: { id: true, name: true } } },
    take: 500,
  });
  const marks: DayMarks = {};
  for (const b of bookings) {
    for (const day of bookingDays(b.startAt, b.endAt, first, days)) {
      (marks[day] ??= []).push({ label: b.vehicle.name, href: `/provider/vehicles/${b.vehicle.id}?tab=bookings`, tone: TONE[b.status] });
    }
  }
  const link = (m: { year: number; month: number }) => `/provider/calendar?month=${monthParam(m)}${vehicleId ? `&vehicle=${vehicleId}` : ""}`;
  const today = localDateOf(new Date());
  const prev = shiftMonth(ym, -1);
  const next = shiftMonth(ym, 1);

  return (
    <>
      <PageHeader title="Calendar" description="Bookings of your vehicles by day (Bucharest time). Cancelled bookings are not shown." />
      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-3 p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="month" value={monthParam(ym)} />
            <label className="flex flex-col gap-1 text-sm font-medium">Vehicle
              <Select name="vehicle" defaultValue={vehicleId ?? ""} className="w-64"><option value="">All vehicles</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
            </label>
            <Button variant="dark">Apply</Button>
          </form>
          <div className="flex items-center gap-2">
            <Link href={link(prev)} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label="Previous month"><ChevronLeft aria-hidden className="size-4" /></Link>
            <Link href={link(parseMonth(undefined))} className={buttonVariants({ variant: "outline", size: "sm" })}>This month</Link>
            <Link href={link(next)} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label="Next month"><ChevronRight aria-hidden className="size-4" /></Link>
          </div>
        </CardContent>
      </Card>
      <MonthCalendar year={ym.year} month={ym.month} marks={marks} today={today} />
      <ul className="flex flex-wrap gap-3 text-xs text-stone-700" aria-label="Legend">
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded bg-amber-200" /> Awaiting confirmation</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded bg-sky-200" /> Confirmed</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded bg-green-200" /> In progress</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded bg-stone-300" /> Completed</li>
      </ul>
    </>
  );
}
