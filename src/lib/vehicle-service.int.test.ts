import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createBooking, transitionBooking } from "@/lib/booking-service";
import { changeUserRole } from "@/lib/users";
import { changeVehicleStatus, createPlatformVehicle, listVehiclesForAdmin, moderateListing, resubmitListing, updateVehicleDetails } from "@/lib/vehicle-service";
import { recordMaintenance } from "@/lib/maintenance-service";
import { makeUser, makeVehicle, resetDatabase } from "@/test-support/db";

beforeEach(resetDatabase);

const NOW = new Date("2030-06-01T00:00:00Z");
const START = new Date("2030-06-10T09:00:00Z");
const DAY = 24 * 3600_000;

async function bookingOn(customer: { id: string; email: string }, vehicleId: string, offsetDays = 0) {
  const r = await createBooking(customer.id, { vehicleId, startAt: new Date(START.getTime() + offsetDays * DAY), endAt: new Date(START.getTime() + (offsetDays + 1) * DAY), customer: { fullName: "T", email: customer.email, phone: "0700000000" } }, NOW);
  if (!r.ok) throw new Error(r.code);
  return r.booking;
}

describe("changeVehicleStatus", () => {
  it("is an administrator-only action, read from the database", async () => {
    const vehicle = await makeVehicle(null);
    for (const role of ["CUSTOMER", "OWNER", "RENTAL_COMPANY"] as const) {
      const user = await makeUser(role);
      expect(await changeVehicleStatus(user.id, vehicle.id, "IN_SERVICE")).toEqual({ ok: false, code: "FORBIDDEN" });
    }
    expect(await changeVehicleStatus("ghost", vehicle.id, "IN_SERVICE")).toEqual({ ok: false, code: "FORBIDDEN" });
    const admin = await makeUser("ADMIN");
    expect(await changeVehicleStatus(admin.id, "no-such-vehicle", "IN_SERVICE")).toEqual({ ok: false, code: "NOT_FOUND" });
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).status).toBe("AVAILABLE");
  });
  it("follows the approved transitions and never goes from RETIRED straight to AVAILABLE", async () => {
    const admin = await makeUser("ADMIN");
    const vehicle = await makeVehicle(null);
    const go = async (to: Parameters<typeof changeVehicleStatus>[2]) => (await changeVehicleStatus(admin.id, vehicle.id, to)).ok;
    expect(await go("AVAILABLE")).toBe(false); // same status
    expect(await go("RENTED")).toBe(false); // derived, never stored
    expect(await go("IN_SERVICE")).toBe(true);
    expect(await go("AVAILABLE")).toBe(true); // leaving the service is an explicit admin action
    expect(await go("RETIRED")).toBe(true);
    expect(await changeVehicleStatus(admin.id, vehicle.id, "AVAILABLE")).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(await go("IN_SERVICE")).toBe(true); // reactivation goes through the service
    expect(await go("AVAILABLE")).toBe(true);
  });
  it("refuses to take a vehicle out of circulation while it is out with a customer", async () => {
    const [admin, customer] = [await makeUser("ADMIN"), await makeUser("CUSTOMER")];
    const vehicle = await makeVehicle(null);
    const booking = await bookingOn(customer, vehicle.id);
    await transitionBooking(admin.id, booking.id, "CONFIRMED", { now: NOW });
    await transitionBooking(admin.id, booking.id, "ACTIVE", { now: START });
    for (const to of ["IN_SERVICE", "RETIRED"] as const) expect(await changeVehicleStatus(admin.id, vehicle.id, to)).toEqual({ ok: false, code: "VEHICLE_RENTED" });
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).status).toBe("AVAILABLE");
    await transitionBooking(admin.id, booking.id, "COMPLETED", { now: new Date(START.getTime() + DAY) });
    expect((await changeVehicleStatus(admin.id, vehicle.id, "IN_SERVICE")).ok).toBe(true);
  });
  it("warns about upcoming bookings and documents, and cancels or changes nothing", async () => {
    const [admin, customer] = [await makeUser("ADMIN"), await makeUser("CUSTOMER")];
    const vehicle = await makeVehicle(null);
    const pending = await bookingOn(customer, vehicle.id, 0);
    const confirmed = await bookingOn(customer, vehicle.id, 1);
    await transitionBooking(admin.id, confirmed.id, "CONFIRMED", { now: NOW });
    const result = await changeVehicleStatus(admin.id, vehicle.id, "RETIRED", NOW);
    expect(result).toMatchObject({ ok: true, from: "AVAILABLE", to: "RETIRED", warnings: { upcomingBookings: 2 } });
    if (result.ok) expect(result.warnings.documents.map((d) => [d.type, d.state])).toEqual([["ITP", "NO_RECORD"], ["RCA", "NO_RECORD"]]);
    const after = await prisma.booking.findMany({ where: { id: { in: [pending.id, confirmed.id] } }, orderBy: { startAt: "asc" } });
    expect(after.map((b) => b.status)).toEqual(["PENDING", "CONFIRMED"]); // explicit handling by the admin, never automatic
  });
  it("reports overdue documents from the maintenance records when the vehicle comes back from service", async () => {
    const admin = await makeUser("ADMIN");
    const vehicle = await makeVehicle(null);
    await recordMaintenance(admin.id, vehicle.id, { type: "ITP", performedAt: new Date("2027-01-01T00:00:00Z"), nextDueAt: new Date("2028-01-01T00:00:00Z"), notes: null });
    await recordMaintenance(admin.id, vehicle.id, { type: "RCA", performedAt: new Date("2029-01-01T00:00:00Z"), nextDueAt: new Date("2031-01-01T00:00:00Z"), notes: null });
    await changeVehicleStatus(admin.id, vehicle.id, "IN_SERVICE", NOW);
    const back = await changeVehicleStatus(admin.id, vehicle.id, "AVAILABLE", new Date("2029-06-01T00:00:00Z"));
    expect(back.ok && back.warnings.documents.map((d) => [d.type, d.state])).toEqual([["ITP", "OVERDUE"]]);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).status).toBe("AVAILABLE"); // a warning never blocks
  });
});

describe("a vehicle that is IN_SERVICE or RETIRED", () => {
  it("cannot be booked, confirmed or handed over, and a booking ending never revives it", async () => {
    const [admin, customer, other] = [await makeUser("ADMIN"), await makeUser("CUSTOMER"), await makeUser("CUSTOMER")];
    const vehicle = await makeVehicle(null);
    const first = await bookingOn(customer, vehicle.id, 0);
    const second = await bookingOn(customer, vehicle.id, 1);
    await transitionBooking(admin.id, second.id, "CONFIRMED", { now: NOW });
    await changeVehicleStatus(admin.id, vehicle.id, "IN_SERVICE");
    const r = await createBooking(other.id, { vehicleId: vehicle.id, startAt: new Date(START.getTime() + 5 * DAY), endAt: new Date(START.getTime() + 6 * DAY), customer: { fullName: "T", email: other.email, phone: "0700000000" } }, NOW);
    expect(r).toEqual({ ok: false, code: "VEHICLE_UNAVAILABLE" });
    expect(await transitionBooking(admin.id, first.id, "CONFIRMED", { now: NOW })).toEqual({ ok: false, code: "VEHICLE_NOT_BOOKABLE" });
    expect(await transitionBooking(admin.id, second.id, "ACTIVE", { now: new Date(second.startAt.getTime()) })).toEqual({ ok: false, code: "VEHICLE_NOT_BOOKABLE" });
    // Cancelling the remaining bookings (explicit actions) does not make the vehicle available again.
    await transitionBooking(admin.id, first.id, "CANCELLED", { reason: "vehicle in service", now: NOW });
    await transitionBooking(admin.id, second.id, "CANCELLED", { reason: "vehicle in service", now: NOW });
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).status).toBe("IN_SERVICE");
    await changeVehicleStatus(admin.id, vehicle.id, "RETIRED");
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).status).toBe("RETIRED");
  });
  it("is shown as RENTED only while one of its bookings is ACTIVE", async () => {
    const [admin, customer] = [await makeUser("ADMIN"), await makeUser("CUSTOMER")];
    const vehicle = await makeVehicle(null);
    const booking = await bookingOn(customer, vehicle.id);
    const row = async () => (await listVehiclesForAdmin(NOW)).find((v) => v.id === vehicle.id)!;
    expect(await row()).toMatchObject({ hasActiveBooking: false, upcomingBookings: 1 }); // a future booking is not "rented"
    await transitionBooking(admin.id, booking.id, "CONFIRMED", { now: NOW });
    await transitionBooking(admin.id, booking.id, "ACTIVE", { now: START });
    expect(await row()).toMatchObject({ hasActiveBooking: true, status: "AVAILABLE" }); // stored status is untouched
    await transitionBooking(admin.id, booking.id, "COMPLETED", { now: new Date(START.getTime() + DAY) });
    expect(await row()).toMatchObject({ hasActiveBooking: false });
  });
});

describe("reactivating a vehicle and the demotion of its owner", () => {
  it("refuses to reactivate the vehicle of an owner who is no longer allowed to list", async () => {
    const [admin, owner] = [await makeUser("ADMIN"), await makeUser("OWNER")];
    const vehicle = await makeVehicle(owner.id, { status: "RETIRED" });
    expect((await changeUserRole(admin.id, owner.id, "CUSTOMER")).ok).toBe(true);
    expect(await changeVehicleStatus(admin.id, vehicle.id, "IN_SERVICE")).toEqual({ ok: false, code: "OWNER_CANNOT_LIST" });
  });
  it("never ends with a demoted owner who has a live vehicle, even when both happen at the same time", async () => {
    for (let i = 0; i < 10; i++) {
      await resetDatabase();
      const [admin, admin2, owner] = [await makeUser("ADMIN"), await makeUser("ADMIN"), await makeUser("OWNER")];
      const vehicle = await makeVehicle(owner.id, { status: "RETIRED" });
      await Promise.all([changeVehicleStatus(admin.id, vehicle.id, "IN_SERVICE"), changeUserRole(admin2.id, owner.id, "CUSTOMER")]);
      const role = (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).role;
      const live = await prisma.vehicle.count({ where: { ownerId: owner.id, status: { not: "RETIRED" } } });
      expect(role === "CUSTOMER" && live > 0).toBe(false);
    }
  });
});

describe("a status change racing with a handover", () => {
  it("never leaves an IN_SERVICE vehicle with an ACTIVE booking", async () => {
    for (let i = 0; i < 10; i++) {
      await resetDatabase();
      const [admin, admin2, customer] = [await makeUser("ADMIN"), await makeUser("ADMIN"), await makeUser("CUSTOMER")];
      const vehicle = await makeVehicle(null);
      const booking = await bookingOn(customer, vehicle.id);
      await transitionBooking(admin.id, booking.id, "CONFIRMED", { now: NOW });
      await Promise.all([transitionBooking(admin.id, booking.id, "ACTIVE", { now: START }), changeVehicleStatus(admin2.id, vehicle.id, "IN_SERVICE")]);
      const status = (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).status;
      const active = await prisma.booking.count({ where: { vehicleId: vehicle.id, status: "ACTIVE" } });
      expect(status === "IN_SERVICE" && active > 0).toBe(false);
      expect(status === "AVAILABLE" && active === 0).toBe(false); // exactly one of the two actions won
    }
  });
});

describe("moderation, platform vehicles and edits", () => {
  it("lets only an admin approve or reject, and only approved listings can be booked", async () => {
    const [admin, owner, customer] = [await makeUser("ADMIN"), await makeUser("OWNER"), await makeUser("CUSTOMER")];
    const vehicle = await makeVehicle(owner.id, { listingStatus: "PENDING" });
    expect(await moderateListing(owner.id, vehicle.id, "APPROVED")).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await moderateListing(admin.id, "no-such", "APPROVED")).toEqual({ ok: false, code: "NOT_FOUND" });
    await expect(bookingOn(customer, vehicle.id)).rejects.toThrow("VEHICLE_UNAVAILABLE");
    expect(await moderateListing(admin.id, vehicle.id, "REJECTED")).toEqual({ ok: true });
    await expect(bookingOn(customer, vehicle.id)).rejects.toThrow("VEHICLE_UNAVAILABLE");
    expect(await moderateListing(admin.id, vehicle.id, "APPROVED")).toEqual({ ok: true });
    expect((await bookingOn(customer, vehicle.id)).status).toBe("PENDING");
  });
  it("lets only an admin create a platform-fleet vehicle: no owner, approved", async () => {
    const [admin, owner] = [await makeUser("ADMIN"), await makeUser("OWNER")];
    const input = { name: "Fleet ATV", type: "ATV" as const, plate: "FLEET-1", hourlyRate: 10000, dailyRate: 40000 };
    expect(await createPlatformVehicle(owner.id, input)).toEqual({ ok: false, code: "FORBIDDEN" });
    const created = await createPlatformVehicle(admin.id, input);
    expect(created.ok).toBe(true);
    if (created.ok) expect(await prisma.vehicle.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ ownerId: null, listingStatus: "APPROVED", status: "AVAILABLE" });
  });
  it("lets owners and companies edit only their own vehicles; text changes go back to moderation, prices do not", async () => {
    const [admin, owner, company, customer] = [await makeUser("ADMIN"), await makeUser("OWNER"), await makeUser("RENTAL_COMPANY"), await makeUser("CUSTOMER")];
    const mine = await makeVehicle(owner.id);
    const edit = (over: Partial<Parameters<typeof updateVehicleDetails>[2]> = {}) => ({ name: "Vehicle", description: null, hourlyRate: 10000, dailyRate: 40000, weekendRate: null, locationId: null, ...over });
    const original = await prisma.vehicle.findUniqueOrThrow({ where: { id: mine.id } });

    expect(await updateVehicleDetails(company.id, mine.id, edit({ name: original.name }))).toEqual({ ok: false, code: "NOT_FOUND" }); // someone else's vehicle does not exist
    expect(await updateVehicleDetails(customer.id, mine.id, edit())).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await updateVehicleDetails("ghost", mine.id, edit())).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await updateVehicleDetails(owner.id, "no-such", edit())).toEqual({ ok: false, code: "NOT_FOUND" });

    const priceOnly = await updateVehicleDetails(owner.id, mine.id, edit({ name: original.name, description: original.description, dailyRate: 55000 }));
    expect(priceOnly).toEqual({ ok: true, backToModeration: false });
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: mine.id } })).listingStatus).toBe("APPROVED");

    const text = await updateVehicleDetails(owner.id, mine.id, edit({ name: "New attractive name", dailyRate: 55000 }));
    expect(text).toEqual({ ok: true, backToModeration: true });
    expect(await prisma.vehicle.findUniqueOrThrow({ where: { id: mine.id } })).toMatchObject({ name: "New attractive name", listingStatus: "PENDING", plate: original.plate, type: original.type });

    // An admin edits without sending the listing back to moderation.
    await moderateListing(admin.id, mine.id, "APPROVED");
    expect(await updateVehicleDetails(admin.id, mine.id, edit({ name: "Admin fixed the typo" }))).toEqual({ ok: true, backToModeration: false });
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: mine.id } })).listingStatus).toBe("APPROVED");
  });
  it("a price change never alters the price of a booking that already exists", async () => {
    const [owner, customer] = [await makeUser("OWNER"), await makeUser("CUSTOMER")];
    const vehicle = await makeVehicle(owner.id);
    const booking = await bookingOn(customer, vehicle.id);
    await updateVehicleDetails(owner.id, vehicle.id, { name: vehicle.name, description: null, hourlyRate: 99999, dailyRate: 99999, weekendRate: null, locationId: null });
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stored).toMatchObject({ totalPrice: 40000, commissionAmount: 6000, ownerAmount: 34000 });
  });
  it("refuses an edit from an account whose role can no longer list vehicles", async () => {
    const [admin, owner] = [await makeUser("ADMIN"), await makeUser("OWNER")];
    const vehicle = await makeVehicle(owner.id, { status: "RETIRED" });
    await changeUserRole(admin.id, owner.id, "CUSTOMER");
    expect(await updateVehicleDetails(owner.id, vehicle.id, { name: "x", description: null, hourlyRate: 1, dailyRate: 1, weekendRate: null, locationId: null })).toEqual({ ok: false, code: "FORBIDDEN" });
  });
});

describe("resubmitListing and specifications", () => {
  it("lets the owner send a REJECTED listing back to review, and nobody else, and nothing else", async () => {
    const [owner, other, admin] = [await makeUser("OWNER"), await makeUser("OWNER"), await makeUser("ADMIN")];
    const rejected = await makeVehicle(owner.id, { listingStatus: "REJECTED" });
    const approved = await makeVehicle(owner.id, { listingStatus: "APPROVED" });
    expect(await resubmitListing(other.id, rejected.id)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await resubmitListing(owner.id, approved.id)).toEqual({ ok: false, code: "NOT_REJECTED" });
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: rejected.id } })).listingStatus).toBe("REJECTED");
    expect(await resubmitListing(owner.id, rejected.id)).toEqual({ ok: true });
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: rejected.id } })).listingStatus).toBe("PENDING");
    expect(await resubmitListing(admin.id, rejected.id)).toEqual({ ok: false, code: "NOT_REJECTED" });
  });
  it("saves the specifications with the other details, and clears them when the fields are left blank", async () => {
    const owner = await makeUser("OWNER");
    const v = await makeVehicle(owner.id);
    const base = { name: v.name, description: null, hourlyRate: 1000, dailyRate: 4000, weekendRate: null, locationId: null };
    await updateVehicleDetails(owner.id, v.id, { ...base, year: 2022, engineCc: 450, powerHp: 35, seats: 2, licenseCategory: "A2" });
    expect(await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).toMatchObject({ year: 2022, engineCc: 450, powerHp: 35, seats: 2, licenseCategory: "A2" });
    await updateVehicleDetails(owner.id, v.id, { ...base, year: null, engineCc: null, powerHp: null, seats: null, licenseCategory: null });
    expect(await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).toMatchObject({ year: null, engineCc: null, powerHp: null, seats: null, licenseCategory: null });
  });
});
