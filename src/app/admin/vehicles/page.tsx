import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import type { ListingStatus, Prisma, VehicleStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { displayStatus } from "@/lib/vehicle-rules";
import { documentWarnings } from "@/lib/maintenance-rules";
import { coverOf } from "@/lib/photos";
import { moderateListingAction } from "@/app/actions/admin";
import { VEHICLE_OK } from "@/lib/vehicle-messages";
import { ListingStatusBadge, VehicleStatusBadge } from "@/components/status-badges";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Vehicles" };
export const dynamic = "force-dynamic";

const LISTINGS: ListingStatus[] = ["PENDING", "APPROVED", "REJECTED"];
const STATUSES: VehicleStatus[] = ["AVAILABLE", "IN_SERVICE", "RETIRED"];
const KINDS = { platform: "Platform fleet", OWNER: "Individual owners", RENTAL_COMPANY: "Rental companies" } as const;
const PAGE = 25;

export default async function AdminVehicles({ searchParams }: { searchParams: Promise<{ q?: string; listing?: string; status?: string; kind?: string; page?: string; ok?: string; error?: string }> }) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const listing = LISTINGS.find((l) => l === sp.listing);
  const status = STATUSES.find((s) => s === sp.status);
  const kind = (Object.keys(KINDS) as (keyof typeof KINDS)[]).find((k) => k === sp.kind);
  const page = Math.max(1, Math.min(10_000, Number.parseInt(sp.page ?? "1", 10) || 1));
  const now = new Date();
  const where: Prisma.VehicleWhereInput = {
    ...(listing ? { listingStatus: listing } : {}),
    ...(status ? { status } : {}),
    ...(kind === "platform" ? { ownerId: null } : kind ? { owner: { role: kind } } : {}),
    ...(sp.q ? { OR: [{ name: { contains: sp.q.slice(0, 60), mode: "insensitive" } }, { plate: { contains: sp.q.slice(0, 60), mode: "insensitive" } }] } : {}),
  };
  const [total, vehicles] = await Promise.all([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * PAGE, take: PAGE,
      include: { owner: { select: { name: true, role: true } }, location: { select: { name: true } }, photos: { orderBy: { position: "asc" }, take: 1, select: { path: true } }, maintenance: { select: { type: true, performedAt: true, nextDueAt: true } } },
    }),
  ]);
  const ids = vehicles.map((v) => v.id);
  const [active, upcoming] = ids.length ? await Promise.all([
    prisma.booking.groupBy({ by: ["vehicleId"], where: { vehicleId: { in: ids }, status: "ACTIVE" }, _count: true }),
    prisma.booking.groupBy({ by: ["vehicleId"], where: { vehicleId: { in: ids }, status: { in: ["PENDING", "CONFIRMED"] }, endAt: { gt: now } }, _count: true }),
  ]) : [[], []];
  const activeSet = new Set(active.map((a) => a.vehicleId));
  const upMap = new Map(upcoming.map((u) => [u.vehicleId, u._count]));
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries({ q: sp.q, listing, status, kind })) if (v) q.set(k, v); if (p > 1) q.set("page", String(p)); const s = q.toString(); return `/admin/vehicles${s ? `?${s}` : ""}`; };
  const here = qs(page);

  return (
    <>
      <PageHeader title="Vehicles" description="Every listing of the marketplace. Approve new listings here, and open a vehicle to change its status, photos or maintenance." actions={<Link href="/admin/vehicles/new" className={buttonVariants()}><Plus aria-hidden className="size-4" /> Add a platform vehicle</Link>} />
      {sp.ok && <Alert tone="success">{VEHICLE_OK[sp.ok] ?? (sp.ok === "approved" ? "The listing was approved." : sp.ok === "rejected" ? "The listing was rejected." : "Done.")}</Alert>}
      {sp.error && <Alert tone="error">The action was refused.</Alert>}
      <Card>
        <CardContent className="p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium">Search<Input name="q" defaultValue={sp.q ?? ""} placeholder="Name or plate" maxLength={60} /></label>
            <label className="flex flex-col gap-1 text-sm font-medium">Listing<Select name="listing" defaultValue={listing ?? ""} className="w-44"><option value="">All</option>{LISTINGS.map((l) => <option key={l} value={l}>{l.charAt(0) + l.slice(1).toLowerCase()}</option>)}</Select></label>
            <label className="flex flex-col gap-1 text-sm font-medium">Status<Select name="status" defaultValue={status ?? ""} className="w-44"><option value="">All</option><option value="AVAILABLE">Available</option><option value="IN_SERVICE">In service</option><option value="RETIRED">Retired</option></Select></label>
            <label className="flex flex-col gap-1 text-sm font-medium">Offered by<Select name="kind" defaultValue={kind ?? ""} className="w-52"><option value="">Everyone</option>{Object.entries(KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</Select></label>
            <Button variant="dark">Filter</Button>
            <Link href="/admin/vehicles" className={buttonVariants({ variant: "ghost" })}>Reset</Link>
          </form>
        </CardContent>
      </Card>

      {vehicles.length === 0 ? <EmptyState title="No vehicles match" /> : (
        <Card>
          <Table>
            <THead><TR><TH>Vehicle</TH><TH>Offered by</TH><TH>Listing</TH><TH>Status</TH><TH>Upcoming</TH><TH><span className="sr-only">Actions</span></TH></TR></THead>
            <TBody>
              {vehicles.map((v) => {
                const cover = coverOf(v.photos);
                const warnings = documentWarnings(v.maintenance, now);
                return (
                  <TR key={v.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-stone-200">{cover && <img src={cover} alt="" loading="lazy" className="size-full object-cover" />}</div>
                        <div><Link href={`/admin/vehicles/${v.id}`} className="font-medium hover:underline">{v.name}</Link><span className="block text-xs text-stone-600">{v.plate} · {v.location?.name ?? "no location"}</span><span className="mt-1.5 flex flex-wrap gap-1.5 md:hidden"><ListingStatusBadge status={v.listingStatus} /><VehicleStatusBadge status={displayStatus(v.status, activeSet.has(v.id))} /></span></div>
                      </div>
                    </TD>
                    <TD className="text-stone-700">{v.owner ? <>{v.owner.name}<span className="block text-xs text-stone-600">{v.owner.role === "RENTAL_COMPANY" ? "Rental company" : "Owner"}</span></> : "Platform fleet"}</TD>
                    <TD><ListingStatusBadge status={v.listingStatus} /></TD>
                    <TD><VehicleStatusBadge status={displayStatus(v.status, activeSet.has(v.id))} />{warnings.length > 0 && <span className="mt-1 flex items-center gap-1 text-xs text-amber-900"><AlertTriangle aria-hidden className="size-3" /> {warnings.length} document{warnings.length > 1 ? "s" : ""}</span>}</TD>
                    <TD>{upMap.get(v.id) ?? 0}</TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-2">
                        {v.listingStatus === "PENDING" && (
                          <form action={moderateListingAction} className="flex gap-1.5">
                            <input type="hidden" name="vehicleId" value={v.id} /><input type="hidden" name="returnTo" value={here} />
                            <Button size="sm" name="decision" value="approve" aria-label={`Approve ${v.name}`}>Approve</Button>
                            <Button size="sm" variant="dangerOutline" name="decision" value="reject" aria-label={`Reject ${v.name}`}>Reject</Button>
                          </form>
                        )}
                        <Link href={`/admin/vehicles/${v.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Manage</Link>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          <Link aria-disabled={page <= 1} href={qs(page - 1)} className={buttonVariants({ variant: "outline", size: "sm", className: page <= 1 ? "pointer-events-none opacity-50" : "" })}>Previous</Link>
          <span className="text-sm text-stone-600">Page {page} of {pages} · {total} vehicles</span>
          <Link aria-disabled={page >= pages} href={qs(page + 1)} className={buttonVariants({ variant: "outline", size: "sm", className: page >= pages ? "pointer-events-none opacity-50" : "" })}>Next</Link>
        </nav>
      )}
    </>
  );
}
