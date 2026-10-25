import type { MaintenanceType } from "@prisma/client";
import { addDays, localDateOf, localDayStart, type LocalDate } from "@/lib/business-time";

// Pure rules for maintenance records and document deadlines. A record never changes a vehicle's status or a booking:
// it only produces warnings. Putting a vehicle IN_SERVICE stays an explicit decision of an ADMIN.

export const DUE_SOON_DAYS = 30;
// Documents every road vehicle must have valid. A vehicle without any record for them is flagged as "no record".
export const REQUIRED_DOCUMENTS: readonly MaintenanceType[] = ["ITP", "RCA"];

export type DueState = "OK" | "DUE_SOON" | "OVERDUE";

const dayNumber = (d: LocalDate) => Math.round(Date.UTC(d.year, d.month - 1, d.day) / 86_400_000);

// Deadlines are calendar dates in Bucharest. A document is still valid on its due date and overdue the day after.
export function dueState(nextDueAt: Date, now: Date): DueState {
  const days = dayNumber(localDateOf(nextDueAt)) - dayNumber(localDateOf(now));
  if (days < 0) return "OVERDUE";
  return days <= DUE_SOON_DAYS ? "DUE_SOON" : "OK";
}

export type RecordLike = { type: MaintenanceType; performedAt: Date; nextDueAt: Date | null };
export type DocumentWarning = { type: MaintenanceType; state: DueState | "NO_RECORD"; dueAt: Date | null };

// One warning per required document and per other type that has an upcoming/overdue deadline. For each type only the
// most recent record (by performedAt) counts: renewing a document replaces the old deadline.
export function documentWarnings(records: RecordLike[], now: Date): DocumentWarning[] {
  const latest = new Map<MaintenanceType, RecordLike>();
  for (const r of records) {
    const current = latest.get(r.type);
    if (!current || r.performedAt.getTime() > current.performedAt.getTime()) latest.set(r.type, r);
  }
  const warnings: DocumentWarning[] = [];
  for (const type of REQUIRED_DOCUMENTS) {
    const r = latest.get(type);
    if (!r || !r.nextDueAt) warnings.push({ type, state: "NO_RECORD", dueAt: null });
    else {
      const state = dueState(r.nextDueAt, now);
      if (state !== "OK") warnings.push({ type, state, dueAt: r.nextDueAt });
    }
  }
  for (const [type, r] of latest) {
    if (REQUIRED_DOCUMENTS.includes(type) || !r.nextDueAt) continue;
    const state = dueState(r.nextDueAt, now);
    if (state !== "OK") warnings.push({ type, state, dueAt: r.nextDueAt });
  }
  return warnings;
}

// A form date ("2027-03-28") becomes the start of that calendar day in Bucharest.
export function parseDateInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const date = { year: +m[1]!, month: +m[2]!, day: +m[3]! };
  const check = addDays(date, 0);
  if (check.year !== date.year || check.month !== date.month || check.day !== date.day) return null;
  return localDayStart(date);
}
