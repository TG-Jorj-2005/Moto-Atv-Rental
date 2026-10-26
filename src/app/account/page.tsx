import Link from "next/link";
import { CalendarCheck, CalendarX2, CheckCircle2, Hourglass, Search, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { getCurrency } from "@/lib/currency-server";
import { formatMoney } from "@/lib/currency";
import { formatLocalDateTime } from "@/lib/business-time";
import { coverOf } from "@/lib/photos";
import { remainingBani } from "@/lib/payments";
import { BookingStatusBadge } from "@/components/status-badges";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader, Section, Stat } from "@/components/ui/misc";

export const metadata = { title: "My account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireRole("CUSTOMER", "OWNER", "RENTAL_COMPANY");
  const currency = await getCurrency();
  const bookings = await prisma.booking.findMany({
    where: { userId: user.id },
    orderBy: { startAt: "asc" },
    include: { vehicle: { select: { id: true, name: true, photos: { orderBy: { position: "asc" }, take: 1, select: { path: true } } } }, payments: { select: { amount: true } } },
  });
  const open = bookings.filter((b) => b.status === "PENDING" || b.status === "CONFIRMED");
  const active = bookings.filter((b) => b.status === "ACTIVE");
  const completed = bookings.filter((b) => b.status === "COMPLETED");
  const owing = bookings.filter((b) => b.status !== "CANCELLED").reduce((n, b) => n + remainingBani(b.totalPrice, b.payments.map((p) => p.amount)), 0);
  const next = [...active, ...open].sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
  const recent = [...completed].sort((a, b) => b.startAt.getTime() - a.startAt.getTime()).slice(0, 3);

  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(" ")[0]}`} description="Your bookings at a glance." actions={<Link href="/vehicles" className={buttonVariants()}><Search aria-hidden className="size-4" /> Find a vehicle</Link>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Awaiting or confirmed" value={open.length} hint="Upcoming bookings" icon={Hourglass} />
        <Stat label="In progress" value={active.length} hint="Vehicles you have now" icon={CalendarCheck} />
        <Stat label="Completed" value={completed.length} icon={CheckCircle2} />
        <Stat label="Balance to pay" value={formatMoney(owing, currency)} hint="On your active and upcoming bookings" icon={Wallet} tone={owing > 0 ? "warning" : undefined} />
      </div>

      <Section title="Your next booking">
        {next ? (
          <Card>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-surface-3 sm:w-48">
                {coverOf(next.vehicle.photos) && <img src={coverOf(next.vehicle.photos)!} alt="" className="size-full object-cover" />}
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{next.vehicle.name}</h3><BookingStatusBadge status={next.status} /></div>
                <p className="text-sm text-muted">{formatLocalDateTime(next.startAt)} → {formatLocalDateTime(next.endAt)} (Bucharest time)</p>
                <p className="text-sm font-semibold">{formatMoney(next.totalPrice, currency)}</p>
              </div>
              <Link href={`/account/bookings/${next.id}`} className={buttonVariants({ variant: "outline" })}>View details</Link>
            </CardContent>
          </Card>
        ) : (
          <EmptyState icon={CalendarX2} title="No upcoming bookings" description="Pick a vehicle and your dates to make your first booking." action={<Link href="/vehicles" className={buttonVariants()}>Browse vehicles</Link>} />
        )}
      </Section>

      {recent.length > 0 && (
        <Section title="Recently completed" actions={<Link href="/account/bookings?tab=past" className="text-sm font-semibold text-accent-fg hover:underline">All past bookings</Link>}>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {recent.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-medium">{b.vehicle.name}</span>
                <span className="text-muted">{formatLocalDateTime(b.startAt)}</span>
                <span className="font-semibold">{formatMoney(b.totalPrice, currency)}</span>
                <Link href={`/account/bookings/${b.id}`} className="font-semibold text-accent-fg hover:underline">Details</Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
