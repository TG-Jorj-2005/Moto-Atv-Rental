import { prisma } from "@/lib/db";
import { displayStatus } from "@/lib/vehicle-rules";
import { documentWarnings } from "@/lib/maintenance-rules";

// Reads for the owner / rental-company area. Every query is scoped to the owner's own vehicles.

export async function ownerVehicleRows(ownerId: string, now: Date = new Date()) {
  const vehicles = await prisma.vehicle.findMany({
    where: { ownerId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    include: {
      location: { select: { name: true, city: true } },
      photos: { orderBy: { position: "asc" }, take: 1, select: { path: true } },
      maintenance: { select: { type: true, performedAt: true, nextDueAt: true } },
    },
  });
  const ids = vehicles.map((v) => v.id);
  const [active, upcoming] = ids.length
    ? await Promise.all([
        prisma.booking.groupBy({ by: ["vehicleId"], where: { vehicleId: { in: ids }, status: "ACTIVE" }, _count: true }),
        prisma.booking.groupBy({ by: ["vehicleId"], where: { vehicleId: { in: ids }, status: { in: ["PENDING", "CONFIRMED"] }, endAt: { gt: now } }, _count: true }),
      ])
    : [[], []];
  const activeSet = new Set(active.map((a) => a.vehicleId));
  const upcomingMap = new Map(upcoming.map((u) => [u.vehicleId, u._count]));
  return vehicles.map((v) => ({
    ...v,
    display: displayStatus(v.status, activeSet.has(v.id)),
    upcomingBookings: upcomingMap.get(v.id) ?? 0,
    warnings: documentWarnings(v.maintenance, now),
  }));
}

export type OwnerVehicleRow = Awaited<ReturnType<typeof ownerVehicleRows>>[number];

// Money seen by an owner. All amounts are RON bani, taken from the snapshot stored on each booking at creation.
// "earned" accrues only for COMPLETED bookings; "expected" is calculated for confirmed and active bookings and is not due yet.
export async function ownerMoney(ownerId: string) {
  const [completed, open, payouts] = await Promise.all([
    prisma.booking.aggregate({ where: { status: "COMPLETED", vehicle: { ownerId } }, _sum: { ownerAmount: true, commissionAmount: true, totalPrice: true }, _count: true }),
    prisma.booking.aggregate({ where: { status: { in: ["CONFIRMED", "ACTIVE"] }, vehicle: { ownerId } }, _sum: { ownerAmount: true }, _count: true }),
    prisma.payout.aggregate({ where: { ownerId }, _sum: { amount: true } }),
  ]);
  const earned = completed._sum.ownerAmount ?? 0;
  const paid = payouts._sum.amount ?? 0;
  return {
    gross: completed._sum.totalPrice ?? 0,
    commission: completed._sum.commissionAmount ?? 0,
    earned,
    paid,
    balance: earned - paid,
    expected: open._sum.ownerAmount ?? 0,
    completedCount: completed._count,
    openCount: open._count,
  };
}
