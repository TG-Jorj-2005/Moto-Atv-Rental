// Authorization always uses the role stored in the database (see src/lib/current-user.ts), never the token.
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { loadUserById, type CurrentUser } from "@/lib/current-user";

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  return id ? loadUserById(id) : null;
});

// Server-side guard for role-restricted pages and actions.
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!roles.includes(user.role)) redirect("/forbidden");
  return user;
}
