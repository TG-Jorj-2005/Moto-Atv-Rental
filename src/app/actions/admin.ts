"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Role, type BookingStatus, type VehicleStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { transitionBooking } from "@/lib/booking-service";
import { changeVehicleStatus, moderateListing } from "@/lib/vehicle-service";
import { changeUserRole } from "@/lib/users";
import { eurRonRate, parseCurrency } from "@/lib/currency";
import { toRonBani } from "@/lib/payments";
import { isValidCompanyRate } from "@/lib/commission";
import { locationSchema } from "@/lib/forms";

// Server actions of the administration area. Each one first requires the ADMIN role (read from the database); the
// services check it again. `returnTo` is only accepted when it points inside /admin.

const ADMIN_PATH = /^\/admin(\/[A-Za-z0-9_\-[\]]*)*(\?[A-Za-z0-9_\-=&.%]*)?$/;
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

function back(returnTo: FormDataEntryValue | null, fallback: string, params: Record<string, string | number>): never {
  const base = typeof returnTo === "string" && ADMIN_PATH.test(returnTo) ? returnTo : fallback;
  const [path, query = ""] = base.split("?");
  const search = new URLSearchParams(query);
  for (const k of ["ok", "error", "unpaid", "upcoming", "docs"]) search.delete(k);
  for (const [k, v] of Object.entries(params)) search.set(k, String(v));
  redirect(`${path}?${search.toString()}`);
}

// ---- bookings -------------------------------------------------------------------------------------------------

const STATUSES: BookingStatus[] = ["CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED"];

export async function transitionBookingAction(formData: FormData) {
  const me = await requireRole("ADMIN");
  const to = STATUSES.find((s) => s === formData.get("to"));
  const id = text(formData.get("bookingId"));
  if (!to) back(formData.get("returnTo"), `/admin/bookings/${id}`, { error: "INVALID_TRANSITION" });
  const result = await transitionBooking(me.id, id, to, { reason: text(formData.get("reason")) });
  revalidatePath("/admin", "layout");
  if (!result.ok) back(formData.get("returnTo"), `/admin/bookings/${id}`, { error: result.code });
  back(formData.get("returnTo"), `/admin/bookings/${id}`, { ok: to, ...(result.warnings.unpaidBani ? { unpaid: result.warnings.unpaidBani } : {}) });
}

const paymentSchema = z.object({
  bookingId: z.string().min(1),
  amount: z.coerce.number().positive().max(1_000_000),
  currency: z.enum(["RON", "EUR"]),
  method: z.enum(["CASH", "CARD_POS", "BANK_TRANSFER"]),
});

// Payments are recorded by hand (cash, card terminal, transfer). The RON value uses the configured EUR rate, which is
// stored with the payment. Nothing is ever marked as paid automatically.
export async function recordPaymentAction(formData: FormData) {
  await requireRole("ADMIN");
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(formData.get("returnTo"), "/admin/bookings", { error: "PAYMENT_INVALID" });
  const { bookingId, amount, currency, method } = parsed.data;
  const exists = await prisma.booking.findUnique({ where: { id: bookingId }, select: { status: true } });
  if (!exists || exists.status === "CANCELLED") back(formData.get("returnTo"), "/admin/bookings", { error: "PAYMENT_BOOKING" });
  const paidMinor = Math.round(amount * 100);
  const rate = eurRonRate();
  await prisma.payment.create({ data: { bookingId, method, currency: parseCurrency(currency), paidAmount: paidMinor, exchangeRate: currency === "EUR" ? rate : null, amount: toRonBani(paidMinor, currency, rate) } });
  revalidatePath("/admin", "layout");
  back(formData.get("returnTo"), `/admin/bookings/${bookingId}`, { ok: "payment" });
}

// ---- vehicles -------------------------------------------------------------------------------------------------

const VEHICLE_STATUSES: VehicleStatus[] = ["AVAILABLE", "IN_SERVICE", "RETIRED"];

export async function changeVehicleStatusAction(formData: FormData) {
  const me = await requireRole("ADMIN");
  const id = text(formData.get("vehicleId"));
  const to = VEHICLE_STATUSES.find((s) => s === formData.get("to"));
  if (!to) back(formData.get("returnTo"), `/admin/vehicles/${id}`, { error: "INVALID_TRANSITION" });
  const result = await changeVehicleStatus(me.id, id, to);
  revalidatePath("/", "layout");
  if (!result.ok) back(formData.get("returnTo"), `/admin/vehicles/${id}`, { error: result.code });
  back(formData.get("returnTo"), `/admin/vehicles/${id}`, { ok: `status_${to}`, upcoming: result.warnings.upcomingBookings, docs: result.warnings.documents.length });
}

export async function moderateListingAction(formData: FormData) {
  const me = await requireRole("ADMIN");
  const decision = formData.get("decision") === "approve" ? "APPROVED" : "REJECTED";
  const result = await moderateListing(me.id, text(formData.get("vehicleId")), decision);
  revalidatePath("/", "layout");
  back(formData.get("returnTo"), "/admin/vehicles", result.ok ? { ok: decision === "APPROVED" ? "approved" : "rejected" } : { error: result.code });
}

// ---- users, finance, locations ---------------------------------------------------------------------------------

export async function changeRoleAction(formData: FormData) {
  const me = await requireRole("ADMIN");
  const parsed = z.object({ userId: z.string().min(1), role: z.nativeEnum(Role) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/users?error=NOT_FOUND");
  const result = await changeUserRole(me.id, parsed.data.userId, parsed.data.role);
  revalidatePath("/admin", "layout");
  if (!result.ok) redirect(`/admin/users?error=${result.code}${result.count != null ? `&n=${result.count}` : ""}`);
  redirect(`/admin/users?ok=1${result.owedBani > 0 ? `&owed=${result.owedBani}` : ""}`);
}

export async function setCompanyRateAction(formData: FormData) {
  await requireRole("ADMIN");
  const parsed = z.object({ ownerId: z.string().min(1), percent: z.coerce.number().min(0).max(100) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/payouts?error=rate");
  const bps = Math.round(parsed.data.percent * 100);
  // Only rental companies have a configurable rate, and never below 5%. Checked again here on the server.
  if (!isValidCompanyRate(bps)) redirect("/admin/payouts?error=rate");
  const updated = await prisma.user.updateMany({ where: { id: parsed.data.ownerId, role: "RENTAL_COMPANY" }, data: { commissionBps: bps } });
  if (updated.count !== 1) redirect("/admin/payouts?error=not_company");
  revalidatePath("/admin/payouts");
  redirect("/admin/payouts?ok=rate");
}

export async function recordPayoutAction(formData: FormData) {
  await requireRole("ADMIN");
  const parsed = z.object({ ownerId: z.string().min(1), amountRon: z.coerce.number().positive().max(10_000_000), note: z.string().trim().max(200).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/payouts?error=payout");
  const owner = await prisma.user.findUnique({ where: { id: parsed.data.ownerId }, select: { role: true } });
  if (!owner || (owner.role !== "OWNER" && owner.role !== "RENTAL_COMPANY")) redirect("/admin/payouts?error=payout");
  await prisma.payout.create({ data: { ownerId: parsed.data.ownerId, amount: Math.round(parsed.data.amountRon * 100), note: parsed.data.note || null } });
  revalidatePath("/admin/payouts");
  redirect("/admin/payouts?ok=payout");
}

export async function saveLocationAction(formData: FormData) {
  await requireRole("ADMIN");
  const parsed = locationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/locations?error=invalid");
  await prisma.location.upsert({ where: { name: parsed.data.name }, update: parsed.data, create: parsed.data });
  revalidatePath("/", "layout");
  redirect("/admin/locations?ok=saved");
}

