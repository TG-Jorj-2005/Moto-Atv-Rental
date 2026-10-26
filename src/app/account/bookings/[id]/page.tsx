import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Clock, MapPin, Phone } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { getCurrency } from "@/lib/currency-server";
import { formatMoney } from "@/lib/currency";
import { formatLocalDateTime } from "@/lib/business-time";
import { customerCanCancel, DENIAL_MESSAGES } from "@/lib/booking-rules";
import { transitionBooking } from "@/lib/booking-service";
import { remainingBani } from "@/lib/payments";
import { coverOf } from "@/lib/photos";
import { BookingStatusBadge } from "@/components/status-badges";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/form";

export const metadata = { title: "Booking details" };
export const dynamic = "force-dynamic";

const METHOD = { CASH: "Cash", CARD_POS: "Card", BANK_TRANSFER: "Bank transfer" } as const;

export default async function BookingDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string; ok?: string; error?: string }> }) {
  const user = await requireRole("CUSTOMER", "OWNER", "RENTAL_COMPANY");
  const { id } = await params;
  const { new: isNew, ok, error } = await searchParams;
  // Only the person who made the booking can open it; for everybody else it does not exist.
  const booking = await prisma.booking.findFirst({
    where: { id, userId: user.id },
    include: {
      vehicle: { include: { location: true, photos: { orderBy: { position: "asc" }, take: 1 } } },
      payments: { orderBy: { paidAt: "asc" } },
      history: { orderBy: [{ changedAt: "asc" }, { id: "asc" }] },
    },
  });
  if (!booking) notFound();
  const currency = await getCurrency();
  const cancellable = customerCanCancel(booking, new Date());
  const paid = booking.payments.reduce((n, p) => n + p.amount, 0);
  const owing = booking.status === "CANCELLED" ? 0 : remainingBani(booking.totalPrice, booking.payments.map((p) => p.amount));
  const cover = coverOf(booking.vehicle.photos);

  async function cancel(formData: FormData) {
    "use server";
    const me = await requireRole("CUSTOMER", "OWNER", "RENTAL_COMPANY");
    const result = await transitionBooking(me.id, id, "CANCELLED", { reason: String(formData.get("reason") ?? "") });
    revalidatePath(`/account/bookings/${id}`);
    redirect(`/account/bookings/${id}?${result.ok ? "ok=cancelled" : `error=${result.code}`}`);
  }

  return (
    <>
      <Link href="/account/bookings" className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-soft hover:underline"><ArrowLeft aria-hidden className="size-4" /> All bookings</Link>
      {isNew && <Alert tone="success" title="Booking requested">Our team will confirm it. You can follow its status here. Until it starts you can cancel it free of charge.</Alert>}
      {ok && <Alert tone="success">Your booking was cancelled.</Alert>}
      {error && <Alert tone="error">{(DENIAL_MESSAGES as Record<string, string>)[error] ?? "The action was refused."}</Alert>}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold tracking-tight">{booking.vehicle.name}</h1><BookingStatusBadge status={booking.status} /></div>
          <p className="text-sm text-muted">Booking reference <span className="font-mono">{booking.id.slice(-8).toUpperCase()}</span>{booking.quoteId && " · part of a bulk offer"}</p>
        </div>
        <Link href={`/vehicles/${booking.vehicleId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>View the vehicle</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Rental period</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <div className="aspect-[4/3] overflow-hidden rounded-lg bg-surface-3">{cover && <img src={cover} alt="" className="size-full object-cover" />}</div>
              <dl className="space-y-2 text-sm">
                <div><dt className="text-muted">Starts</dt><dd className="font-semibold">{formatLocalDateTime(booking.startAt)} (Bucharest time)</dd></div>
                <div><dt className="text-muted">Ends</dt><dd className="font-semibold">{formatLocalDateTime(booking.endAt)} (Bucharest time)</dd></div>
              </dl>
            </CardContent>
          </Card>

          {booking.vehicle.location && (
            <Card>
              <CardHeader><CardTitle>Pick-up location</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <p className="font-semibold">{booking.vehicle.location.name}</p>
                <p className="flex items-center gap-2"><MapPin aria-hidden className="size-4 text-subtle" /> {booking.vehicle.location.address}, {booking.vehicle.location.city}</p>
                <p className="flex items-center gap-2"><Clock aria-hidden className="size-4 text-subtle" /> {booking.vehicle.location.hours}</p>
                <p className="flex items-center gap-2"><Phone aria-hidden className="size-4 text-subtle" /> {booking.vehicle.location.phone}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>What happened</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                {booking.history.map((h) => (
                  <li key={h.id} className="flex gap-3">
                    <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
                    <span>
                      <span className="font-medium">{h.fromStatus === null ? `Booking ${h.toStatus === "CONFIRMED" ? "confirmed" : "requested"}` : `Status changed to ${h.toStatus.toLowerCase()}`}</span>
                      <span className="text-muted"> · {formatLocalDateTime(h.changedAt)}{h.changedById && h.changedById !== user.id ? " · by our team" : ""}</span>
                      {h.note && h.changedById === user.id && !h.note.startsWith("backfill") && <span className="block text-muted">Your reason: {h.note}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Price and payments</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted">Total price</span><span className="text-lg font-bold">{formatMoney(booking.totalPrice, currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Paid so far</span><span className="font-semibold">{formatMoney(paid, currency)}</span></div>
              {owing > 0 && <div className="flex justify-between text-warning"><span>Still to pay</span><span className="font-semibold">{formatMoney(owing, currency)}</span></div>}
              {booking.payments.length > 0 && (
                <ul className="space-y-1 border-t border-line pt-3 text-xs text-muted">
                  {booking.payments.map((p) => <li key={p.id} className="flex justify-between"><span>{formatLocalDateTime(p.paidAt).slice(0, 10)} · {METHOD[p.method]}</span><span>{formatMoney(p.amount, currency)}</span></li>)}
                </ul>
              )}
              <p className="text-xs text-muted">Payments are recorded by our team at pick-up or when we receive them.</p>
            </CardContent>
          </Card>

          {cancellable ? (
            <Card>
              <CardHeader><CardTitle>Cancel this booking</CardTitle></CardHeader>
              <CardContent>
                <form action={cancel} className="space-y-3">
                  <Field label="Reason (optional)" htmlFor="reason"><Textarea id="reason" name="reason" maxLength={500} className="min-h-20" /></Field>
                  <Button variant="dangerOutline" className="w-full">Cancel booking</Button>
                  <p className="text-xs text-muted">Free of charge until the booking starts. This cannot be undone.</p>
                </form>
              </CardContent>
            </Card>
          ) : booking.status !== "CANCELLED" && booking.status !== "COMPLETED" ? (
            <Alert tone="info">The booking has started, so only our team can cancel it. Contact the pick-up location if you need to.</Alert>
          ) : null}
        </div>
      </div>
    </>
  );
}
