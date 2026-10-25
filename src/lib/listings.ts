import type { Prisma } from "@prisma/client";
import { runTransaction } from "@/lib/tx";
import { canListVehicles } from "@/lib/roles";
import type { Role } from "@prisma/client";
import { categoryFitsType } from "@/lib/vehicle-categories";

export class ListingForbiddenError extends Error {}
export class ListingCategoryError extends Error {}

// New listings always start PENDING and become visible only after admin approval.
export type NewListing = Omit<Prisma.VehicleUncheckedCreateInput, "ownerId" | "listingStatus" | "status">;

// Locks the owner's row and re-checks the role inside the transaction, so a concurrent demotion
// (which locks the same row) cannot leave a vehicle created by someone who is no longer allowed to list.
export async function createListing(userId: string, data: NewListing) {
  if (data.category && !categoryFitsType(data.category, data.type)) throw new ListingCategoryError();
  return runTransaction(async (tx) => {
    const rows = await tx.$queryRaw<{ role: Role }[]>`SELECT role::text AS role FROM users WHERE id = ${userId} FOR UPDATE`;
    const role = rows[0]?.role;
    if (!role || !canListVehicles(role)) throw new ListingForbiddenError();
    return tx.vehicle.create({ data: { ...data, ownerId: userId, listingStatus: "PENDING" } });
  });
}
