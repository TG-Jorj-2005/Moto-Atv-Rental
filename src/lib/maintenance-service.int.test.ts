import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { changeUserRole } from "@/lib/users";
import { deleteMaintenance, listMaintenance, recordMaintenance } from "@/lib/maintenance-service";
import { makeBooking, makeUser, makeVehicle, resetDatabase } from "@/test-support/db";

beforeEach(resetDatabase);

const record = (over: Partial<Parameters<typeof recordMaintenance>[2]> = {}) => ({
  type: "ITP" as const,
  performedAt: new Date("2030-01-10T00:00:00Z"),
  nextDueAt: new Date("2032-01-10T00:00:00Z"),
  notes: "Passed",
  ...over,
});

describe("recordMaintenance", () => {
  it("lets an admin record for any vehicle and an owner or company only for its own", async () => {
    const [admin, owner, company, customer] = [await makeUser("ADMIN"), await makeUser("OWNER"), await makeUser("RENTAL_COMPANY"), await makeUser("CUSTOMER")];
    const ownerVehicle = await makeVehicle(owner.id);
    const companyVehicle = await makeVehicle(company.id);
    const platformVehicle = await makeVehicle(null);
    expect((await recordMaintenance(admin.id, platformVehicle.id, record())).ok).toBe(true);
    expect((await recordMaintenance(admin.id, ownerVehicle.id, record({ type: "RCA" }))).ok).toBe(true);
    expect((await recordMaintenance(owner.id, ownerVehicle.id, record({ type: "SERVICE" }))).ok).toBe(true);
    expect((await recordMaintenance(company.id, companyVehicle.id, record())).ok).toBe(true);
    // isolation: other people's vehicles do not exist for them
    expect(await recordMaintenance(owner.id, companyVehicle.id, record())).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await recordMaintenance(company.id, ownerVehicle.id, record())).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await recordMaintenance(owner.id, platformVehicle.id, record())).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await recordMaintenance(customer.id, ownerVehicle.id, record())).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await recordMaintenance("ghost", ownerVehicle.id, record())).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await prisma.maintenance.count()).toBe(4);
  });
  it("refuses an account whose role can no longer list vehicles", async () => {
    const [admin, owner] = [await makeUser("ADMIN"), await makeUser("OWNER")];
    const vehicle = await makeVehicle(owner.id, { status: "RETIRED" });
    await changeUserRole(admin.id, owner.id, "CUSTOMER");
    expect(await recordMaintenance(owner.id, vehicle.id, record())).toEqual({ ok: false, code: "FORBIDDEN" });
  });
  it("requires the next deadline to be after the date it was done", async () => {
    const admin = await makeUser("ADMIN");
    const vehicle = await makeVehicle(null);
    const done = new Date("2030-01-10T00:00:00Z");
    expect(await recordMaintenance(admin.id, vehicle.id, record({ performedAt: done, nextDueAt: done }))).toEqual({ ok: false, code: "INVALID" });
    expect(await recordMaintenance(admin.id, vehicle.id, record({ performedAt: done, nextDueAt: new Date(done.getTime() - 1) }))).toEqual({ ok: false, code: "INVALID" });
    expect((await recordMaintenance(admin.id, vehicle.id, record({ performedAt: done, nextDueAt: null }))).ok).toBe(true);
  });
  it("only produces records: it never changes the vehicle status or any booking", async () => {
    const admin = await makeUser("ADMIN");
    const vehicle = await makeVehicle(null);
    const booking = await makeBooking(vehicle.id, "CONFIRMED");
    await recordMaintenance(admin.id, vehicle.id, record({ type: "SERVICE", nextDueAt: new Date("2030-01-11T00:00:00Z") }));
    expect(await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).toMatchObject({ status: "AVAILABLE" });
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({ status: "CONFIRMED" });
  });
});

describe("listMaintenance and deleteMaintenance", () => {
  it("shows records only to the admin and the vehicle's owner, newest first", async () => {
    const [admin, owner, stranger] = [await makeUser("ADMIN"), await makeUser("OWNER"), await makeUser("OWNER")];
    const vehicle = await makeVehicle(owner.id);
    await recordMaintenance(owner.id, vehicle.id, record({ performedAt: new Date("2029-01-01T00:00:00Z"), nextDueAt: null }));
    await recordMaintenance(owner.id, vehicle.id, record({ performedAt: new Date("2030-01-01T00:00:00Z"), nextDueAt: null }));
    expect((await listMaintenance(owner.id, vehicle.id))!.map((r) => r.performedAt.getUTCFullYear())).toEqual([2030, 2029]);
    expect(await listMaintenance(admin.id, vehicle.id)).toHaveLength(2);
    expect(await listMaintenance(stranger.id, vehicle.id)).toBeNull();
  });
  it("deletes a record only for the admin or the owner of the vehicle", async () => {
    const [admin, owner, stranger] = [await makeUser("ADMIN"), await makeUser("OWNER"), await makeUser("OWNER")];
    const vehicle = await makeVehicle(owner.id);
    const a = await recordMaintenance(owner.id, vehicle.id, record());
    const b = await recordMaintenance(owner.id, vehicle.id, record({ type: "RCA" }));
    if (!a.ok || !b.ok) throw new Error("setup");
    expect(await deleteMaintenance(stranger.id, a.id)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await deleteMaintenance(owner.id, a.id)).toEqual({ ok: true });
    expect(await deleteMaintenance(admin.id, b.id)).toEqual({ ok: true });
    expect(await deleteMaintenance(admin.id, b.id)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await prisma.maintenance.count()).toBe(0);
  });
});
