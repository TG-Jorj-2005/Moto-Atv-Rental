import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculatePrice } from "@/lib/pricing";
import { isVehicleBookable } from "@/lib/booking-rules";
import { isStartInFuture } from "@/lib/validators";
import { formatMoney, parseCurrency } from "@/lib/currency";

export const dynamic = "force-dynamic";

const MAX_PERIOD_MS = 60 * 24 * 3600_000;

// GET /api/vehicles/:id/price?start=<ISO instant>&end=<ISO instant>&cur=RON|EUR
// Public price preview for the booking form: the same pricing function the booking uses, and whether the period is
// free right now. It is only an estimate; the booking itself checks everything again.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const start = new Date(url.searchParams.get("start") ?? "");
  const end = new Date(url.searchParams.get("end") ?? "");
  const currency = parseCurrency(url.searchParams.get("cur") ?? undefined);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return NextResponse.json({ ok: false, reason: "invalid_dates" });
  if (end.getTime() <= start.getTime()) return NextResponse.json({ ok: false, reason: "end_before_start" });
  if (end.getTime() - start.getTime() > MAX_PERIOD_MS) return NextResponse.json({ ok: false, reason: "too_long" });
  if (!isStartInFuture(start)) return NextResponse.json({ ok: false, reason: "start_in_past" });

  const vehicle = await prisma.vehicle.findUnique({ where: { id }, select: { status: true, listingStatus: true, hourlyRate: true, dailyRate: true, weekendRate: true } });
  if (!vehicle || !isVehicleBookable(vehicle)) return NextResponse.json({ ok: false, reason: "vehicle_unavailable" }, { status: 404 });

  const busy = await prisma.booking.count({ where: { vehicleId: id, status: { not: "CANCELLED" }, startAt: { lt: end }, endAt: { gt: start } } });
  const total = calculatePrice(start, end, { hourly: vehicle.hourlyRate, daily: vehicle.dailyRate, weekend: vehicle.weekendRate });
  return NextResponse.json({ ok: true, available: busy === 0, totalBani: total, totalLabel: formatMoney(total, currency) });
}
