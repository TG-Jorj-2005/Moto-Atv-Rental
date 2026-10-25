"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/session";
import { createListing, ListingCategoryError, ListingForbiddenError } from "@/lib/listings";
import { createPlatformVehicle, resubmitListing, updateVehicleDetails } from "@/lib/vehicle-service";
import { addPhotos, deletePhoto, setCoverPhoto } from "@/lib/photo-service";
import { deleteMaintenance, recordMaintenance } from "@/lib/maintenance-service";
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
    revalidatePath("/provider/vehicles");
    revalidatePath("/admin/vehicles");
    redirect(`${me.role === "ADMIN" ? "/admin" : "/provider"}/vehicles/${id}?tab=photos&ok=created`);
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
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  const buffers = await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer())));
  const result = await addPhotos(me.id, text(formData.get("vehicleId")), buffers);
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
