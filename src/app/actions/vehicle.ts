"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/session";
import { createListing, ListingCategoryError, ListingForbiddenError } from "@/lib/listings";
import { createPlatformVehicle, resubmitListing, updateVehicleDetails } from "@/lib/vehicle-service";
import { addPhotos, deletePhoto, setCoverPhoto } from "@/lib/photo-service";
import { MAX_PHOTOS_PER_VEHICLE, readUploads, uploadProblem } from "@/lib/uploads";
import { deleteMaintenance, recordMaintenance, updateMaintenance } from "@/lib/maintenance-service";
import { parseDateInput } from "@/lib/maintenance-rules";
import { toBani, vehicleCreateSchema, vehicleEditSchema } from "@/lib/forms";

// Shared by the provider area and the admin area. The role check below only decides who may call the action; the
// services decide WHICH vehicles the caller may touch (an owner only its own, an ADMIN every one), reading the role
// from the database.

const ALLOWED_RETURN = /^\/(provider|admin)\/[A-Za-z0-9/_\-[\]?=&.]*$/;

function back(returnTo: FormDataEntryValue | null, fallback: string, params: Record<string, string>): never {
  const base = typeof returnTo === "string" && ALLOWED_RETURN.test(returnTo) && !returnTo.includes("..") ? returnTo : fallback;
  const [path, query = ""] = base.split("?");
  const search = new URLSearchParams(query);
  search.delete("ok");
  search.delete("error");
  for (const [k, v] of Object.entries(params)) search.set(k, v);
  redirect(`${path}?${search.toString()}`);
}

const ACTOR_ROLES = ["OWNER", "RENTAL_COMPANY", "ADMIN"] as const;
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export async function createVehicleAction(formData: FormData) {
  const me = await requireRole(...ACTOR_ROLES);
  const parsed = vehicleCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(formData.get("returnTo"), "/provider/vehicles/new", { error: parsed.error.issues.some((i) => i.path[0] === "category") ? "category" : "invalid" });
  const d = parsed.data;
  // Photos sent with the form are checked BEFORE anything is created, so that a bad file never leaves a half-made listing.
  const uploads = await readUploads(formData, "photos");
  if (uploads.length > MAX_PHOTOS_PER_VEHICLE) back(formData.get("returnTo"), "/provider/vehicles/new", { error: "photo_TOO_MANY" });
  const problem = uploads.map(uploadProblem).find((p) => p !== null);
  if (problem) back(formData.get("returnTo"), "/provider/vehicles/new", { error: `photo_${problem}` });
  const photos = uploads.map((u) => u.bytes);
  const common = { name: d.name, type: d.type, plate: d.plate, hourlyRate: toBani(d.hourlyRon), dailyRate: toBani(d.dailyRon), weekendRate: d.weekendRon === null ? null : toBani(d.weekendRon), description: d.description, locationId: d.locationId, year: d.year, engineCc: d.engineCc, powerHp: d.powerHp, seats: d.seats, licenseCategory: d.licenseCategory, category: d.category };
  try {
    let id: string;
    if (me.role === "ADMIN") {
      const r = await createPlatformVehicle(me.id, common);
      if (!r.ok) {
        if (r.code === "INVALID_CATEGORY") back(formData.get("returnTo"), "/provider/vehicles/new", { error: "category" });
        redirect("/forbidden");
      }
      id = r.id;
    } else {
      id = (await createListing(me.id, common)).id;
    }
    const area = me.role === "ADMIN" ? "/admin" : "/provider";
    // The vehicle exists now: if saving the photos still fails (disk, a race), the user lands on its photos tab with the reason.
    const saved = photos.length > 0 ? await addPhotos(me.id, id, photos) : null;
    revalidatePath("/provider/vehicles");
    revalidatePath("/admin/vehicles");
    if (saved && !saved.ok) redirect(`${area}/vehicles/${id}?tab=photos&ok=created&error=photo_${saved.code}`);
    redirect(`${area}/vehicles/${id}?tab=photos&ok=${saved ? "created_photos" : "created"}`);
  } catch (e) {
    if (e instanceof ListingForbiddenError) redirect("/forbidden");
    if (e instanceof ListingCategoryError) back(formData.get("returnTo"), "/provider/vehicles/new", { error: "category" });
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") back(formData.get("returnTo"), "/provider/vehicles/new", { error: "plate" });
    throw e;
  }
}

export async function saveVehicleDetailsAction(formData: FormData) {
  const me = await requireRole(...ACTOR_ROLES);
  const id = text(formData.get("vehicleId"));
  const parsed = vehicleEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(formData.get("returnTo"), "/provider/vehicles", { error: "invalid" });
  const d = parsed.data;
  const result = await updateVehicleDetails(me.id, id, { name: d.name, description: d.description, hourlyRate: toBani(d.hourlyRon), dailyRate: toBani(d.dailyRon), weekendRate: d.weekendRon === null ? null : toBani(d.weekendRon), locationId: d.locationId, year: d.year, engineCc: d.engineCc, powerHp: d.powerHp, seats: d.seats, licenseCategory: d.licenseCategory, category: d.category });
  revalidatePath("/", "layout");
  if (!result.ok) back(formData.get("returnTo"), "/provider/vehicles", { error: result.code === "FORBIDDEN" ? "forbidden" : result.code === "INVALID_CATEGORY" ? "category" : "notfound" });
  back(formData.get("returnTo"), "/provider/vehicles", { ok: result.backToModeration ? "saved_review" : "saved" });
}

export async function uploadPhotosAction(formData: FormData) {
  const me = await requireRole(...ACTOR_ROLES);
  const uploads = await readUploads(formData, "photos");
  // Name and declared type are checked here; the service checks the content, the size and the count again.
  const problem = uploads.map(uploadProblem).find((p) => p !== null);
  if (problem) back(formData.get("returnTo"), "/provider/vehicles", { error: `photo_${problem}` });
  const result = await addPhotos(me.id, text(formData.get("vehicleId")), uploads.map((u) => u.bytes));
  revalidatePath("/", "layout");
  if (!result.ok) back(formData.get("returnTo"), "/provider/vehicles", { error: `photo_${result.code}` });
  back(formData.get("returnTo"), "/provider/vehicles", { ok: result.backToModeration ? "photos_review" : "photos" });
}

export async function deletePhotoAction(formData: FormData) {
  const me = await requireRole(...ACTOR_ROLES);
  const result = await deletePhoto(me.id, text(formData.get("photoId")));
  revalidatePath("/", "layout");
  back(formData.get("returnTo"), "/provider/vehicles", result.ok ? { ok: "photo_deleted" } : { error: "notfound" });
}

export async function makeCoverAction(formData: FormData) {
  const me = await requireRole(...ACTOR_ROLES);
  const result = await setCoverPhoto(me.id, text(formData.get("photoId")));
  revalidatePath("/", "layout");
  back(formData.get("returnTo"), "/provider/vehicles", result.ok ? { ok: "cover" } : { error: "notfound" });
}

export async function addMaintenanceAction(formData: FormData) {
  const me = await requireRole(...ACTOR_ROLES);
  const type = text(formData.get("type"));
  const performedAt = parseDateInput(text(formData.get("performedOn")));
  const dueRaw = text(formData.get("nextDueOn"));
  const nextDueAt = dueRaw ? parseDateInput(dueRaw) : null;
  if (!["SERVICE", "ITP", "RCA", "OTHER"].includes(type) || !performedAt || (dueRaw && !nextDueAt)) back(formData.get("returnTo"), "/provider/vehicles", { error: "maintenance_invalid" });
  const result = await recordMaintenance(me.id, text(formData.get("vehicleId")), { type: type as "SERVICE" | "ITP" | "RCA" | "OTHER", performedAt: performedAt!, nextDueAt, notes: text(formData.get("notes")).trim().slice(0, 500) || null });
  revalidatePath("/", "layout");
  back(formData.get("returnTo"), "/provider/vehicles", result.ok ? { ok: "maintenance" } : { error: result.code === "INVALID" ? "maintenance_dates" : "notfound" });
}

export async function updateMaintenanceAction(formData: FormData) {
  const me = await requireRole(...ACTOR_ROLES);
  const type = text(formData.get("type"));
  const performedAt = parseDateInput(text(formData.get("performedOn")));
  const dueRaw = text(formData.get("nextDueOn"));
  const nextDueAt = dueRaw ? parseDateInput(dueRaw) : null;
  if (!["SERVICE", "ITP", "RCA", "OTHER"].includes(type) || !performedAt || (dueRaw && !nextDueAt)) back(formData.get("returnTo"), "/provider/vehicles", { error: "maintenance_invalid" });
  const result = await updateMaintenance(me.id, text(formData.get("recordId")), { type: type as "SERVICE" | "ITP" | "RCA" | "OTHER", performedAt: performedAt!, nextDueAt, notes: text(formData.get("notes")).trim().slice(0, 500) || null });
  revalidatePath("/", "layout");
  back(formData.get("returnTo"), "/provider/vehicles", result.ok ? { ok: "maintenance_updated" } : { error: result.code === "INVALID" ? "maintenance_dates" : "notfound" });
}

export async function deleteMaintenanceAction(formData: FormData) {
  const me = await requireRole(...ACTOR_ROLES);
  const result = await deleteMaintenance(me.id, text(formData.get("recordId")));
  revalidatePath("/", "layout");
  back(formData.get("returnTo"), "/provider/vehicles", result.ok ? { ok: "maintenance_deleted" } : { error: "notfound" });
}

export async function resubmitListingAction(formData: FormData) {
  const me = await requireRole(...ACTOR_ROLES);
  const result = await resubmitListing(me.id, text(formData.get("vehicleId")));
  revalidatePath("/", "layout");
  back(formData.get("returnTo"), "/provider/vehicles", result.ok ? { ok: "resubmitted" } : { error: "not_rejected" });
}
