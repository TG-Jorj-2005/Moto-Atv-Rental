import { addDays, localDateOf, localDayStart, type LocalDate } from "@/lib/business-time";

// A month of the calendar given in the query string as "YYYY-MM" (Bucharest). Anything else means the current month.
export function parseMonth(value: string | undefined, now: Date = new Date()): { year: number; month: number } {
  const m = value ? /^(\d{4})-(\d{2})$/.exec(value) : null;
  if (m) {
    const year = +m[1]!;
    const month = +m[2]!;
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) return { year, month };
  }
  const today = localDateOf(now);
  return { year: today.year, month: today.month };
}

export function monthBounds({ year, month }: { year: number; month: number }): { first: LocalDate; days: number; start: Date; end: Date } {
  const first = { year, month, day: 1 };
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { first, days, start: localDayStart(first), end: localDayStart(addDays(first, days)) };
}

export function shiftMonth({ year, month }: { year: number; month: number }, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export const monthParam = ({ year, month }: { year: number; month: number }) => `${year}-${String(month).padStart(2, "0")}`;
