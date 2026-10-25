import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { changeUserRole } from "@/lib/users";
import { createListing } from "@/lib/listings";
import { makeBooking, makeUser, makeVehicle, resetDatabase } from "@/test-support/db";

beforeEach(resetDatabase);

const roleOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).role;

describe("changeUserRole: basic rules", () => {
  it("lets an admin promote to any higher role, including ADMIN", async () => {
    const admin = await makeUser("ADMIN");
    const user = await makeUser("CUSTOMER");
    for (const role of ["OWNER", "RENTAL_COMPANY", "ADMIN"] as const) {
      expect(await changeUserRole(admin.id, user.id, role)).toMatchObject({ ok: true, to: role });
      expect(await roleOf(user.id)).toBe(role);
    }
  });
  it("refuses a self change", async () => {
    const admin = await makeUser("ADMIN");
    expect(await changeUserRole(admin.id, admin.id, "CUSTOMER")).toEqual({ ok: false, code: "SELF" });
    expect(await roleOf(admin.id)).toBe("ADMIN");
  });
  it("refuses actors that are not admins, including a user promoted to nothing", async () => {
    const owner = await makeUser("OWNER");
    const customer = await makeUser("CUSTOMER");
    expect(await changeUserRole(owner.id, customer.id, "OWNER")).toEqual({ ok: false, code: "NOT_ADMIN" });
    expect(await changeUserRole("does-not-exist", customer.id, "OWNER")).toEqual({ ok: false, code: "NOT_ADMIN" });
    expect(await roleOf(customer.id)).toBe("CUSTOMER");
  });
  it("refuses unknown targets and no-op changes", async () => {
    const admin = await makeUser("ADMIN");
    const user = await makeUser("OWNER");
    expect(await changeUserRole(admin.id, "nobody", "OWNER")).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await changeUserRole(admin.id, user.id, "OWNER")).toEqual({ ok: false, code: "NO_CHANGE" });
  });
  it("lets an admin demote another admin while another admin remains", async () => {
    const a = await makeUser("ADMIN");
    const b = await makeUser("ADMIN");
    expect(await changeUserRole(a.id, b.id, "CUSTOMER")).toMatchObject({ ok: true });
    expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBe(1);
  });
});

describe("changeUserRole: demoting an owner or company", () => {
  it("refuses while any vehicle is not RETIRED, whatever its listing status", async () => {
    const admin = await makeUser("ADMIN");
    for (const listingStatus of ["PENDING", "APPROVED", "REJECTED"] as const) {
      await resetDatabase();
      const a = await makeUser("ADMIN");
      const owner = await makeUser("OWNER");
      await makeVehicle(owner.id, { status: "RETIRED", listingStatus: "APPROVED" });
      await makeVehicle(owner.id, { status: "AVAILABLE", listingStatus });
      expect(await changeUserRole(a.id, owner.id, "CUSTOMER")).toEqual({ ok: false, code: "VEHICLES_NOT_RETIRED", count: 1 });
      expect(await roleOf(owner.id)).toBe("OWNER");
    }
    expect(admin.id).toBeTruthy();
  });
  it("treats IN_SERVICE as not retired", async () => {
    const admin = await makeUser("ADMIN");
    const owner = await makeUser("OWNER");
    await makeVehicle(owner.id, { status: "IN_SERVICE" });
    expect(await changeUserRole(admin.id, owner.id, "CUSTOMER")).toMatchObject({ ok: false, code: "VEHICLES_NOT_RETIRED" });
  });
  it("allows it when every vehicle is RETIRED and never touches existing bookings", async () => {
    const admin = await makeUser("ADMIN");
    const owner = await makeUser("OWNER");
    const vehicle = await makeVehicle(owner.id, { status: "RETIRED" });
    const booking = await makeBooking(vehicle.id, "CONFIRMED");
    expect(await changeUserRole(admin.id, owner.id, "CUSTOMER")).toMatchObject({ ok: true });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CONFIRMED");
  });
  it("refuses demoting a rental company that has quotes waiting for its answer", async () => {
    const admin = await makeUser("ADMIN");
    const company = await makeUser("RENTAL_COMPANY");
    const quote = await prisma.quoteRequest.create({
      data: { userId: company.id, vehicleType: "ATV", quantity: 3, startDate: new Date("2030-01-01"), endDate: new Date("2030-01-02"), purpose: "Team building", status: "QUOTED" },
    });
    expect(await changeUserRole(admin.id, company.id, "OWNER")).toEqual({ ok: false, code: "OPEN_QUOTES", count: 1 });
    await prisma.quoteRequest.update({ where: { id: quote.id }, data: { status: "ACCEPTED" } });
    expect(await changeUserRole(admin.id, company.id, "OWNER")).toMatchObject({ ok: true });
  });
  it("only reports an owed balance: it never blocks and never changes financial records", async () => {
    const admin = await makeUser("ADMIN");
    const owner = await makeUser("OWNER");
    const vehicle = await makeVehicle(owner.id, { status: "RETIRED" });
    await makeBooking(vehicle.id, "COMPLETED", { ownerAmount: 34000 });
    const before = { bookings: await prisma.booking.findMany(), payouts: await prisma.payout.count() };
    expect(await changeUserRole(admin.id, owner.id, "CUSTOMER")).toMatchObject({ ok: true, owedBani: 34000 });
    expect(await prisma.booking.findMany()).toEqual(before.bookings);
    expect(await prisma.payout.count()).toBe(before.payouts);
  });
});

describe("changeUserRole: concurrency", () => {
  it("two admins demoting each other at the same time never leave zero admins", async () => {
    for (let i = 0; i < 10; i++) {
      await resetDatabase();
      const a = await makeUser("ADMIN");
      const b = await makeUser("ADMIN");
      const results = await Promise.all([changeUserRole(a.id, b.id, "CUSTOMER"), changeUserRole(b.id, a.id, "CUSTOMER")]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)[0]).toEqual({ ok: false, code: "NOT_ADMIN" });
      expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBe(1);
    }
  });
  it("a cycle of three admins demoting each other always leaves at least one admin", async () => {
    for (let i = 0; i < 10; i++) {
      await resetDatabase();
      const [a, b, c] = [await makeUser("ADMIN"), await makeUser("ADMIN"), await makeUser("ADMIN")] as const;
      await Promise.all([changeUserRole(a.id, b.id, "CUSTOMER"), changeUserRole(b.id, c.id, "CUSTOMER"), changeUserRole(c.id, a.id, "CUSTOMER")]);
      expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBeGreaterThanOrEqual(1);
    }
  });
  it("a demotion racing with a new listing never leaves a customer owning a live vehicle", async () => {
    for (let i = 0; i < 10; i++) {
      await resetDatabase();
      const admin = await makeUser("ADMIN");
      const owner = await makeUser("OWNER");
      await makeVehicle(owner.id, { status: "RETIRED" }); // demotion is allowed to start
      const [demotion, listing] = await Promise.allSettled([
        changeUserRole(admin.id, owner.id, "CUSTOMER"),
        createListing(owner.id, { name: "Racer", type: "ATV", plate: `RACE-${i}`, hourlyRate: 1000, dailyRate: 4000 }),
      ]);
      const role = await roleOf(owner.id);
      const live = await prisma.vehicle.count({ where: { ownerId: owner.id, status: { not: "RETIRED" } } });
      // Either the listing won (so the demotion must have been refused) or the demotion won (so the listing must have been refused).
      expect(role === "CUSTOMER" && live > 0).toBe(false);
      if (demotion.status === "fulfilled" && demotion.value.ok) expect(listing.status).toBe("rejected");
      if (listing.status === "fulfilled") expect(demotion.status === "fulfilled" && demotion.value.ok).toBe(false);
    }
  });
});
