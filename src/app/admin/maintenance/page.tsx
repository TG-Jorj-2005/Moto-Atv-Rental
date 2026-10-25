import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { formatLocalDate } from "@/lib/business-time";
import { documentWarnings, type DocumentWarning } from "@/lib/maintenance-rules";
import { displayStatus } from "@/lib/vehicle-rules";
import { VehicleStatusBadge } from "@/components/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Maintenance" };
export const dynamic = "force-dynamic";

const DOC = { ITP: "ITP", RCA: "RCA", SERVICE: "Service", OTHER: "Other" } as const;
const RANK = { OVERDUE: 0, NO_RECORD: 1, DUE_SOON: 2, OK: 3 } as const;

function WarningBadge({ w }: { w: DocumentWarning }) {
  if (w.state === "NO_RECORD") return <Badge tone="danger">{DOC[w.type]}: no record</Badge>;
  if (w.state === "OVERDUE") return <Badge tone="danger">{DOC[w.type]}: overdue since {formatLocalDate(w.dueAt!)}</Badge>;
  return <Badge tone="warning">{DOC[w.type]}: due {formatLocalDate(w.dueAt!)}</Badge>;
}

export default async function AdminMaintenance() {
  await requireRole("ADMIN");
  const now = new Date();
  const [vehicles, active] = await Promise.all([
    prisma.vehicle.findMany({
      where: { status: { not: "RETIRED" }, listingStatus: { not: "REJECTED" } },
      select: { id: true, name: true, plate: true, status: true, owner: { select: { name: true } }, maintenance: { select: { type: true, performedAt: true, nextDueAt: true } } },
    }),
    prisma.booking.groupBy({ by: ["vehicleId"], where: { status: "ACTIVE" }, _count: true }),
  ]);
  const activeSet = new Set(active.map((a) => a.vehicleId));
  const rows = vehicles
    .map((v) => ({ v, warnings: documentWarnings(v.maintenance, now).sort((a, b) => RANK[a.state] - RANK[b.state]) }))
    .filter((r) => r.warnings.length > 0)
    .sort((a, b) => RANK[a.warnings[0]!.state] - RANK[b.warnings[0]!.state] || a.v.name.localeCompare(b.v.name));

  return (
    <>
      <PageHeader title="Maintenance and documents" description="Vehicles whose ITP, RCA or service deadlines are overdue, due within 30 days or missing. A warning never blocks a booking by itself: putting a vehicle in service is your decision, made on the vehicle page." />
      {rows.length === 0 ? <Alert tone="success">Every active vehicle has valid ITP and RCA records.</Alert> : (
        <Card>
          <Table>
            <THead><TR><TH>Vehicle</TH><TH>Offered by</TH><TH>Status</TH><TH>Needs attention</TH><TH><span className="sr-only">Open</span></TH></TR></THead>
            <TBody>
              {rows.map(({ v, warnings }) => (
                <TR key={v.id}>
                  <TD><span className="font-medium">{v.name}</span><span className="block text-xs text-stone-600">{v.plate}</span></TD>
                  <TD className="text-stone-700">{v.owner?.name ?? "Platform fleet"}</TD>
                  <TD><VehicleStatusBadge status={displayStatus(v.status, activeSet.has(v.id))} /></TD>
                  <TD><div className="flex flex-wrap gap-1.5">{warnings.map((w, i) => <WarningBadge key={i} w={w} />)}</div></TD>
                  <TD><Link href={`/admin/vehicles/${v.id}?tab=maintenance`} className={buttonVariants({ variant: "outline", size: "sm" })}>Open</Link></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
