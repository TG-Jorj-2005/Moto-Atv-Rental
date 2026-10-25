import { describe, expect, it } from "vitest";
import type { BookingStatus, Role } from "@prisma/client";
import {
  adminActions,
  bookingFlags,
  cleanReason,
  customerCanCancel,
  evaluateTransition,
  isHandoverLate,
  isVehicleBookable,
  nextStatuses,
  type TransitionContext,
} from "./booking-rules";

const STATUSES: BookingStatus[] = ["PENDING", "CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED"];
const START = new Date("2030-06-10T09:00:00Z");
const END = new Date("2030-06-11T09:00:00Z");
const H = 3600_000;

const ctx = (over: Partial<TransitionContext> & Pick<TransitionContext, "from" | "to">): TransitionContext => ({
  actor: { id: "admin", role: "ADMIN" },
  bookingUserId: "cust",
  startAt: START,
  endAt: END,
  now: new Date(START.getTime() - 5 * 24 * H),
  reason: null,
  vehicle: { status: "AVAILABLE", listingStatus: "APPROVED" },
  otherActiveOnVehicle: false,
  overlappingOnVehicle: false,
  ...over,
});

describe("the status graph", () => {
  it("allows exactly the approved transitions", () => {
    expect(Object.fromEntries(STATUSES.map((s) => [s, nextStatuses(s)]))).toEqual({
      PENDING: ["CONFIRMED", "CANCELLED"],
      CONFIRMED: ["ACTIVE", "CANCELLED"],
      ACTIVE: ["COMPLETED", "CANCELLED"],
      COMPLETED: [],
      CANCELLED: [],
    });
    expect(adminActions("CONFIRMED")).not.toContain("COMPLETED"); // CONFIRMED -> COMPLETED was removed
  });
  it("rejects every transition that is not in the graph, for every actor", () => {
    const roles: Role[] = ["ADMIN", "CUSTOMER", "OWNER", "RENTAL_COMPANY"];
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if (nextStatuses(from).includes(to)) continue;
        for (const role of roles) {
          const r = evaluateTransition(ctx({ from, to, actor: { id: role === "ADMIN" ? "admin" : "cust", role } }));
          expect(r, `${role} ${from}->${to}`).toEqual({ ok: false, code: "INVALID_TRANSITION" });
        }
      }
    }
  });
  it("never leaves a final status", () => {
    for (const to of STATUSES) {
      expect(evaluateTransition(ctx({ from: "COMPLETED", to })).ok).toBe(false);
      expect(evaluateTransition(ctx({ from: "CANCELLED", to })).ok).toBe(false);
    }
  });
});

describe("who may do what", () => {
  it("lets a customer-type account cancel only its own booking, before the start", () => {
    for (const role of ["CUSTOMER", "OWNER", "RENTAL_COMPANY"] as const) {
      for (const from of ["PENDING", "CONFIRMED"] as const) {
        const own = ctx({ from, to: "CANCELLED", actor: { id: "cust", role } });
        expect(evaluateTransition(own)).toEqual({ ok: true });
        expect(evaluateTransition({ ...own, actor: { id: "someone-else", role } })).toEqual({ ok: false, code: "FORBIDDEN" });
        expect(evaluateTransition({ ...own, bookingUserId: null })).toEqual({ ok: false, code: "FORBIDDEN" });
      }
    }
  });
  it("refuses a customer cancelling at or after the start, and an ACTIVE booking", () => {
    const base = ctx({ from: "CONFIRMED", to: "CANCELLED", actor: { id: "cust", role: "CUSTOMER" } });
    expect(evaluateTransition({ ...base, now: new Date(START.getTime() - 1) })).toEqual({ ok: true });
    expect(evaluateTransition({ ...base, now: START })).toEqual({ ok: false, code: "ALREADY_STARTED" });
    expect(evaluateTransition({ ...base, now: new Date(START.getTime() + H) })).toEqual({ ok: false, code: "ALREADY_STARTED" });
    expect(evaluateTransition({ ...base, from: "ACTIVE" })).toEqual({ ok: false, code: "FORBIDDEN" });
  });
  it("refuses every other action for non-admins", () => {
    for (const role of ["CUSTOMER", "OWNER", "RENTAL_COMPANY"] as const) {
      const actor = { id: "cust", role };
      expect(evaluateTransition(ctx({ from: "PENDING", to: "CONFIRMED", actor }))).toEqual({ ok: false, code: "FORBIDDEN" });
      expect(evaluateTransition(ctx({ from: "CONFIRMED", to: "ACTIVE", actor }))).toEqual({ ok: false, code: "FORBIDDEN" });
      expect(evaluateTransition(ctx({ from: "ACTIVE", to: "COMPLETED", actor }))).toEqual({ ok: false, code: "FORBIDDEN" });
    }
  });
  it("lets an admin do the whole lifecycle", () => {
    const at = new Date(START.getTime() + 10 * 60_000);
    expect(evaluateTransition(ctx({ from: "PENDING", to: "CONFIRMED" })).ok).toBe(true);
    expect(evaluateTransition(ctx({ from: "CONFIRMED", to: "ACTIVE", now: at })).ok).toBe(true);
    expect(evaluateTransition(ctx({ from: "ACTIVE", to: "COMPLETED", now: at })).ok).toBe(true);
  });
});

describe("reasons", () => {
  it("are required for every admin cancellation, including after the start and of an ACTIVE booking", () => {
    for (const from of ["PENDING", "CONFIRMED", "ACTIVE"] as const) {
      expect(evaluateTransition(ctx({ from, to: "CANCELLED" }))).toEqual({ ok: false, code: "REASON_REQUIRED" });
      expect(evaluateTransition(ctx({ from, to: "CANCELLED", reason: "   " }))).toEqual({ ok: false, code: "REASON_REQUIRED" });
      expect(evaluateTransition(ctx({ from, to: "CANCELLED", reason: "Entered by mistake" })).ok).toBe(true);
    }
  });
  it("are optional when the customer cancels", () => {
    expect(evaluateTransition(ctx({ from: "PENDING", to: "CANCELLED", actor: { id: "cust", role: "CUSTOMER" } })).ok).toBe(true);
  });
  it("are trimmed and capped", () => {
    expect(cleanReason("  hello ")).toBe("hello");
    expect(cleanReason("   ")).toBeNull();
    expect(cleanReason(null)).toBeNull();
    expect(cleanReason("x".repeat(900))).toHaveLength(500);
  });
});

describe("handover window (CONFIRMED -> ACTIVE)", () => {
  const handover = (now: Date, extra: Partial<TransitionContext> = {}) => evaluateTransition(ctx({ from: "CONFIRMED", to: "ACTIVE", now, ...extra }));
  it("opens exactly 1 hour before the start", () => {
    expect(handover(new Date(START.getTime() - H - 1))).toEqual({ ok: false, code: "TOO_EARLY" });
    expect(handover(new Date(START.getTime() - H))).toEqual({ ok: true });
  });
  it("needs no reason up to and including 1 hour after the start", () => {
    expect(handover(START)).toEqual({ ok: true });
    expect(handover(new Date(START.getTime() + H))).toEqual({ ok: true });
  });
  it("needs a reason from 1 hour and 1 millisecond after the start", () => {
    const late = new Date(START.getTime() + H + 1);
    expect(handover(late)).toEqual({ ok: false, code: "REASON_REQUIRED" });
    expect(handover(late, { reason: "Customer arrived late" })).toEqual({ ok: true });
  });
  it("is refused at or after the end", () => {
    expect(handover(new Date(END.getTime() - 1), { reason: "very late" })).toEqual({ ok: true });
    expect(handover(END, { reason: "very late" })).toEqual({ ok: false, code: "PAST_END" });
  });
  it("is refused when the vehicle cannot be handed over or is still out with someone else", () => {
    expect(handover(START, { vehicle: { status: "IN_SERVICE", listingStatus: "APPROVED" } })).toEqual({ ok: false, code: "VEHICLE_NOT_BOOKABLE" });
    expect(handover(START, { vehicle: { status: "RETIRED", listingStatus: "APPROVED" } })).toEqual({ ok: false, code: "VEHICLE_NOT_BOOKABLE" });
    expect(handover(START, { vehicle: { status: "AVAILABLE", listingStatus: "PENDING" } })).toEqual({ ok: false, code: "VEHICLE_NOT_BOOKABLE" });
    expect(handover(START, { otherActiveOnVehicle: true })).toEqual({ ok: false, code: "VEHICLE_BUSY" });
  });
});

describe("confirmation (PENDING -> CONFIRMED)", () => {
  it("is refused for an unavailable vehicle, an overlap or a period that already ended", () => {
    expect(evaluateTransition(ctx({ from: "PENDING", to: "CONFIRMED", vehicle: { status: "IN_SERVICE", listingStatus: "APPROVED" } }))).toEqual({ ok: false, code: "VEHICLE_NOT_BOOKABLE" });
    expect(evaluateTransition(ctx({ from: "PENDING", to: "CONFIRMED", overlappingOnVehicle: true }))).toEqual({ ok: false, code: "OVERLAP" });
    expect(evaluateTransition(ctx({ from: "PENDING", to: "CONFIRMED", now: END }))).toEqual({ ok: false, code: "PAST_END" });
  });
});

describe("completion", () => {
  it("is allowed at any time after the handover", () => {
    expect(evaluateTransition(ctx({ from: "ACTIVE", to: "COMPLETED", now: new Date(START.getTime() + 5 * 24 * H) })).ok).toBe(true); // overdue return
    expect(evaluateTransition(ctx({ from: "ACTIVE", to: "COMPLETED", now: new Date(START.getTime() + H) })).ok).toBe(true); // early return
  });
});

describe("derived indicators", () => {
  const booking = (status: BookingStatus) => ({ status, startAt: START, endAt: END });
  it("flags a delayed handover only for CONFIRMED bookings more than 1 hour after the start", () => {
    expect(bookingFlags(booking("CONFIRMED"), new Date(START.getTime() + H)).handoverDelayed).toBe(false);
    expect(bookingFlags(booking("CONFIRMED"), new Date(START.getTime() + H + 1)).handoverDelayed).toBe(true);
    expect(bookingFlags(booking("PENDING"), new Date(START.getTime() + 9 * H)).handoverDelayed).toBe(false);
    expect(bookingFlags(booking("ACTIVE"), new Date(START.getTime() + 9 * H)).handoverDelayed).toBe(false);
  });
  it("flags an overdue return only for ACTIVE bookings past the end", () => {
    expect(bookingFlags(booking("ACTIVE"), END).returnOverdue).toBe(false);
    expect(bookingFlags(booking("ACTIVE"), new Date(END.getTime() + 1)).returnOverdue).toBe(true);
    expect(bookingFlags(booking("COMPLETED"), new Date(END.getTime() + 1)).returnOverdue).toBe(false);
  });
  it("tells when a customer may still cancel", () => {
    expect(customerCanCancel(booking("CONFIRMED"), new Date(START.getTime() - 1))).toBe(true);
    expect(customerCanCancel(booking("CONFIRMED"), START)).toBe(false);
    expect(customerCanCancel(booking("ACTIVE"), new Date(START.getTime() - 1))).toBe(false);
    expect(isHandoverLate(START, new Date(START.getTime() + H))).toBe(false);
  });
});

describe("vehicle availability facts", () => {
  it("needs an approved listing that is neither in service nor retired", () => {
    expect(isVehicleBookable({ status: "AVAILABLE", listingStatus: "APPROVED" })).toBe(true);
    expect(isVehicleBookable({ status: "RENTED", listingStatus: "APPROVED" })).toBe(true);
    for (const status of ["IN_SERVICE", "RETIRED"] as const) expect(isVehicleBookable({ status, listingStatus: "APPROVED" })).toBe(false);
    for (const listingStatus of ["PENDING", "REJECTED"] as const) expect(isVehicleBookable({ status: "AVAILABLE", listingStatus })).toBe(false);
  });
});
