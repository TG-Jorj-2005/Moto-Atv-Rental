import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { previewRoleChange, type RoleChangeFailure } from "@/lib/users";
import { isDemotion, ROLE_LABEL, ROLE_RANK } from "@/lib/roles";
import { formatMoney } from "@/lib/currency";
import { changeRoleAction } from "@/app/actions/admin";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Role } from "@prisma/client";

export const metadata = { title: "Users and roles" };
export const dynamic = "force-dynamic";

const ROLES = Object.keys(ROLE_RANK) as Role[];

const REFUSALS: Record<RoleChangeFailure, (n?: number) => string> = {
  NOT_ADMIN: () => "Only an administrator can change roles.",
  SELF: () => "You cannot change your own role.",
  NOT_FOUND: () => "That user no longer exists.",
  NO_CHANGE: () => "The user already has that role.",
  LAST_ADMIN: () => "The last administrator cannot be demoted.",
  VEHICLES_NOT_RETIRED: (n) => `This user still has ${n ?? "some"} vehicle(s) that are not RETIRED. Retire all of them first; existing bookings are never cancelled automatically.`,
  OPEN_QUOTES: (n) => `This company still has ${n ?? "some"} offer(s) waiting for its answer. They must be accepted or declined first.`,
};

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ confirm?: string; to?: string; error?: string; n?: string; ok?: string; owed?: string; q?: string; role?: string }> }) {
  const admin = await requireRole("ADMIN");
  const { confirm, to, error, n, ok, owed, q, role } = await searchParams;
  const filterRole = ROLES.find((r) => r === role);
  const users = await prisma.user.findMany({
    where: { ...(filterRole ? { role: filterRole } : {}), ...(q ? { OR: [{ name: { contains: q.slice(0, 60), mode: "insensitive" } }, { email: { contains: q.slice(0, 60), mode: "insensitive" } }] } : {}) },
    orderBy: [{ role: "asc" }, { name: "asc" }, { id: "asc" }],
    take: 200,
    include: { _count: { select: { vehicles: true } } },
  });
  // The row of the confirmation may be outside the filtered list: load it on its own.
  const target = confirm ? (users.find((u) => u.id === confirm) ?? (await prisma.user.findUnique({ where: { id: confirm }, include: { _count: { select: { vehicles: true } } } }))) : null;
  const newRole = ROLES.find((r) => r === to);
  const preview = target && newRole ? await previewRoleChange(target.id) : null;
  const failure = error && error in REFUSALS ? REFUSALS[error as RoleChangeFailure](n ? Number(n) : undefined) : null;

  return (
    <>
      <PageHeader title="Users and roles" description="Only an administrator can change a role. You cannot change your own role or demote the last administrator." />
      {ok && <Alert tone="success">Role updated.{owed && Number(owed) > 0 && <> Warning: we still owe this user <strong>{formatMoney(Number(owed), "RON")}</strong>. The balance and the payments were not changed.</>}</Alert>}
      {failure && <Alert tone="error">{failure}</Alert>}

      {target && newRole && preview && (
        <Alert tone="warning" title={`Change ${target.name || target.email} from ${ROLE_LABEL[target.role]} to ${ROLE_LABEL[newRole]}?`}>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {isDemotion(target.role, newRole) ? (
              <>
                <li>A demotion is refused while the user has vehicles that are not RETIRED (now: {preview.nonRetiredVehicles}).</li>
                {target.role === "RENTAL_COMPANY" && <li>It is also refused while the company has offers waiting for an answer (now: {preview.quotedQuotes}).</li>}
                {preview.owedBani > 0 && <li><strong>Warning:</strong> we still owe this user {formatMoney(preview.owedBani, "RON")}. The balance and payments are not changed.</li>}
                <li>Existing bookings are never cancelled automatically.</li>
              </>
            ) : <li>A promotion takes effect immediately, on the next request of the user.</li>}
          </ul>
          <form action={changeRoleAction} className="mt-3 flex gap-2">
            <input type="hidden" name="userId" value={target.id} /><input type="hidden" name="role" value={newRole} />
            <Button variant="dark">Confirm the change</Button>
            <Link href="/admin/users" className={buttonVariants({ variant: "outline" })}>Cancel</Link>
          </form>
        </Alert>
      )}

      <Card>
        <CardContent className="p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm font-medium">Search<Input name="q" defaultValue={q ?? ""} placeholder="Name or email" maxLength={60} /></label>
            <label className="flex flex-col gap-1 text-sm font-medium">Role<Select name="role" defaultValue={filterRole ?? ""} className="w-48"><option value="">All roles</option>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></label>
            <Button variant="dark">Filter</Button>
            <Link href="/admin/users" className={buttonVariants({ variant: "ghost" })}>Reset</Link>
          </form>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <THead><TR><TH>User</TH><TH>Role</TH><TH>Vehicles</TH><TH>Change role</TH></TR></THead>
          <TBody>
            {users.length === 0 && <TR><TD colSpan={4} className="py-8 text-center text-muted">No users match.</TD></TR>}
            {users.map((u) => (
              <TR key={u.id}>
                <TD><span className="font-medium">{u.name || u.email}</span><span className="block text-xs text-muted">{u.email}</span></TD>
                <TD><Badge tone={u.role === "ADMIN" ? "dark" : "neutral"}>{ROLE_LABEL[u.role]}</Badge></TD>
                <TD>{u._count.vehicles}</TD>
                <TD>
                  {u.id === admin.id ? <span className="text-xs text-muted">You cannot change your own role</span> : (
                    <form method="get" className="flex gap-2">
                      <input type="hidden" name="confirm" value={u.id} />
                      {q && <input type="hidden" name="q" value={q} />}{filterRole && <input type="hidden" name="role" value={filterRole} />}
                      <Select name="to" defaultValue={u.role} aria-label={`New role of ${u.name || u.email}`} className="w-48">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>
                      <Button variant="outline" size="md">Change…</Button>
                    </form>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
