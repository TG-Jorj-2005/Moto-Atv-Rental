import { prisma } from "@/lib/db";
import { addDays, formatLocalDateTime, localDayStart, type LocalDate } from "@/lib/business-time";
import { csvCell } from "@/lib/csv";

export type ExportRange = { from: Date | null; toExclusive: Date | null; error?: undefined } | { error: string };

function parseDay(value: string | null): LocalDate | null | "invalid" {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return "invalid";
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return "invalid";
  return { year, month, day };
}

// `from` and `to` are Bucharest calendar days (YYYY-MM-DD), both inclusive; either may be empty.
export function parseExportRange(from: string | null, to: string | null): ExportRange {
  const a = parseDay(from);
  const b = parseDay(to);
  if (a === "invalid" || b === "invalid") return { error: "Dates must be written as YYYY-MM-DD." };
  const start = a ? localDayStart(a) : null;
  const end = b ? localDayStart(addDays(b, 1)) : null;
  if (start && end && start >= end) return { error: "The start date must not be after the end date." };
  return { from: start, toExclusive: end };
}

const money = (bani: number | null) => (bani === null ? "" : (bani / 100).toFixed(2));

const HEADER = ["booking", "vehicle", "plate", "offered_by", "start_bucharest", "end_bucharest", "completed_bucharest", "charged_ron", "commission_percent", "commission_ron", "owner_share_ron"];

// Completed bookings with the commission snapshot kept on each one. `ownerId` limits the report to one provider's
// vehicles (never trust it from the request: the caller passes the id of the signed-in user).
export async function completedBookingsCsv(range: { from: Date | null; toExclusive: Date | null }, ownerId?: string): Promise<string> {
  const bookings = await prisma.booking.findMany({
    where: {
      status: "COMPLETED",
      ...(ownerId ? { vehicle: { ownerId } } : {}),
      ...(range.from || range.toExclusive ? { completedAt: { ...(range.from ? { gte: range.from } : {}), ...(range.toExclusive ? { lt: range.toExclusive } : {}) } } : {}),
    },
    orderBy: [{ completedAt: "desc" }, { id: "asc" }],
    take: 5000,
    select: { id: true, startAt: true, endAt: true, completedAt: true, totalPrice: true, commissionBps: true, commissionAmount: true, ownerAmount: true, vehicle: { select: { name: true, plate: true, owner: { select: { name: true } } } } },
  });
  const lines = [
    HEADER.join(","),
    ...bookings.map((b) =>
      [b.id, b.vehicle.name, b.vehicle.plate, b.vehicle.owner?.name ?? "Platform fleet", formatLocalDateTime(b.startAt), formatLocalDateTime(b.endAt), b.completedAt ? formatLocalDateTime(b.completedAt) : "", money(b.totalPrice), b.commissionBps === null ? "" : (b.commissionBps / 100).toFixed(2), money(b.commissionAmount), money(b.ownerAmount)].map(csvCell).join(","),
    ),
  ];
  return `﻿${lines.join("\n")}\n`;
}

export function csvResponse(body: string, filename: string) {
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
}
