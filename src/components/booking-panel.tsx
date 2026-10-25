"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { LocalTimeError, parseLocalDateTimeInput, toLocalInputValue } from "@/lib/business-time";
import { BOOKING_API_MESSAGES, PRICE_REASONS } from "@/lib/booking-messages";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

type Estimate =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; label: string; available: boolean }
  | { state: "problem"; message: string };

const PRESETS = [
  { label: "2 hours", hours: 2 },
  { label: "4 hours", hours: 4 },
  { label: "1 day", hours: 24 },
  { label: "2 days", hours: 48 },
];

// The booking form of a vehicle page. Times are typed in Bucharest time (whatever the time zone of the browser is);
// the price and availability shown come from the server (the same pricing the booking will use).
export function BookingPanel({ vehicleId, currency, defaultName, defaultEmail }: { vehicleId: string; currency: "RON" | "EUR"; defaultName: string; defaultEmail: string }) {
  const router = useRouter();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [minStart, setMinStart] = useState<string | undefined>();
  const [estimate, setEstimate] = useState<Estimate>({ state: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMinStart(toLocalInputValue(new Date())), []);

  useEffect(() => {
    if (!start || !end) return setEstimate({ state: "idle" });
    let startAt: Date;
    let endAt: Date;
    try {
      startAt = parseLocalDateTimeInput(start);
      endAt = parseLocalDateTimeInput(end);
    } catch (e) {
      return setEstimate({ state: "problem", message: e instanceof LocalTimeError ? e.message : "Enter a valid start and end." });
    }
    setEstimate({ state: "loading" });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const url = `/api/vehicles/${vehicleId}/price?start=${encodeURIComponent(startAt.toISOString())}&end=${encodeURIComponent(endAt.toISOString())}&cur=${currency}`;
        const data = await (await fetch(url, { signal: controller.signal })).json();
        if (data.ok) setEstimate({ state: "ready", label: data.totalLabel, available: data.available });
        else setEstimate({ state: "problem", message: PRICE_REASONS[data.reason] ?? "Could not calculate the price." });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setEstimate({ state: "problem", message: "Could not calculate the price. Check your connection." });
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [start, end, vehicleId, currency]);

  function applyPreset(hours: number) {
    try {
      const from = start ? parseLocalDateTimeInput(start) : null;
      if (!from) return;
      setEnd(toLocalInputValue(new Date(from.getTime() + hours * 3600_000)));
    } catch {
      /* the start is invalid: the estimate already explains it */
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    let startAt: Date;
    let endAt: Date;
    try {
      startAt = parseLocalDateTimeInput(start);
      endAt = parseLocalDateTimeInput(end);
    } catch (e) {
      return setError(e instanceof LocalTimeError ? e.message : "Enter a valid start and end.");
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          customer: { fullName: form.get("fullName"), email: form.get("email"), phone: form.get("phone") },
        }),
      });
      const body = await response.json().catch(() => null);
      if (response.ok) return router.push(`/account/bookings/${body.id}?new=1`);
      setError(BOOKING_API_MESSAGES[body?.error] ?? "The booking could not be made. Please check the details and try again.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const blocked = estimate.state === "problem" || (estimate.state === "ready" && !estimate.available);

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-describedby="estimate">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <Field label="Start (Bucharest time)" htmlFor="startAt"><Input id="startAt" type="datetime-local" required min={minStart} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End (Bucharest time)" htmlFor="endAt"><Input id="endAt" type="datetime-local" required min={minStart} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick durations">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" disabled={!start} onClick={() => applyPreset(p.hours)} className="cursor-pointer rounded-full border border-stone-300 px-3 py-1 text-xs font-medium hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50">{p.label}</button>
        ))}
      </div>

      <div id="estimate" aria-live="polite" className="min-h-14 rounded-lg bg-stone-50 p-3 text-sm">
        {estimate.state === "idle" && <p className="text-stone-600">Choose the start and the end to see the price.</p>}
        {estimate.state === "loading" && <p className="flex items-center gap-2 text-stone-600"><Loader2 aria-hidden className="size-4 animate-spin" /> Calculating…</p>}
        {estimate.state === "problem" && <p className="font-medium text-red-700">{estimate.message}</p>}
        {estimate.state === "ready" && (
          <p>
            <span className="text-stone-600">Total price</span> <strong className="text-xl">{estimate.label}</strong>
            <span className={estimate.available ? "mt-0.5 block font-medium text-green-800" : "mt-0.5 block font-medium text-red-700"}>{estimate.available ? "Free for this period" : "Already booked for part of this period"}</span>
          </p>
        )}
      </div>

      <Field label="Full name" htmlFor="fullName"><Input id="fullName" name="fullName" required minLength={2} maxLength={100} defaultValue={defaultName} autoComplete="name" /></Field>
      <Field label="Phone" htmlFor="phone" hint="So we can reach you about the handover."><Input id="phone" name="phone" type="tel" required minLength={7} maxLength={20} autoComplete="tel" /></Field>
      <Field label="Email" htmlFor="email" hint="Bookings always use the email of your account."><Input id="email" name="email" type="email" required readOnly defaultValue={defaultEmail} /></Field>

      {error && <Alert tone="error">{error}</Alert>}
      <Button size="lg" className="w-full" disabled={submitting || blocked}>{submitting ? "Booking…" : "Request booking"}</Button>
      <p className="text-xs text-stone-600">Your request is confirmed by our team. You can cancel free of charge until the booking starts.</p>
    </form>
  );
}
