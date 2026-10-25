import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runTransaction } from "@/lib/tx";
import { ownerSummaries } from "@/lib/earnings";
import { isDemotion } from "@/lib/roles";

export type RoleChangeFailure =
  | "NOT_ADMIN"
  | "SELF"
  | "NOT_FOUND"
  | "NO_CHANGE"
  | "LAST_ADMIN"
  | "VEHICLES_NOT_RETIRED"
  | "OPEN_QUOTES";

export type RoleChangeResult =
  | { ok: true; from: Role; to: Role; owedBani: number }
  | { ok: false; code: RoleChangeFailure; count?: number };

type LockedUser = { id: string; role: Role };

// Changes a user's role. Everything is decided inside one transaction that first locks the target row
// and all ADMIN rows (always in id order, so concurrent calls cannot deadlock). A concurrent call that
// waited on those locks re-reads the new state, so two admins can never demote each other into zero admins,
// and a stale actor is refused.
export async function changeUserRole(actorId: string, targetId: string, newRole: Role): Promise<RoleChangeResult> {
  const result = await runTransaction(async (tx): Promise<RoleChangeResult> => {
    const locked = await tx.$queryRaw<LockedUser[]>`
      SELECT id, role::text AS role FROM users
      WHERE role = 'ADMIN' OR id IN (${actorId}, ${targetId})
      ORDER BY id FOR UPDATE`;
    const actor = locked.find((u) => u.id === actorId);
    const target = locked.find((u) => u.id === targetId);

    if (!actor || actor.role !== "ADMIN") return { ok: false, code: "NOT_ADMIN" };
    if (actorId === targetId) return { ok: false, code: "SELF" };
    if (!target) return { ok: false, code: "NOT_FOUND" };
    if (target.role === newRole) return { ok: false, code: "NO_CHANGE" };

    if (isDemotion(target.role, newRole)) {
      const admins = locked.filter((u) => u.role === "ADMIN").length;
      if (target.role === "ADMIN" && admins <= 1) return { ok: false, code: "LAST_ADMIN" };

      const active = await tx.vehicle.count({ where: { ownerId: targetId, status: { not: "RETIRED" } } });
      if (active > 0) return { ok: false, code: "VEHICLES_NOT_RETIRED", count: active };

      if (target.role === "RENTAL_COMPANY") {
        const open = await tx.quoteRequest.count({ where: { userId: targetId, status: "QUOTED" } });
        if (open > 0) return { ok: false, code: "OPEN_QUOTES", count: open };
      }
    }

    await tx.user.update({ where: { id: targetId }, data: { role: newRole } });
    return { ok: true, from: target.role, to: newRole, owedBani: 0 };
  });

  // Owed balances never block a demotion; they are only reported (financial records stay untouched).
  if (result.ok && isDemotion(result.from, result.to)) {
    const [summary] = await ownerSummaries(targetId);
    return { ...result, owedBani: Math.max(0, summary?.balance ?? 0) };
  }
  return result;
}

export type RoleChangePreview = { nonRetiredVehicles: number; quotedQuotes: number; owedBani: number };

// Read-only facts for the confirmation screen. The real rules are enforced again in changeUserRole.
export async function previewRoleChange(targetId: string): Promise<RoleChangePreview> {
  const [nonRetiredVehicles, quotedQuotes, summaries] = await Promise.all([
    prisma.vehicle.count({ where: { ownerId: targetId, status: { not: "RETIRED" } } }),
    prisma.quoteRequest.count({ where: { userId: targetId, status: "QUOTED" } }),
    ownerSummaries(targetId),
  ]);
  return { nonRetiredVehicles, quotedQuotes, owedBani: Math.max(0, summaries[0]?.balance ?? 0) };
}
