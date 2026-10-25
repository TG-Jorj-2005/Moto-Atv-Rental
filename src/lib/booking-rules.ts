import type { BookingStatus, ListingStatus, Role, VehicleStatus } from "@prisma/client";
import { canRent } from "@/lib/roles";

// Pure rules of the booking lifecycle (no database, no clock of its own: `now` is always passed in).
//
//   PENDING   -> CONFIRMED | CANCELLED
//   CONFIRMED -> ACTIVE (handover) | CANCELLED
//   ACTIVE    -> COMPLETED | CANCELLED
//   COMPLETED, CANCELLED: final
//
// Nothing here moves a booking because of the time alone: every transition is an explicit action of an authorized
// person. Time only decides whether an action is allowed.

export const HOUR_MS = 60 * 60 * 1000;
export const HANDOVER_OPENS_BEFORE_START_MS = HOUR_MS; // handover may be recorded from 1 hour before startAt
export const HANDOVER_DELAY_LIMIT_MS = HOUR_MS; // more than 1 hour after startAt without handover = delayed
export const MAX_PENDING_PER_USER = 3;
export const MAX_REASON_LENGTH = 500;

const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function nextStatuses(from: BookingStatus): readonly BookingStatus[] {
  return TRANSITIONS[from];
}

export type VehicleFacts = { status: VehicleStatus; listingStatus: ListingStatus };

// A vehicle can be booked, confirmed and handed over only if it is approved and neither in service nor retired.
// ("RENTED" is never stored: it is derived from an ACTIVE booking.)
export function isVehicleBookable(v: VehicleFacts): boolean {
  return v.listingStatus === "APPROVED" && v.status !== "IN_SERVICE" && v.status !== "RETIRED";
}

export type TransitionDenial =
  | "INVALID_TRANSITION"
  | "FORBIDDEN"
  | "ALREADY_STARTED"
  | "REASON_REQUIRED"
  | "TOO_EARLY"
  | "PAST_END"
  | "VEHICLE_NOT_BOOKABLE"
  | "VEHICLE_BUSY"
  | "OVERLAP";

export type TransitionContext = {
  from: BookingStatus;
  to: BookingStatus;
  actor: { id: string; role: Role };
  bookingUserId: string | null; // the account the booking belongs to
  startAt: Date;
  endAt: Date;
  now: Date;
  reason?: string | null;
  vehicle: VehicleFacts;
  otherActiveOnVehicle: boolean; // another booking of the same vehicle is ACTIVE
  overlappingOnVehicle: boolean; // another non-cancelled booking overlaps this one
};

export function cleanReason(reason: string | null | undefined): string | null {
  const text = reason?.trim();
  return text ? text.slice(0, MAX_REASON_LENGTH) : null;
}

// Handover happened more than 1 hour after the start: a reason is then required.
export function isHandoverLate(startAt: Date, now: Date): boolean {
  return now.getTime() > startAt.getTime() + HANDOVER_DELAY_LIMIT_MS;
}

export function evaluateTransition(c: TransitionContext): { ok: true } | { ok: false; code: TransitionDenial } {
  const deny = (code: TransitionDenial) => ({ ok: false as const, code });
  if (!TRANSITIONS[c.from].includes(c.to)) return deny("INVALID_TRANSITION");

  const isAdmin = c.actor.role === "ADMIN";
  if (!isAdmin) {
    // The only thing a non-admin may do is cancel their own booking before it starts.
    const ownBookingCancel = c.to === "CANCELLED" && (c.from === "PENDING" || c.from === "CONFIRMED") && canRent(c.actor.role) && c.bookingUserId === c.actor.id;
    if (!ownBookingCancel) return deny("FORBIDDEN");
    if (c.now.getTime() >= c.startAt.getTime()) return deny("ALREADY_STARTED");
    return { ok: true };
  }

  const reason = cleanReason(c.reason);
  if (c.to === "CANCELLED" && !reason) return deny("REASON_REQUIRED");

  if (c.from === "PENDING" && c.to === "CONFIRMED") {
    if (!isVehicleBookable(c.vehicle)) return deny("VEHICLE_NOT_BOOKABLE");
    if (c.now.getTime() >= c.endAt.getTime()) return deny("PAST_END");
    if (c.overlappingOnVehicle) return deny("OVERLAP");
  }

  if (c.from === "CONFIRMED" && c.to === "ACTIVE") {
    if (c.now.getTime() < c.startAt.getTime() - HANDOVER_OPENS_BEFORE_START_MS) return deny("TOO_EARLY");
    if (c.now.getTime() >= c.endAt.getTime()) return deny("PAST_END");
    if (!isVehicleBookable(c.vehicle)) return deny("VEHICLE_NOT_BOOKABLE");
    if (c.otherActiveOnVehicle) return deny("VEHICLE_BUSY");
    if (isHandoverLate(c.startAt, c.now) && !reason) return deny("REASON_REQUIRED");
  }
  return { ok: true };
}

export type BookingFlags = { handoverDelayed: boolean; returnOverdue: boolean };

// Indicators computed on read; they are never stored and never change a status.
export function bookingFlags(b: { status: BookingStatus; startAt: Date; endAt: Date }, now: Date): BookingFlags {
  return {
    handoverDelayed: b.status === "CONFIRMED" && isHandoverLate(b.startAt, now),
    returnOverdue: b.status === "ACTIVE" && now.getTime() > b.endAt.getTime(),
  };
}

// Transitions an admin can offer for a booking in this state (the server re-checks every one of them).
export function adminActions(from: BookingStatus): readonly BookingStatus[] {
  return TRANSITIONS[from];
}

// A customer can offer "cancel" only for their own, not yet started booking.
export function customerCanCancel(b: { status: BookingStatus; startAt: Date }, now: Date): boolean {
  return (b.status === "PENDING" || b.status === "CONFIRMED") && now.getTime() < b.startAt.getTime();
}

export const DENIAL_MESSAGES: Record<TransitionDenial | "NOT_FOUND" | "CONFLICT_STATE", string> = {
  INVALID_TRANSITION: "This status change is not allowed from the current status.",
  FORBIDDEN: "You are not allowed to do this.",
  ALREADY_STARTED: "The booking has already started, so only an administrator can cancel it.",
  REASON_REQUIRED: "A reason is required for this action.",
  TOO_EARLY: "The handover can be recorded starting 1 hour before the start time.",
  PAST_END: "The booking period has already ended.",
  VEHICLE_NOT_BOOKABLE: "The vehicle is not available (in service, retired or not approved).",
  VEHICLE_BUSY: "Another booking of this vehicle is still ACTIVE: complete or cancel it first.",
  OVERLAP: "Another booking overlaps this period for the same vehicle.",
  NOT_FOUND: "Booking not found.",
  CONFLICT_STATE: "The booking was changed by someone else in the meantime. Reload and try again.",
};
