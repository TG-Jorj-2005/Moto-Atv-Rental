import { prisma } from "@/lib/db";
import { documentWarnings } from "@/lib/maintenance-rules";
import { bookingFlags } from "@/lib/booking-rules";
import { localDateOf } from "@/lib/business-time";

// Numbers for the administrator's dashboard and reports. Everything is computed from the database; months are
// Bucharest calendar months. Money is RON bani.

export type MonthRow = { month: string; bookings: number; revenue: number; commission: number; platformRevenue: number };

// Last `count` months (oldest first), including months without activity. "revenue" = price charged on bookings
// completed in the month; "platformRevenue" = what the platform keeps: commission on owner vehicles plus the whole
// price of vehicles of its own fleet.
export async function monthlyFigures(count: number, now: Date = new Date()): Promise<MonthRow[]> {
  const today = localDateOf(now);
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const total = today.year * 12 + (today.month - 1) - i;
    months.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`);
  }
  const since = months[0] + "-01";
  const [created, completed] = await Promise.all([
    prisma.$queryRaw<{ m: string; n: bigint }[]>`
      SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'Europe/Bucharest'), 'YYYY-MM') AS m, count(*) AS n
      FROM bookings WHERE status <> 'CANCELLED' AND (created_at AT TIME ZONE 'Europe/Bucharest') >= ${since}::date GROUP BY 1`,
    prisma.$queryRaw<{ m: string; revenue: bigint; commission: bigint; platform: bigint }[]>`
      SELECT to_char(date_trunc('month', completed_at AT TIME ZONE 'Europe/Bucharest'), 'YYYY-MM') AS m,
             coalesce(sum(total_price), 0) AS revenue,
             coalesce(sum(commission_amount), 0) AS commission,
             coalesce(sum(total_price - coalesce(owner_amount, 0)), 0) AS platform
      FROM bookings WHERE status = 'COMPLETED' AND completed_at IS NOT NULL AND (completed_at AT TIME ZONE 'Europe/Bucharest') >= ${since}::date GROUP BY 1`,
  ]);
  return months.map((month) => {
    const c = created.find((r) => r.m === month);
    const d = completed.find((r) => r.m === month);
    return { month, bookings: Number(c?.n ?? 0), revenue: Number(d?.revenue ?? 0), commission: Number(d?.commission ?? 0), platformRevenue: Number(d?.platform ?? 0) };
  });
}

export async function adminOverview(now: Date = new Date()) {
  const [users, vehiclesByListing, vehiclesByStatus, bookingsByStatus, openQuotes, timeSensitive, unpaid, vehicleDocs, owed] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], _count: true }),
    prisma.vehicle.groupBy({ by: ["listingStatus"], _count: true }),
    prisma.vehicle.groupBy({ by: ["status"], where: { listingStatus: "APPROVED" }, _count: true }),
    prisma.booking.groupBy({ by: ["status"], _count: true }),
    prisma.quoteRequest.count({ where: { status: "QUOTED" } }),
    prisma.booking.findMany({
      where: { status: { in: ["CONFIRMED", "ACTIVE"] }, startAt: { lt: new Date(now.getTime() + 24 * 3600_000) } },
      select: { id: true, status: true, startAt: true, endAt: true, vehicle: { select: { name: true } }, customer: { select: { fullName: true } } },
      orderBy: { startAt: "asc" },
      take: 200,
    }),
    prisma.$queryRaw<{ n: bigint; total: bigint }[]>`
      SELECT count(*) AS n, coalesce(sum(b.total_price - paid.sum), 0) AS total FROM bookings b
      CROSS JOIN LATERAL (SELECT coalesce(sum(p.amount), 0) AS sum FROM payments p WHERE p.booking_id = b.id) paid
      WHERE b.status IN ('COMPLETED', 'ACTIVE') AND b.total_price > paid.sum`,
    prisma.vehicle.findMany({ where: { listingStatus: "APPROVED", status: { not: "RETIRED" } }, select: { id: true, name: true, maintenance: { select: { type: true, performedAt: true, nextDueAt: true } } } }),
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT coalesce((SELECT sum(owner_amount) FROM bookings WHERE status = 'COMPLETED' AND owner_amount IS NOT NULL), 0)
           - coalesce((SELECT sum(amount) FROM payouts), 0) AS total`,
  ]);
  const withFlags = timeSensitive.map((b) => ({ ...b, flags: bookingFlags(b, now) }));
  const docProblems = vehicleDocs.map((v) => ({ id: v.id, name: v.name, warnings: documentWarnings(v.maintenance, now) })).filter((v) => v.warnings.length > 0);
  return {
    users,
    vehiclesByListing,
    vehiclesByStatus,
    bookingsByStatus,
    openQuotes,
    delayedHandovers: withFlags.filter((b) => b.flags.handoverDelayed),
    overdueReturns: withFlags.filter((b) => b.flags.returnOverdue),
    unpaid: { count: Number(unpaid[0]?.n ?? 0), total: Number(unpaid[0]?.total ?? 0) },
    docProblems,
    owedToProviders: Number(owed[0]?.total ?? 0),
  };
}

