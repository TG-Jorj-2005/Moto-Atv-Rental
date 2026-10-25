import type { ListingStatus, Prisma, VehicleStatus, VehicleType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runTransaction } from "@/lib/tx";
import { canListVehicles } from "@/lib/roles";
import { authorizeVehicleManager } from "@/lib/vehicle-access";
import { canChangeVehicleStatus, isTakingOutOfCirculation, type VehicleDenial } from "@/lib/vehicle-rules";
import { documentWarnings, type DocumentWarning } from "@/lib/maintenance-rules";

// Lock order in the whole application: users first, then vehicles (never the other way round), so that
// concurrent operations cannot deadlock. See also booking-service.ts and quote-service.ts.

export type VehicleStatusWarnings = {
  upcomingBookings: number; // PENDING/CONFIRMED bookings that have not ended yet; they are NEVER cancelled automatically
  documents: DocumentWarning[]; // overdue / missing ITP, RCA, service deadlines
};

export type ChangeVehicleStatusResult =
  | { ok: true; from: VehicleStatus; to: VehicleStatus; warnings: VehicleStatusWarnings }
  | { ok: false; code: VehicleDenial };

// Explicit administrative status change. Only an ADMIN may do it; the role is read from the database here.
// Nothing in the application changes IN_SERVICE or RETIRED automatically, and no booking is touched.
export async function changeVehicleStatus(actorId: string, vehicleId: string, to: VehicleStatus, now: Date = new Date()): Promise<ChangeVehicleStatusResult> {
  return runTransaction(async (tx): Promise<ChangeVehicleStatusResult> => {
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
    if (actor?.role !== "ADMIN") return { ok: false, code: "FORBIDDEN" };

    const head = await tx.vehicle.findUnique({ where: { id: vehicleId }, select: { ownerId: true } });
    if (!head) return { ok: false, code: "NOT_FOUND" };
    // Users before vehicles. The owner's row is locked because reactivating a vehicle must not race with a
    // demotion of its owner (a demotion requires every vehicle of the owner to be RETIRED).
    if (head.ownerId) await tx.$queryRaw`SELECT id FROM users WHERE id = ${head.ownerId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${vehicleId} FOR UPDATE`;

    const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId }, select: { status: true, ownerId: true, owner: { select: { role: true } } } });
    if (!vehicle) return { ok: false, code: "NOT_FOUND" };
    if (!canChangeVehicleStatus(vehicle.status, to)) return { ok: false, code: "INVALID_TRANSITION" };

    if (isTakingOutOfCirculation(to)) {
      const active = await tx.booking.count({ where: { vehicleId, status: "ACTIVE" } });
      if (active > 0) return { ok: false, code: "VEHICLE_RENTED" };
    }
    // Reactivating a retired vehicle only makes sense while its owner is still allowed to list vehicles.
    if (vehicle.status === "RETIRED" && vehicle.ownerId && !canListVehicles(vehicle.owner!.role)) return { ok: false, code: "OWNER_CANNOT_LIST" };

    const updated = await tx.vehicle.updateMany({ where: { id: vehicleId, status: vehicle.status }, data: { status: to } });
    if (updated.count !== 1) return { ok: false, code: "CONFLICT_STATE" };

    const [upcomingBookings, records] = await Promise.all([
      tx.booking.count({ where: { vehicleId, status: { in: ["PENDING", "CONFIRMED"] }, endAt: { gt: now } } }),
      tx.maintenance.findMany({ where: { vehicleId }, select: { type: true, performedAt: true, nextDueAt: true } }),
    ]);
    return { ok: true, from: vehicle.status, to, warnings: { upcomingBookings, documents: documentWarnings(records, now) } };
  });
}

export type ModerationResult = { ok: true } | { ok: false; code: "FORBIDDEN" | "NOT_FOUND" };

// Listing moderation: only an ADMIN approves or rejects an announcement.
export async function moderateListing(actorId: string, vehicleId: string, decision: Extract<ListingStatus, "APPROVED" | "REJECTED">): Promise<ModerationResult> {
  return runTransaction(async (tx): Promise<ModerationResult> => {
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
    if (actor?.role !== "ADMIN") return { ok: false, code: "FORBIDDEN" };
    await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${vehicleId} FOR UPDATE`;
    const updated = await tx.vehicle.updateMany({ where: { id: vehicleId }, data: { listingStatus: decision } });
    return updated.count === 1 ? { ok: true } : { ok: false, code: "NOT_FOUND" };
  });
}

export type PlatformVehicleInput = {
  name: string;
  type: VehicleType;
  plate: string;
  hourlyRate: number;
  dailyRate: number;
  weekendRate?: number | null;
  description?: string | null;
  locationId?: string | null;
  year?: number | null;
  engineCc?: number | null;
  powerHp?: number | null;
  seats?: number | null;
  licenseCategory?: string | null;
};

// A vehicle of the platform's own fleet: no owner (0% commission), approved from the start. Only an ADMIN creates them.
export async function createPlatformVehicle(actorId: string, input: PlatformVehicleInput): Promise<{ ok: true; id: string } | { ok: false; code: "FORBIDDEN" }> {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } });
  if (actor?.role !== "ADMIN") return { ok: false, code: "FORBIDDEN" };
  const vehicle = await prisma.vehicle.create({ data: { ...input, ownerId: null, listingStatus: "APPROVED" }, select: { id: true } });
  return { ok: true, id: vehicle.id };
}

export type VehicleEdit = {
  name: string;
  description: string | null;
  hourlyRate: number;
  dailyRate: number;
  weekendRate: number | null;
  locationId: string | null;
  year?: number | null;
  engineCc?: number | null;
  powerHp?: number | null;
  seats?: number | null;
  licenseCategory?: string | null;
};

export type UpdateVehicleResult = { ok: true; backToModeration: boolean } | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" };

// An owner or company edits its own vehicle; an ADMIN edits any. Type and plate never change. Prices only affect
// bookings made afterwards (every booking stores its own price). A change of the public text (name, description)
// by a non-admin sends an approved listing back to moderation, so approval cannot be bypassed by editing afterwards.
export async function updateVehicleDetails(actorId: string, vehicleId: string, edit: VehicleEdit): Promise<UpdateVehicleResult> {
  return runTransaction(async (tx): Promise<UpdateVehicleResult> => {
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    if (!actor) return { ok: false, code: "NOT_FOUND" };
    await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${vehicleId} FOR UPDATE`;
    const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId }, select: { ownerId: true, name: true, description: true, listingStatus: true } });
    if (!vehicle) return { ok: false, code: "NOT_FOUND" };
    const isAdmin = actor.role === "ADMIN";
    if (!isAdmin) {
      if (vehicle.ownerId !== actor.id) return { ok: false, code: "NOT_FOUND" }; // other people's vehicles do not exist
      if (!canListVehicles(actor.role)) return { ok: false, code: "FORBIDDEN" };
    }
    const textChanged = edit.name !== vehicle.name || (edit.description ?? null) !== (vehicle.description ?? null);
    const backToModeration = !isAdmin && textChanged && vehicle.listingStatus === "APPROVED";
    await tx.vehicle.update({
      where: { id: vehicleId },
      data: { ...edit, ...(backToModeration ? { listingStatus: "PENDING" as const } : {}) },
    });
    return { ok: true, backToModeration };
  });
}

export type AdminVehicleRow = Prisma.VehicleGetPayload<{
  include: { owner: { select: { id: true; name: true; email: true; role: true } }; location: true; maintenance: { select: { type: true; performedAt: true; nextDueAt: true } } };
}> & { hasActiveBooking: boolean; upcomingBookings: number };

export async function listVehiclesForAdmin(now: Date = new Date()): Promise<AdminVehicleRow[]> {
  const [vehicles, active, upcoming] = await Promise.all([
    prisma.vehicle.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: { owner: { select: { id: true, name: true, email: true, role: true } }, location: true, maintenance: { select: { type: true, performedAt: true, nextDueAt: true } } },
    }),
    prisma.booking.groupBy({ by: ["vehicleId"], where: { status: "ACTIVE" }, _count: true }),
    prisma.booking.groupBy({ by: ["vehicleId"], where: { status: { in: ["PENDING", "CONFIRMED"] }, endAt: { gt: now } }, _count: true }),
  ]);
  const activeSet = new Set(active.map((a) => a.vehicleId));
  const upcomingMap = new Map(upcoming.map((u) => [u.vehicleId, u._count]));
  return vehicles.map((v) => ({ ...v, hasActiveBooking: activeSet.has(v.id), upcomingBookings: upcomingMap.get(v.id) ?? 0 }));
}

// An owner whose listing was rejected fixes it and asks for a new review.
export async function resubmitListing(actorId: string, vehicleId: string): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "NOT_REJECTED" }> {
  const access = await authorizeVehicleManager(actorId, vehicleId);
  if (!access.ok) return access;
  const updated = await prisma.vehicle.updateMany({ where: { id: vehicleId, listingStatus: "REJECTED" }, data: { listingStatus: "PENDING" } });
  return updated.count === 1 ? { ok: true } : { ok: false, code: "NOT_REJECTED" };
}
