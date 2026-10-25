import type { BookingStatus, Role, VehicleStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertRunningAgainstTestDatabase } from "./safe-test-db";

// Empties every table of the TEST database (never the migrations table). Re-validates the target first.
export async function resetDatabase() {
  assertRunningAgainstTestDatabase(process.env);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

let counter = 0;
const next = () => ++counter;

export function makeUser(role: Role, overrides: { email?: string; name?: string } = {}) {
  const n = next();
  return prisma.user.create({
    data: { email: overrides.email ?? `user${n}@test.example`, name: overrides.name ?? `User ${n}`, passwordHash: "not-a-real-hash", role },
  });
}

export function makeVehicle(ownerId: string | null, overrides: { status?: VehicleStatus; listingStatus?: "PENDING" | "APPROVED" | "REJECTED" } = {}) {
  const n = next();
  return prisma.vehicle.create({
    data: {
      name: `Vehicle ${n}`,
      type: "ATV",
      plate: `T-${n}`,
      hourlyRate: 10000,
      dailyRate: 40000,
      ownerId,
      status: overrides.status ?? "AVAILABLE",
      listingStatus: overrides.listingStatus ?? "APPROVED",
    },
  });
}

export async function makeBooking(vehicleId: string, status: BookingStatus, overrides: { ownerAmount?: number; totalPrice?: number } = {}) {
  const n = next();
  const customer = await prisma.customer.create({ data: { fullName: `Customer ${n}`, email: `customer${n}@test.example`, phone: "0000000" } });
  const start = new Date(Date.UTC(2030, 0, n, 8));
  return prisma.booking.create({
    data: {
      vehicleId,
      customerId: customer.id,
      startAt: start,
      endAt: new Date(start.getTime() + 24 * 3600 * 1000),
      status,
      totalPrice: overrides.totalPrice ?? 40000,
      ...(status === "COMPLETED" ? { completedAt: new Date(), commissionBps: 1500, commissionAmount: 6000, ownerAmount: overrides.ownerAmount ?? 34000 } : {}),
    },
  });
}
