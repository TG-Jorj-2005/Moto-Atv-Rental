import type { MaintenanceType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { authorizeVehicleManager } from "@/lib/vehicle-access";

// Maintenance records (service, ITP, RCA, other) of a vehicle. An ADMIN manages every vehicle; an owner or company
// only its own (anyone else gets "not found"). A record never changes the vehicle's status or any booking.

export type MaintenanceInput = { type: MaintenanceType; performedAt: Date; nextDueAt: Date | null; notes: string | null };
export type MaintenanceResult = { ok: true; id: string } | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "INVALID" };

async function authorize(actorId: string, vehicleId: string): Promise<"ok" | "NOT_FOUND" | "FORBIDDEN"> {
  const access = await authorizeVehicleManager(actorId, vehicleId);
  return access.ok ? "ok" : access.code;
}

export async function recordMaintenance(actorId: string, vehicleId: string, input: MaintenanceInput): Promise<MaintenanceResult> {
  const auth = await authorize(actorId, vehicleId);
  if (auth !== "ok") return { ok: false, code: auth };
  if (input.nextDueAt && input.nextDueAt.getTime() <= input.performedAt.getTime()) return { ok: false, code: "INVALID" };
  const record = await prisma.maintenance.create({ data: { vehicleId, ...input }, select: { id: true } });
  return { ok: true, id: record.id };
}

export async function deleteMaintenance(actorId: string, recordId: string): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" }> {
  const record = await prisma.maintenance.findUnique({ where: { id: recordId }, select: { vehicleId: true } });
  if (!record) return { ok: false, code: "NOT_FOUND" };
  const auth = await authorize(actorId, record.vehicleId);
  if (auth !== "ok") return { ok: false, code: auth };
  await prisma.maintenance.delete({ where: { id: recordId } });
  return { ok: true };
}

export async function listMaintenance(actorId: string, vehicleId: string) {
  const auth = await authorize(actorId, vehicleId);
  if (auth !== "ok") return null;
  return prisma.maintenance.findMany({ where: { vehicleId }, orderBy: [{ performedAt: "desc" }, { id: "desc" }] });
}
