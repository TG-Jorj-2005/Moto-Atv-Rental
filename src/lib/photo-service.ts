import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { runTransaction } from "@/lib/tx";
import { authorizeVehicleManager } from "@/lib/vehicle-access";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_VEHICLE, sniffImage, uploadDir } from "@/lib/uploads";

// Photos of a vehicle. Owners and companies manage the photos of their own vehicles; an ADMIN of any vehicle.
// Files are validated by their CONTENT (magic bytes), limited in size and count, and stored under random names in the
// upload directory. New photos from a non-admin send an approved listing back to moderation, like a text change does.

export type PhotoFailure = "NOT_FOUND" | "FORBIDDEN" | "EMPTY" | "TOO_MANY" | "TOO_BIG" | "NOT_AN_IMAGE";
export type AddPhotosResult = { ok: true; added: number; backToModeration: boolean } | { ok: false; code: PhotoFailure };

export async function addPhotos(actorId: string, vehicleId: string, files: Uint8Array[]): Promise<AddPhotosResult> {
  const access = await authorizeVehicleManager(actorId, vehicleId);
  if (!access.ok) return access;
  if (files.length === 0) return { ok: false, code: "EMPTY" };

  // Everything is checked before anything is written.
  const kinds = [];
  for (const bytes of files) {
    if (bytes.length === 0) return { ok: false, code: "EMPTY" };
    if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, code: "TOO_BIG" };
    const kind = sniffImage(bytes);
    if (!kind) return { ok: false, code: "NOT_AN_IMAGE" };
    kinds.push(kind);
  }

  const written: string[] = [];
  try {
    await mkdir(uploadDir(), { recursive: true });
    const names: string[] = [];
    for (const [i, bytes] of files.entries()) {
      const name = `${randomBytes(16).toString("hex")}.${kinds[i]!.ext}`;
      await writeFile(path.join(uploadDir(), name), bytes, { flag: "wx" });
      written.push(name);
      names.push(name);
    }
    // The count is checked in the same transaction that inserts, with the vehicle row locked.
    return await runTransaction(async (tx): Promise<AddPhotosResult> => {
      await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${vehicleId} FOR UPDATE`;
      const existing = await tx.vehiclePhoto.count({ where: { vehicleId } });
      if (existing + names.length > MAX_PHOTOS_PER_VEHICLE) return { ok: false, code: "TOO_MANY" };
      await tx.vehiclePhoto.createMany({ data: names.map((name, i) => ({ vehicleId, path: `uploads/${name}`, position: existing + i })) });
      const backToModeration = access.actor.role !== "ADMIN" && access.vehicle.listingStatus === "APPROVED";
      if (backToModeration) await tx.vehicle.update({ where: { id: vehicleId }, data: { listingStatus: "PENDING" } });
      return { ok: true, added: names.length, backToModeration };
    }).then(async (result) => {
      if (!result.ok) await removeFiles(written);
      return result;
    });
  } catch (error) {
    await removeFiles(written);
    throw error;
  }
}

async function removeFiles(names: string[]) {
  await Promise.all(names.map((n) => unlink(path.join(uploadDir(), n)).catch(() => undefined)));
}

export async function deletePhoto(actorId: string, photoId: string): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" }> {
  const photo = await prisma.vehiclePhoto.findUnique({ where: { id: photoId }, select: { id: true, path: true, vehicleId: true } });
  if (!photo) return { ok: false, code: "NOT_FOUND" };
  const access = await authorizeVehicleManager(actorId, photo.vehicleId);
  if (!access.ok) return access;
  await runTransaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${photo.vehicleId} FOR UPDATE`;
    await tx.vehiclePhoto.delete({ where: { id: photoId } });
    const rest = await tx.vehiclePhoto.findMany({ where: { vehicleId: photo.vehicleId }, orderBy: { position: "asc" }, select: { id: true } });
    for (const [i, p] of rest.entries()) await tx.vehiclePhoto.update({ where: { id: p.id }, data: { position: i } });
  });
  // Only files we stored are deleted, never the static demonstration images.
  if (photo.path.startsWith("uploads/")) await removeFiles([photo.path.slice("uploads/".length)]);
  return { ok: true };
}

export async function setCoverPhoto(actorId: string, photoId: string): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" }> {
  const photo = await prisma.vehiclePhoto.findUnique({ where: { id: photoId }, select: { vehicleId: true } });
  if (!photo) return { ok: false, code: "NOT_FOUND" };
  const access = await authorizeVehicleManager(actorId, photo.vehicleId);
  if (!access.ok) return access;
  await runTransaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${photo.vehicleId} FOR UPDATE`;
    const all = await tx.vehiclePhoto.findMany({ where: { vehicleId: photo.vehicleId }, orderBy: { position: "asc" }, select: { id: true } });
    const ordered = [photoId, ...all.map((p) => p.id).filter((id) => id !== photoId)];
    for (const [i, id] of ordered.entries()) await tx.vehiclePhoto.update({ where: { id }, data: { position: i } });
  });
  return { ok: true };
}
