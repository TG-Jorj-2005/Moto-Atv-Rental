import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { addPhotos, deletePhoto, setCoverPhoto } from "@/lib/photo-service";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_VEHICLE } from "@/lib/uploads";
import { makeUser, makeVehicle, resetDatabase } from "@/test-support/db";

let dir = "";
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "bd2-uploads-test-"));
  process.env.UPLOAD_DIR = dir;
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetDatabase();
  for (const f of await readdir(dir)) await rm(path.join(dir, f));
});

const jpeg = (size = 100) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(size - 4).fill(1)]);
const png = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const files = async () => (await readdir(dir)).sort();
const photosOf = (vehicleId: string) => prisma.vehiclePhoto.findMany({ where: { vehicleId }, orderBy: { position: "asc" } });

describe("addPhotos", () => {
  it("stores valid images under random names and lists them in order", async () => {
    const owner = await makeUser("OWNER");
    const vehicle = await makeVehicle(owner.id);
    const result = await addPhotos(owner.id, vehicle.id, [jpeg(), png()]);
    expect(result).toMatchObject({ ok: true, added: 2 });
    const rows = await photosOf(vehicle.id);
    expect(rows.map((r) => r.position)).toEqual([0, 1]);
    expect(rows.every((r) => /^uploads\/[0-9a-f]{32}\.(jpg|png)$/.test(r.path))).toBe(true);
    expect(await files()).toHaveLength(2);
  });
  it("appends after the existing photos", async () => {
    const owner = await makeUser("OWNER");
    const vehicle = await makeVehicle(owner.id);
    await addPhotos(owner.id, vehicle.id, [jpeg()]);
    await addPhotos(owner.id, vehicle.id, [jpeg(), jpeg()]);
    expect((await photosOf(vehicle.id)).map((r) => r.position)).toEqual([0, 1, 2]);
  });
  it("checks everything before writing anything: one bad file means no file at all", async () => {
    const owner = await makeUser("OWNER");
    const vehicle = await makeVehicle(owner.id);
    const notAnImage = Uint8Array.from("<script>alert(1)</script>".split("").map((c) => c.charCodeAt(0)));
    expect(await addPhotos(owner.id, vehicle.id, [jpeg(), notAnImage])).toEqual({ ok: false, code: "NOT_AN_IMAGE" });
    expect(await addPhotos(owner.id, vehicle.id, [jpeg(), jpeg(MAX_PHOTO_BYTES + 1)])).toEqual({ ok: false, code: "TOO_BIG" });
    expect(await addPhotos(owner.id, vehicle.id, [])).toEqual({ ok: false, code: "EMPTY" });
    expect(await addPhotos(owner.id, vehicle.id, [new Uint8Array(0)])).toEqual({ ok: false, code: "EMPTY" });
    expect(await files()).toEqual([]);
    expect(await prisma.vehiclePhoto.count()).toBe(0);
  });
  it("never exceeds the limit per vehicle, also when requests race, and leaves no orphan file", async () => {
    const owner = await makeUser("OWNER");
    const vehicle = await makeVehicle(owner.id);
    const first = await addPhotos(owner.id, vehicle.id, Array.from({ length: MAX_PHOTOS_PER_VEHICLE - 1 }, () => jpeg()));
    expect(first.ok).toBe(true);
    expect(await addPhotos(owner.id, vehicle.id, [jpeg(), jpeg()])).toEqual({ ok: false, code: "TOO_MANY" });
    expect(await files()).toHaveLength(MAX_PHOTOS_PER_VEHICLE - 1);
    const raced = await Promise.all([addPhotos(owner.id, vehicle.id, [jpeg()]), addPhotos(owner.id, vehicle.id, [jpeg()]), addPhotos(owner.id, vehicle.id, [jpeg()])]);
    expect(raced.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.vehiclePhoto.count({ where: { vehicleId: vehicle.id } })).toBe(MAX_PHOTOS_PER_VEHICLE);
    expect(await files()).toHaveLength(MAX_PHOTOS_PER_VEHICLE);
  });
  it("is limited to the vehicle's owner (others see nothing) and to accounts that may list; an admin can do it for any vehicle", async () => {
    const [admin, owner, other, customer] = [await makeUser("ADMIN"), await makeUser("OWNER"), await makeUser("OWNER"), await makeUser("CUSTOMER")];
    const vehicle = await makeVehicle(owner.id);
    expect(await addPhotos(other.id, vehicle.id, [jpeg()])).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await addPhotos(customer.id, vehicle.id, [jpeg()])).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await addPhotos("ghost", vehicle.id, [jpeg()])).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await addPhotos(owner.id, "no-such", [jpeg()])).toEqual({ ok: false, code: "NOT_FOUND" });
    expect((await addPhotos(admin.id, vehicle.id, [jpeg()])).ok).toBe(true);
    expect(await files()).toHaveLength(1);
  });
  it("sends an approved listing back to moderation when a non-admin adds photos, but not when an admin does", async () => {
    const [admin, owner] = [await makeUser("ADMIN"), await makeUser("OWNER")];
    const vehicle = await makeVehicle(owner.id, { listingStatus: "APPROVED" });
    expect(await addPhotos(admin.id, vehicle.id, [jpeg()])).toMatchObject({ ok: true, backToModeration: false });
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).listingStatus).toBe("APPROVED");
    expect(await addPhotos(owner.id, vehicle.id, [jpeg()])).toMatchObject({ ok: true, backToModeration: true });
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).listingStatus).toBe("PENDING");
  });
});

describe("deletePhoto and setCoverPhoto", () => {
  it("deletes the row and the file, and closes the gap in the order", async () => {
    const owner = await makeUser("OWNER");
    const vehicle = await makeVehicle(owner.id);
    await addPhotos(owner.id, vehicle.id, [jpeg(), png(), jpeg()]);
    const [a, b, c] = await photosOf(vehicle.id);
    expect(await deletePhoto(owner.id, b!.id)).toEqual({ ok: true });
    expect((await photosOf(vehicle.id)).map((r) => [r.id, r.position])).toEqual([[a!.id, 0], [c!.id, 1]]);
    expect(await files()).toHaveLength(2);
  });
  it("never deletes the static demonstration images, only the row", async () => {
    const owner = await makeUser("OWNER");
    const vehicle = await makeVehicle(owner.id);
    const demo = await prisma.vehiclePhoto.create({ data: { vehicleId: vehicle.id, path: "/gallery/g1.jpg", position: 0 } });
    expect(await deletePhoto(owner.id, demo.id)).toEqual({ ok: true });
    expect(await prisma.vehiclePhoto.count()).toBe(0);
  });
  it("refuses other people's photos", async () => {
    const [owner, other] = [await makeUser("OWNER"), await makeUser("OWNER")];
    const vehicle = await makeVehicle(owner.id);
    await addPhotos(owner.id, vehicle.id, [jpeg()]);
    const [photo] = await photosOf(vehicle.id);
    expect(await deletePhoto(other.id, photo!.id)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await setCoverPhoto(other.id, photo!.id)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await deletePhoto(owner.id, "no-such")).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await files()).toHaveLength(1);
  });
  it("makes a photo the cover and keeps the others in order", async () => {
    const owner = await makeUser("OWNER");
    const vehicle = await makeVehicle(owner.id);
    await addPhotos(owner.id, vehicle.id, [jpeg(), jpeg(), jpeg()]);
    const [a, b, c] = await photosOf(vehicle.id);
    expect(await setCoverPhoto(owner.id, c!.id)).toEqual({ ok: true });
    expect((await photosOf(vehicle.id)).map((r) => r.id)).toEqual([c!.id, a!.id, b!.id]);
    expect((await photosOf(vehicle.id)).map((r) => r.position)).toEqual([0, 1, 2]);
  });
});
