"use client";

import { useState } from "react";

type Result = { kind: "ok"; price: number } | { kind: "error"; message: string };

export function BookingForm({ vehicleId }: { vehicleId: string }) {
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId,
        startAt: new Date(String(form.get("startAt"))).toISOString(),
        endAt: new Date(String(form.get("endAt"))).toISOString(),
        customer: {
          fullName: form.get("fullName"),
          email: form.get("email"),
          phone: form.get("phone"),
        },
      }),
    });

    if (response.ok) {
      const booking: { totalPrice: number } = await response.json();
      setResult({ kind: "ok", price: booking.totalPrice });
    } else if (response.status === 409) {
      setResult({ kind: "error", message: "The vehicle is already booked for that period." });
    } else {
      setResult({ kind: "error", message: "Invalid data or vehicle unavailable." });
    }
  }

  const input = "w-full rounded border p-2";
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <input name="fullName" placeholder="Full name" required className={input} />
      <input name="email" type="email" placeholder="Email" required className={input} />
      <input name="phone" placeholder="Phone" required className={input} />
      <label>
        Start
        <input name="startAt" type="datetime-local" required className={input} />
      </label>
      <label>
        End
        <input name="endAt" type="datetime-local" required className={input} />
      </label>
      <button className="rounded bg-neutral-900 px-4 py-2 text-white">Book</button>
      {result?.kind === "ok" && (
        <p className="text-green-700">Booked. Total: {(result.price / 100).toFixed(0)} RON</p>
      )}
      {result?.kind === "error" && <p className="text-red-700">{result.message}</p>}
    </form>
  );
}
