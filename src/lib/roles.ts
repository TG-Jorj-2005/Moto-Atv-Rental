import type { Role } from "@prisma/client";

// Hierarchy: CUSTOMER < OWNER < RENTAL_COMPANY < ADMIN. Promotions are free, demotions have extra rules (see users.ts).
export const ROLE_RANK: Record<Role, number> = { CUSTOMER: 0, OWNER: 1, RENTAL_COMPANY: 2, ADMIN: 3 };

// Roles a visitor may pick at registration. ADMIN is never self-assigned.
export const REGISTERABLE_ROLES = ["CUSTOMER", "OWNER", "RENTAL_COMPANY"] as const satisfies readonly Role[];

export const ROLE_LABEL: Record<Role, string> = {
  CUSTOMER: "Customer",
  OWNER: "Owner",
  RENTAL_COMPANY: "Rental company",
  ADMIN: "Admin",
};

export const canListVehicles = (role: Role) => role === "OWNER" || role === "RENTAL_COMPANY";
export const canRequestQuotes = (role: Role) => role === "RENTAL_COMPANY";
// Admins manage the platform; they do not rent.
export const canRent = (role: Role) => role !== "ADMIN";

export const isDemotion = (from: Role, to: Role) => ROLE_RANK[to] < ROLE_RANK[from];

export function homePathFor(role: Role): string {
  if (role === "ADMIN") return "/admin";
  if (role === "RENTAL_COMPANY") return "/quotes";
  if (role === "OWNER") return "/owner";
  return "/";
}
