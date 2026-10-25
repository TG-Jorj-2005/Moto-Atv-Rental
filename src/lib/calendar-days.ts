import { addDays, localDateOf, type LocalDate } from "@/lib/business-time";
import { dayKey } from "@/components/month-calendar";

const dayNumber = (d: LocalDate) => Math.round(Date.UTC(d.year, d.month - 1, d.day) / 86_400_000);

// The Bucharest calendar days a booking touches, clipped to [from, from + horizonDays). The end instant is exclusive:
// a booking that ends exactly at midnight does not occupy the next day.
export function bookingDays(startAt: Date, endAt: Date, from: LocalDate, horizonDays: number): string[] {
  const first = localDateOf(startAt);
  const last = localDateOf(new Date(endAt.getTime() - 1));
  const lo = Math.max(dayNumber(first), dayNumber(from));
  const hi = Math.min(dayNumber(last), dayNumber(from) + horizonDays - 1);
  const out: string[] = [];
  for (let n = lo; n <= hi; n++) out.push(dayKey(addDays(from, n - dayNumber(from))));
  return out;
}

export function busyDaySet(bookings: { startAt: Date; endAt: Date }[], from: LocalDate, horizonDays: number): Set<string> {
  const set = new Set<string>();
  for (const b of bookings) for (const d of bookingDays(b.startAt, b.endAt, from, horizonDays)) set.add(d);
  return set;
}

// The months to show for a horizon starting at `from`: [{ year, month }, ...].
export function monthsFrom(from: LocalDate, count: number): { year: number; month: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const total = from.year * 12 + (from.month - 1) + i;
    return { year: Math.floor(total / 12), month: (total % 12) + 1 };
  });
}
