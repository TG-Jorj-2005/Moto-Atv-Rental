import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CalendarDays, Cog, Gauge, IdCard, MapPin, Phone, Clock, Tag, Users, Zap } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getCurrency } from "@/lib/currency-server";
import { formatMoney } from "@/lib/currency";
import { addDays, localDateOf } from "@/lib/business-time";
import { busyDaySet, monthsFrom } from "@/lib/calendar-days";
import { canRent } from "@/lib/roles";
import { creditForPath, photoUrl } from "@/lib/photos";
import { displayStatus } from "@/lib/vehicle-rules";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingPanel } from "@/components/booking-panel";
import { MonthCalendar, type DayMarks } from "@/components/month-calendar";
import { VehicleGallery } from "@/components/vehicle-gallery";
import { TYPE_LABEL, offerKind } from "@/components/vehicle-card";
import { CATEGORY_LABELS } from "@/lib/vehicle-categories";

export const dynamic = "force-dynamic";

const HORIZON_DAYS = 90;

async function loadVehicle(id: string) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { photos: { orderBy: { position: "asc" } }, location: true, owner: { select: { role: true, name: true } } },
  });
  // Unapproved and retired vehicles do not exist for the public.
  return vehicle && vehicle.listingStatus === "APPROVED" && vehicle.status !== "RETIRED" ? vehicle : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const vehicle = await loadVehicle((await params).id);
  return { title: vehicle?.name ?? "Vehicle not found" };
}

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehicle = await loadVehicle(id);
  if (!vehicle) notFound();

  const [user, currency] = await Promise.all([getCurrentUser(), getCurrency()]);
  const now = new Date();
  const today = localDateOf(now);
  const horizonEnd = addDays(today, HORIZON_DAYS);
  const bookings = await prisma.booking.findMany({
    where: { vehicleId: id, status: { not: "CANCELLED" }, endAt: { gt: now }, startAt: { lt: new Date(now.getTime() + (HORIZON_DAYS + 2) * 86_400_000) } },
    select: { startAt: true, endAt: true },
  });
  const busy = busyDaySet(bookings, today, HORIZON_DAYS);
  const marks: DayMarks = Object.fromEntries([...busy].map((d) => [d, [{ label: "Booked", tone: "busy" as const }]]));
  const months = monthsFrom(today, 3);

  const stored = vehicle.status;
  const display = displayStatus(stored, false);
  const inService = display === "IN_SERVICE";
  const mine = !!user && vehicle.ownerId === user.id;
  const photos = vehicle.photos.map((p) => ({ url: photoUrl(p.path), alt: `${vehicle.name}`, credit: creditForPath(p.path) }));
  const specs = [
    { icon: Cog, label: "Type", value: TYPE_LABEL[vehicle.type] },
    vehicle.category && { icon: Tag, label: "Category", value: CATEGORY_LABELS[vehicle.category] },
    vehicle.year != null && { icon: CalendarDays, label: "Year", value: String(vehicle.year) },
    vehicle.engineCc != null && { icon: Gauge, label: "Engine", value: `${vehicle.engineCc} cc` },
    vehicle.powerHp != null && { icon: Zap, label: "Power", value: `${vehicle.powerHp} hp` },
    vehicle.seats != null && { icon: Users, label: "Seats", value: String(vehicle.seats) },
    vehicle.licenseCategory && { icon: IdCard, label: "Licence needed", value: vehicle.licenseCategory },
    { icon: Building2, label: "Offered by", value: offerKind(vehicle.owner) },
  ].filter(Boolean) as { icon: typeof Cog; label: string; value: string }[];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/vehicles" className="hover:underline">Vehicles</Link> <span aria-hidden>/</span> <span className="text-fg">{vehicle.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-8">
          <VehicleGallery photos={photos} name={vehicle.name} />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="dark">{TYPE_LABEL[vehicle.type]}</Badge>
              {vehicle.category && <Badge tone="brand">{CATEGORY_LABELS[vehicle.category]}</Badge>}
              {inService ? <Badge tone="warning">Temporarily unavailable</Badge> : <Badge tone="success">Available to book</Badge>}
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{vehicle.name}</h1>
            {vehicle.location && <p className="flex items-center gap-1.5 text-muted"><MapPin aria-hidden className="size-4" /> {vehicle.location.name}, {vehicle.location.city}, {vehicle.location.county}</p>}
            {vehicle.description && <p className="max-w-3xl whitespace-pre-line text-fg-soft">{vehicle.description}</p>}
            <a href="#book" className={buttonVariants({ size: "lg", className: "w-full lg:hidden" })}>Check the price and book</a>
          </div>

          <section aria-labelledby="specs" className="space-y-3">
            <h2 id="specs" className="text-lg font-semibold tracking-tight">Specifications</h2>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {specs.map((s) => (
                <div key={s.label} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
                  <s.icon aria-hidden className="size-5 text-accent-fg" />
                  <div><dt className="text-xs text-muted">{s.label}</dt><dd className="font-semibold">{s.value}</dd></div>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="availability" className="space-y-3">
            <div>
              <h2 id="availability" className="text-lg font-semibold tracking-tight">Availability</h2>
              <p className="text-sm text-muted">Days with a booking are crossed out. Times are Bucharest time; a vehicle can be free for part of a booked day.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {months.map((m) => <MonthCalendar key={`${m.year}-${m.month}`} year={m.year} month={m.month} marks={marks} today={today} compact />)}
            </div>
          </section>

          {vehicle.location && (
            <Card>
              <CardHeader><CardTitle>Pick-up location</CardTitle></CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
                <p className="flex items-start gap-2"><MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-subtle" /><span>{vehicle.location.address}, {vehicle.location.city}</span></p>
                <p className="flex items-start gap-2"><Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-subtle" /><span>{vehicle.location.hours}</span></p>
                <p className="flex items-start gap-2"><Phone aria-hidden className="mt-0.5 size-4 shrink-0 text-subtle" /><span>{vehicle.location.phone}</span></p>
              </CardContent>
            </Card>
          )}
        </div>

        <aside id="book" className="scroll-mt-24 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader>
              <p className="text-3xl font-bold tracking-tight">{formatMoney(vehicle.dailyRate, currency)}<span className="text-base font-medium text-muted"> / day</span></p>
              <p className="text-sm text-muted">
                {formatMoney(vehicle.hourlyRate, currency)} per hour{vehicle.weekendRate != null && <> · weekend flat rate {formatMoney(vehicle.weekendRate, currency)}</>}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {inService ? (
                <Alert tone="warning" title="Temporarily unavailable">This vehicle is in service and cannot be booked right now.</Alert>
              ) : !user ? (
                <div className="space-y-3">
                  <p className="text-sm text-fg-soft">Log in or create an account to book this vehicle.</p>
                  <div className="flex gap-2">
                    <Link href={`/login?next=/vehicles/${id}`} className={buttonVariants({ className: "flex-1" })}>Log in</Link>
                    <Link href={`/register?next=/vehicles/${id}`} className={buttonVariants({ variant: "outline", className: "flex-1" })}>Register</Link>
                  </div>
                </div>
              ) : mine ? (
                <Alert tone="info">This is your own vehicle, so you cannot book it. <Link className="font-semibold underline" href={`/provider/vehicles/${id}`}>Manage it</Link>.</Alert>
              ) : !canRent(user.role) ? (
                <Alert tone="info">Administrator accounts manage the platform and do not make bookings.</Alert>
              ) : (
                <BookingPanel vehicleId={id} currency={currency} defaultName={user.name} defaultEmail={user.email} />
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
