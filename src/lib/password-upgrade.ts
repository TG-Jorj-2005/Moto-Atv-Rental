import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";

// Checks a login password against the stored hash and, when the hash is an old bcrypt one (or has weaker scrypt
// parameters), replaces it with a current hash. The replacement is a compare-and-set: it only happens while the stored
// hash is still the one that was verified, so a password changed (or an upgrade made by a parallel login) in the
// meantime is never overwritten, and several simultaneous logins of one user all succeed.
export async function verifyAndUpgrade(user: { id: string; passwordHash: string }, password: string): Promise<boolean> {
  const check = await verifyPassword(password, user.passwordHash);
  if (!check.valid) return false;
  if (check.needsRehash) {
    const upgraded = await hashPassword(password);
    await prisma.user.updateMany({ where: { id: user.id, passwordHash: user.passwordHash }, data: { passwordHash: upgraded } });
  }
  return true;
}
