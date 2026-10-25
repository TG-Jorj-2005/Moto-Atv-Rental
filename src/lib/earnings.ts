import { prisma } from "@/lib/db";

export type OwnerSummary = {
  ownerId: string;
  completedBookings: number;
  gross: number; // what customers paid for completed bookings
  commission: number; // kept by the platform
  earned: number; // owner's share
  paid: number; // payouts already recorded
  balance: number; // earned - paid: what we still owe
};

// One summary per owner who has completed bookings or payouts (all RON bani).
export async function ownerSummaries(onlyOwnerId?: string): Promise<OwnerSummary[]> {
  const [bookings, payouts] = await Promise.all([
    prisma.booking.findMany({
      where: { status: "COMPLETED", vehicle: { ownerId: onlyOwnerId ?? { not: null } } },
      select: { totalPrice: true, commissionAmount: true, ownerAmount: true, vehicle: { select: { ownerId: true } } },
    }),
    prisma.payout.findMany({ where: onlyOwnerId ? { ownerId: onlyOwnerId } : {}, select: { ownerId: true, amount: true } }),
  ]);
  const map = new Map<string, OwnerSummary>();
  const get = (id: string) => {
    let s = map.get(id);
    if (!s) map.set(id, (s = { ownerId: id, completedBookings: 0, gross: 0, commission: 0, earned: 0, paid: 0, balance: 0 }));
    return s;
  };
  for (const b of bookings) {
    const s = get(b.vehicle.ownerId!);
    s.completedBookings += 1;
    s.gross += b.totalPrice;
    s.commission += b.commissionAmount ?? 0;
    s.earned += b.ownerAmount ?? 0;
  }
  for (const p of payouts) get(p.ownerId).paid += p.amount;
  for (const s of map.values()) s.balance = s.earned - s.paid;
  return [...map.values()];
}
