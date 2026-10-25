import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

// A user edits their own profile. The email is the identity of the account and never changes here.
export type ProfileResult = { ok: true } | { ok: false; code: "NOT_FOUND" | "INVALID" | "WRONG_PASSWORD" | "SAME_PASSWORD" };

export const PASSWORD_MIN_LENGTH = 8;

export async function updateProfile(userId: string, input: { name: string; phone: string }): Promise<ProfileResult> {
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (name.length < 2 || name.length > 100) return { ok: false, code: "INVALID" };
  if (phone && (phone.length < 7 || phone.length > 20)) return { ok: false, code: "INVALID" };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return { ok: false, code: "NOT_FOUND" };
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { name } });
    // The booking contact record is keyed by the account email; keep its name and phone in step.
    const email = user.email.toLowerCase();
    const existing = await tx.customer.findUnique({ where: { email } });
    if (existing) await tx.customer.update({ where: { email }, data: { fullName: name, ...(phone ? { phone } : {}) } });
    else if (phone) await tx.customer.create({ data: { email, fullName: name, phone } });
  });
  return { ok: true };
}

export async function changePassword(userId: string, current: string, next: string): Promise<ProfileResult> {
  if (next.length < PASSWORD_MIN_LENGTH || next.length > 100) return { ok: false, code: "INVALID" };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) return { ok: false, code: "NOT_FOUND" };
  if (!(await bcrypt.compare(current, user.passwordHash))) return { ok: false, code: "WRONG_PASSWORD" };
  if (current === next) return { ok: false, code: "SAME_PASSWORD" };
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(next, 12) } });
  return { ok: true };
}
