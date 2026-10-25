import { beforeEach, describe, expect, it } from "vitest";
import { catalogFacets, parseCatalogParams, searchVehicles } from "@/lib/catalog";
import { makeBooking, makeUser, makeVehicle, resetDatabase } from "@/test-support/db";
import { prisma } from "@/lib/db";

beforeEach(resetDatabase);

const run = async (raw: Record<string, string>, now = new Date("2030-01-01T00:00:00Z")) => searchVehicles(parseCatalogParams(raw, now).filters);

describe("searchVehicles", () => {
  it("shows only approved vehicles that are available, never pending, rejected, in service or retired ones", async () => {
    const shown = await makeVehicle(null);
    await makeVehicle(null, { listingStatus: "PENDING" });
    await makeVehicle(null, { listingStatus: "REJECTED" });
    await makeVehicle(null, { status: "IN_SERVICE" });
    await makeVehicle(null, { status: "RETIRED" });
    const result = await run({});
    expect(result.items.map((v) => v.id)).toEqual([shown.id]);
    expect(result.total).toBe(1);
  });
  it("filters by price per day, type and name, and sorts", async () => {
    const owner = await makeUser("OWNER");
    const cheap = await prisma.vehicle.create({ data: { name: "Cheap Quad", type: "ATV", plate: "C-1", hourlyRate: 1000, dailyRate: 10000, ownerId: owner.id, listingStatus: "APPROVED" } });
    const dear = await prisma.vehicle.create({ data: { name: "Dear Bike", type: "MOTORCYCLE", plate: "D-1", hourlyRate: 9000, dailyRate: 90000, ownerId: owner.id, listingStatus: "APPROVED" } });
    expect((await run({ maxPrice: "500" })).items.map((v) => v.id)).toEqual([cheap.id]);
    expect((await run({ minPrice: "500" })).items.map((v) => v.id)).toEqual([dear.id]);
    expect((await run({ type: "MOTORCYCLE" })).items.map((v) => v.id)).toEqual([dear.id]);
    expect((await run({ q: "QUAD" })).items.map((v) => v.id)).toEqual([cheap.id]);
    expect((await run({ sort: "price_desc" })).items.map((v) => v.id)).toEqual([dear.id, cheap.id]);
    expect((await run({ sort: "price_asc" })).items.map((v) => v.id)).toEqual([cheap.id, dear.id]);
    expect((await run({ sort: "name" })).items.map((v) => v.id)).toEqual([cheap.id, dear.id]);
  });
  it("hides vehicles booked during the requested days, in Bucharest time, and ignores cancelled bookings", async () => {
    const free = await makeVehicle(null);
    const busy = await makeVehicle(null);
    const cancelled = await makeVehicle(null);
    // makeBooking starts on 2030-01-N at 08:00 UTC (10:00 in Bucharest) and lasts 24 hours
    const b = await makeBooking(busy.id, "CONFIRMED");
    await makeBooking(cancelled.id, "CANCELLED");
    const day = b.startAt.toISOString().slice(0, 10);
    const ids = (await run({ from: day, to: day })).items.map((v) => v.id).sort();
    expect(ids).toEqual([free.id, cancelled.id].sort());
    expect((await run({})).total).toBe(3);
  });
  it("a booking that ends exactly when the requested days begin does not block them", async () => {
    const v = await makeVehicle(null);
    const b = await prisma.booking.create({
      data: { vehicleId: v.id, customerId: (await prisma.customer.create({ data: { fullName: "T", email: "t@test.example", phone: "0000000" } })).id, startAt: new Date("2030-03-04T22:00:00Z"), endAt: new Date("2030-03-05T22:00:00Z"), totalPrice: 1000, status: "CONFIRMED" },
    }); // 5 March 00:00 -> 6 March 00:00 in Bucharest (UTC+2)
    expect((await run({ from: "2030-03-06", to: "2030-03-06" })).total).toBe(1); // starts when the booking ends
    expect((await run({ from: "2030-03-05", to: "2030-03-05" })).total).toBe(0);
    expect((await run({ from: "2030-03-04", to: "2030-03-04" })).total).toBe(1); // ends when the booking starts
    expect(b.id).toBeTruthy();
  });
  it("paginates and clamps the page number", async () => {
    for (let i = 0; i < 13; i++) await makeVehicle(null);
    const first = await run({});
    expect(first).toMatchObject({ total: 13, pages: 2, page: 1 });
    expect(first.items).toHaveLength(12);
    const second = await run({ page: "2" });
    expect(second.items).toHaveLength(1);
    expect((await run({ page: "99" })).page).toBe(2);
    const ids = new Set([...first.items, ...second.items].map((v) => v.id));
    expect(ids.size).toBe(13); // no vehicle repeated or lost between pages
  });
  it("loads only the cover photo of each vehicle", async () => {
    const v = await makeVehicle(null);
    await prisma.vehiclePhoto.createMany({ data: [{ vehicleId: v.id, path: "/gallery/g1.jpg", position: 0 }, { vehicleId: v.id, path: "/gallery/g2.jpg", position: 1 }] });
    const [item] = (await run({})).items;
    expect(item!.photos).toEqual([{ path: "/gallery/g1.jpg" }]);
  });
});

describe("catalogFacets", () => {
  it("counts only what the public can book", async () => {
    await makeVehicle(null);
    await makeVehicle(null, { listingStatus: "PENDING" });
    await makeVehicle(null, { status: "IN_SERVICE" });
    expect((await catalogFacets()).counts).toEqual({ ATV: 1 });
  });
});
