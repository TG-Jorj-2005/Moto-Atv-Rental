import type { VehicleStatus } from "@prisma/client";

// Pure rules for the administrative status of a vehicle.
//
//   AVAILABLE <-> IN_SERVICE        (leaving the service is always an explicit action of an ADMIN)
//   AVAILABLE  -> RETIRED
//   IN_SERVICE -> RETIRED
//   RETIRED    -> IN_SERVICE        (never straight back to AVAILABLE: a reactivated vehicle goes through service)
//
// `RENTED` is NOT part of the stored statuses: it is derived (see displayStatus). The enum value still exists in the
// database for compatibility, but nothing writes it, and no transition leads to it or away from it.
const TRANSITIONS: Partial<Record<VehicleStatus, readonly VehicleStatus[]>> = {
  AVAILABLE: ["IN_SERVICE", "RETIRED"],
  IN_SERVICE: ["AVAILABLE", "RETIRED"],
  RETIRED: ["IN_SERVICE"],
};

export function nextVehicleStatuses(from: VehicleStatus): readonly VehicleStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function canChangeVehicleStatus(from: VehicleStatus, to: VehicleStatus): boolean {
  return nextVehicleStatuses(from).includes(to);
}

// Going out of circulation (service or retirement) is refused while the vehicle is out with a customer.
export const isTakingOutOfCirculation = (to: VehicleStatus) => to === "IN_SERVICE" || to === "RETIRED";

export type DisplayStatus = "AVAILABLE" | "RENTED" | "IN_SERVICE" | "RETIRED";

// What the interface shows. RENTED = one of its bookings is ACTIVE (the handover was recorded by an ADMIN).
// Future bookings never make a vehicle look rented, and a booking that ends or is cancelled never changes the stored
// status: an IN_SERVICE or RETIRED vehicle stays so until an ADMIN says otherwise.
export function displayStatus(stored: VehicleStatus, hasActiveBooking: boolean): DisplayStatus {
  if (stored === "RETIRED") return "RETIRED";
  if (stored === "IN_SERVICE") return "IN_SERVICE";
  return hasActiveBooking ? "RENTED" : "AVAILABLE";
}

export const VEHICLE_DENIAL_MESSAGES = {
  FORBIDDEN: "Only an administrator can change the status of a vehicle.",
  NOT_FOUND: "Vehicle not found.",
  INVALID_TRANSITION: "This status change is not allowed. A retired vehicle must go through IN_SERVICE before it can become AVAILABLE again.",
  VEHICLE_RENTED: "The vehicle is currently out with a customer (an ACTIVE booking). Complete or cancel that booking first.",
  OWNER_CANNOT_LIST: "The owner of this vehicle no longer has a role that can list vehicles, so it cannot be reactivated.",
  CONFLICT_STATE: "The vehicle was changed by someone else in the meantime. Reload and try again.",
} as const;
export type VehicleDenial = keyof typeof VEHICLE_DENIAL_MESSAGES;
