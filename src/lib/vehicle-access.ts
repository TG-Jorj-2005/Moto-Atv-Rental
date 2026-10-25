import type { ListingStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canListVehicles } from "@/lib/roles";

// Who may manage a vehicle (edit it, its photos and its maintenance records): an ADMIN for every vehicle, an OWNER or
// RENTAL_COMPANY only for the vehicles it owns. For anyone else the vehicle does not exist. The role is always
// read from the database.
export type VehicleAccess =
  | { ok: true; actor: { id: string; role: Role }; vehicle: { id: string; ownerId: string | null; listingStatus: ListingStatus } }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" };

export async function authorizeVehicleManager(actorId: string, vehicleId: string): Promise<VehicleAccess> {
  const [actor, vehicle] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } }),
    prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true, ownerId: true, listingStatus: true } }),
  ]);
  if (!actor || !vehicle) return { ok: false, code: "NOT_FOUND" };
  if (actor.role === "ADMIN") return { ok: true, actor, vehicle };
  if (vehicle.ownerId !== actor.id) return { ok: false, code: "NOT_FOUND" };
  if (!canListVehicles(actor.role)) return { ok: false, code: "FORBIDDEN" };
  return { ok: true, actor, vehicle };
}
