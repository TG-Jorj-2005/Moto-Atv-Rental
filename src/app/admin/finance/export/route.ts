import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { formatLocalDateTime } from "@/lib/business-time";

export const dynamic = "force-dynamic";

// A cell that starts with = + - @ could be run as a formula by a spreadsheet: it is neutralized with a leading quote.
function cell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

// GET /admin/finance/export: completed bookings with the commission snapshot of each one. Administrators only.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (user.role !== "ADMIN") return new NextResponse("Forbidden", { status: 403 });

  const bookings = await prisma.booking.findMany({
    where: { status: "COMPLETED" },
    orderBy: [{ completedAt: "desc" }, { id: "asc" }],
    take: 5000,
    select: { id: true, startAt: true, endAt: true, completedAt: true, totalPrice: true, commissionBps: true, commissionAmount: true, ownerAmount: true, vehicle: { select: { name: true, plate: true, owner: { select: { name: true } } } } },
  });
  const money = (bani: number | null) => (bani === null ? "" : (bani / 100).toFixed(2));
  const lines = [
    ["booking", "vehicle", "plate", "offered_by", "start_bucharest", "end_bucharest", "completed_bucharest", "charged_ron", "commission_percent", "commission_ron", "owner_share_ron"].join(","),
    ...bookings.map((b) =>
      [b.id, b.vehicle.name, b.vehicle.plate, b.vehicle.owner?.name ?? "Platform fleet", formatLocalDateTime(b.startAt), formatLocalDateTime(b.endAt), b.completedAt ? formatLocalDateTime(b.completedAt) : "", money(b.totalPrice), b.commissionBps === null ? "" : (b.commissionBps / 100).toFixed(2), money(b.commissionAmount), money(b.ownerAmount)].map(cell).join(","),
    ),
  ];
  return new NextResponse(`﻿${lines.join("\n")}\n`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="completed-bookings.csv"', "Cache-Control": "no-store" } });
}
