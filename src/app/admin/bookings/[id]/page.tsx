import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { getCurrency } from "@/lib/currency-server";
import { formatMoney } from "@/lib/currency";
import { formatLocalDateTime } from "@/lib/business-time";
import { adminActions, bookingFlags, DENIAL_MESSAGES, HANDOVER_OPENS_BEFORE_START_MS, isHandoverLate } from "@/lib/booking-rules";
import { remainingBani } from "@/lib/payments";
import { displayStatus } from "@/lib/vehicle-rules";
import { recordPaymentAction, transitionBookingAction } from "@/app/actions/admin";
import { BookingStatusBadge, VehicleStatusBadge } from "@/components/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";

export const metadata = { title: "Booking" };
export const dynamic = "force-dynamic";

const METHOD = { CASH: "Cash", CARD_POS: "Card (POS)", BANK_TRANSFER: "Bank transfer" } as const;
const ACTION: Record<string, string> = { CONFIRMED: "Confirm the booking", ACTIVE: "Record the handover", COMPLETED: "Complete (vehicle returned)", CANCELLED: "Cancel the booking" };

export default async function AdminBookingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; unpaid?: string }> }) {
  await requireRole("ADMIN");
  const { id } = await params;
  const sp = await searchParams;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      vehicle: { include: { owner: { select: { id: true, name: true, email: true, role: true } }, location: true } },
      customer: true,
      user: { select: { id: true, name: true, email: true, role: true } },
      payments: { orderBy: { paidAt: "asc" } },
      history: { orderBy: [{ changedAt: "asc" }, { id: "asc" }], include: { changedBy: { select: { name: true, email: true, role: true } } } },
    },
  });
  if (!booking) notFound();
  const [currency, activeOnVehicle] = await Promise.all([getCurrency(), prisma.booking.count({ where: { vehicleId: booking.vehicleId, status: "ACTIVE" } })]);
  const now = new Date();
  const flags = bookingFlags(booking, now);
  const paid = booking.payments.reduce((n, p) => n + p.amount, 0);
  const left = booking.status === "CANCELLED" ? 0 : remainingBani(booking.totalPrice, booking.payments.map((p) => p.amount));
  const actions = adminActions(booking.status);
  const here = `/admin/bookings/${id}`;
  const lateHandover = booking.status === "CONFIRMED" && isHandoverLate(booking.startAt, now);
  const handoverOpens = new Date(booking.startAt.getTime() - HANDOVER_OPENS_BEFORE_START_MS);

  return (
    <>
      <Link href="/admin/bookings" className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-soft hover:underline"><ArrowLeft aria-hidden className="size-4" /> All bookings</Link>
      {sp.ok && <Alert tone="success">{sp.ok === "payment" ? "The payment was recorded." : `The booking is now ${sp.ok.toLowerCase()}.`}</Alert>}
      {sp.unpaid && Number(sp.unpaid) > 0 && <Alert tone="warning" title="Completed with an unpaid balance">{formatMoney(Number(sp.unpaid), "RON")} is still unpaid. Nothing was marked as paid automatically.</Alert>}
      {sp.error && <Alert tone="error">{(DENIAL_MESSAGES as Record<string, string>)[sp.error] ?? (sp.error === "PAYMENT_INVALID" ? "Enter a valid amount." : "The action was refused.")}</Alert>}
      {flags.handoverDelayed && <Alert tone="error" title="HANDOVER_DELAYED">The start time passed more than 1 hour ago and no handover was recorded. Record the handover (a reason is required) or cancel the booking.</Alert>}
      {flags.returnOverdue && <Alert tone="error" title="Return overdue">The end time has passed and the vehicle was not marked as returned. Complete the booking when it is back.</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{booking.vehicle.name}</h1>
        <BookingStatusBadge status={booking.status} />
        <VehicleStatusBadge status={displayStatus(booking.vehicle.status, activeOnVehicle > 0)} />
        <span className="text-sm text-muted">Reference <span className="font-mono">{booking.id.slice(-8).toUpperCase()}</span></span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Booking</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted">Customer:</span> <strong>{booking.customer.fullName}</strong> · {booking.customer.email} · {booking.customer.phone}</p>
            {booking.user && <p><span className="text-muted">Account:</span> {booking.user.name} ({booking.user.role.toLowerCase().replace("_", " ")})</p>}
            <p><span className="text-muted">Period:</span> {formatLocalDateTime(booking.startAt)} → {formatLocalDateTime(booking.endAt)} (Bucharest time)</p>
            <p><span className="text-muted">Vehicle:</span> <Link className="font-medium text-accent-fg hover:underline" href={`/admin/vehicles/${booking.vehicleId}`}>{booking.vehicle.name}</Link> ({booking.vehicle.plate}), {booking.vehicle.location?.name ?? "no location"}</p>
            <p><span className="text-muted">Offered by:</span> {booking.vehicle.owner ? `${booking.vehicle.owner.name} (${booking.vehicle.owner.email})` : "Platform fleet"}</p>
            {booking.quoteId && <p className="text-muted">Created by accepting a bulk offer.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Money</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex justify-between"><span className="text-muted">Price charged</span><strong className="text-lg">{formatMoney(booking.totalPrice, currency)}</strong></p>
            <p className="flex justify-between"><span className="text-muted">Paid</span><span>{formatMoney(paid, currency)}</span></p>
            <p className={`flex justify-between ${left > 0 ? "font-semibold text-warning" : ""}`}><span>Still to pay</span><span>{formatMoney(left, currency)}</span></p>
            <hr className="border-line" />
            <p className="text-xs uppercase tracking-wide text-muted">Commission snapshot (taken when the booking was made)</p>
            <p className="flex justify-between"><span className="text-muted">Rate</span><span>{booking.commissionBps != null ? `${booking.commissionBps / 100}%` : "—"}</span></p>
            <p className="flex justify-between"><span className="text-muted">Platform commission</span><span>{booking.commissionAmount != null ? formatMoney(booking.commissionAmount, currency) : "—"}</span></p>
            <p className="flex justify-between"><span className="text-muted">Owner share</span><span>{booking.ownerAmount != null ? formatMoney(booking.ownerAmount, currency) : "none (platform fleet)"}</span></p>
          </CardContent>
        </Card>
      </div>

      {actions.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent>
            <form action={transitionBookingAction} className="space-y-3">
              <input type="hidden" name="bookingId" value={id} /><input type="hidden" name="returnTo" value={here} />
              <Field label={lateHandover ? "Reason (required: the handover is more than 1 hour late)" : "Reason"} htmlFor="reason" hint="Required to cancel a booking and for a late handover. It is kept in the history." >
                <Input id="reason" name="reason" maxLength={500} />
              </Field>
              <div className="flex flex-wrap gap-2">
                {actions.map((to) => <Button key={to} name="to" value={to} variant={to === "CANCELLED" ? "dangerOutline" : to === "COMPLETED" ? "dark" : "primary"}>{ACTION[to]}</Button>)}
              </div>
              {booking.status === "CONFIRMED" && <p className="text-xs text-muted">The handover can be recorded from {formatLocalDateTime(handoverOpens)} (1 hour before the start) until the end of the booking. Nothing changes automatically with the time.</p>}
            </form>
          </CardContent>
        </Card>
      )}

      {booking.status !== "CANCELLED" && (
        <Card>
          <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {booking.payments.length > 0 && (
              <ul className="divide-y divide-line text-sm">
                {booking.payments.map((p) => <li key={p.id} className="flex justify-between py-2"><span>{formatLocalDateTime(p.paidAt)} · {METHOD[p.method]}{p.currency === "EUR" && p.paidAmount != null ? ` · ${(p.paidAmount / 100).toFixed(2)} EUR at ${p.exchangeRate}` : ""}</span><strong>{formatMoney(p.amount, "RON")}</strong></li>)}
              </ul>
            )}
            {left > 0 && (
              <form action={recordPaymentAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="bookingId" value={id} /><input type="hidden" name="returnTo" value={here} />
                <Field label="Amount" htmlFor="amount"><Input id="amount" name="amount" type="number" min="0.01" step="0.01" required className="w-32" /></Field>
                <Field label="Currency" htmlFor="currency"><Select id="currency" name="currency" className="w-28"><option>RON</option><option>EUR</option></Select></Field>
                <Field label="Method" htmlFor="method"><Select id="method" name="method" className="w-44"><option value="CASH">Cash</option><option value="CARD_POS">Card (POS)</option><option value="BANK_TRANSFER">Bank transfer</option></Select></Field>
                <Button variant="dark">Record payment</Button>
              </form>
            )}
            <p className="text-xs text-muted">Payments are recorded by hand. Completing a booking never marks anything as paid.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>History</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            {booking.history.map((h) => (
              <li key={h.id} className="flex gap-3">
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
                <span>
                  <span className="font-medium">{h.fromStatus ?? "created"} → {h.toStatus}</span>
                  <span className="text-muted"> · {formatLocalDateTime(h.changedAt)} · {h.changedBy ? `${h.changedBy.name || h.changedBy.email} (${h.changedBy.role.toLowerCase().replace("_", " ")})` : "no actor recorded"}</span>
                  {h.note && <span className="block text-fg-soft">{h.note.startsWith("backfill:") ? <Badge className="mr-1">backfill</Badge> : null}{h.note}</span>}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </>
  );
}
