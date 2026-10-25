import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

export type CurrentUser = { id: string; email: string; name: string; role: Role };

// The session token only proves WHO the user is (its id). Everything used for authorization,
// especially the role, is read from the database on each request, so a demotion takes effect
// immediately and old role claims inside a token are never trusted. A deleted user yields null.
export async function loadUserById(id: string): Promise<CurrentUser | null> {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, role: true } });
  return user ? { ...user, name: user.name || user.email } : null;
}
