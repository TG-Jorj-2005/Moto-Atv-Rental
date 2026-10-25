import Link from "next/link";
import { addDays, type LocalDate } from "@/lib/business-time";
import { cn } from "@/lib/utils";

export type DayEvent = { label: string; href?: string; tone?: "busy" | "info" | "warning" | "success" | "neutral" };
export type DayMarks = Record<string, DayEvent[]>; // key: YYYY-MM-DD (Bucharest calendar date)

export const dayKey = (d: LocalDate) => `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TONE: Record<NonNullable<DayEvent["tone"]>, string> = {
  busy: "bg-red-100 text-red-900",
  info: "bg-sky-100 text-sky-900",
  warning: "bg-amber-100 text-amber-900",
  success: "bg-green-100 text-green-900",
  neutral: "bg-stone-100 text-stone-800",
};

// One month as a calendar grid (weeks start on Monday). Days are Bucharest calendar dates. With `compact` the days
// only show whether they are taken (used for the public availability); otherwise each event is listed in its day.
export function MonthCalendar({ year, month, marks, today, compact = false }: { year: number; month: number; marks: DayMarks; today: LocalDate; compact?: boolean }) {
  const first = { year, month, day: 1 };
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (LocalDate | null)[] = [...Array.from({ length: firstWeekday }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i))];
  while (cells.length % 7 !== 0) cells.push(null);
  const todayKey = dayKey(today);

  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{MONTHS[month - 1]} {year}</p>
      <div role="grid" aria-label={`${MONTHS[month - 1]} ${year}`} className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-stone-200 bg-stone-200 text-xs">
        {WEEKDAYS.map((w) => <div key={w} role="columnheader" className="bg-stone-50 px-1 py-1.5 text-center font-semibold text-stone-600">{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} role="gridcell" className="bg-stone-50/60" />;
          const key = dayKey(d);
          const events = marks[key] ?? [];
          const busy = events.some((e) => e.tone === "busy");
          return (
            <div
              key={key}
              role="gridcell"
              aria-label={`${key}${events.length ? `: ${events.map((e) => e.label).join(", ")}` : ""}`}
              className={cn("bg-white p-1", compact ? "min-h-9 text-center" : "min-h-20", busy && compact && "bg-red-100", key === todayKey && "ring-2 ring-inset ring-brand-600")}
            >
              <span className={cn("block font-medium", key === todayKey ? "text-brand-800" : "text-stone-700", busy && compact && "text-red-900 line-through")}>{d.day}</span>
              {!compact && events.slice(0, 3).map((e, j) => {
                const cls = cn("mt-0.5 block truncate rounded px-1 py-0.5 text-[11px] leading-tight", TONE[e.tone ?? "neutral"]);
                return e.href ? <Link key={j} href={e.href} className={cls} title={e.label}>{e.label}</Link> : <span key={j} className={cls} title={e.label}>{e.label}</span>;
              })}
              {!compact && events.length > 3 && <span className="mt-0.5 block text-[11px] text-stone-600">+{events.length - 3} more</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
