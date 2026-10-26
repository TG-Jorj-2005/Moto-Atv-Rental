import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { nextVehicleStatuses, VEHICLE_DENIAL_MESSAGES } from "@/lib/vehicle-rules";
import { changeVehicleStatusAction, moderateListingAction } from "@/app/actions/admin";
import { VehicleManager } from "@/components/vehicle-manager";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";

export const metadata = { title: "Manage vehicle" };
export const dynamic = "force-dynamic";

const LABEL = { AVAILABLE: "Available", IN_SERVICE: "In service", RETIRED: "Retired", RENTED: "Rented" } as const;

export default async function AdminVehiclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; ok?: string; error?: string; upcoming?: string; docs?: string; edit?: string }> }) {
  const user = await requireRole("ADMIN");
  const { id } = await params;
  const sp = await searchParams;
  const vehicle = await prisma.vehicle.findUnique({ where: { id }, select: { status: true, listingStatus: true, owner: { select: { id: true, name: true, email: true, role: true } } } });
  const targets = vehicle ? nextVehicleStatuses(vehicle.status) : [];
  const here = `/admin/vehicles/${id}?tab=${sp.tab ?? "details"}`;
  const statusOk = sp.ok?.startsWith("status_") ? sp.ok.slice(7) : null;
  const errorText = sp.error && sp.error in VEHICLE_DENIAL_MESSAGES ? VEHICLE_DENIAL_MESSAGES[sp.error as keyof typeof VEHICLE_DENIAL_MESSAGES] : null;

  return (
    <VehicleManager vehicleId={id} user={user} basePath="/admin" tab={sp.tab} edit={sp.edit} ok={statusOk ? undefined : sp.ok} error={errorText ? undefined : sp.error}>
      {statusOk && (
        <Alert tone="success" title={`The vehicle is now ${LABEL[statusOk as keyof typeof LABEL] ?? statusOk}`}>
          {Number(sp.upcoming) > 0 && <p><strong>{sp.upcoming} upcoming booking{Number(sp.upcoming) > 1 ? "s" : ""}</strong> still exist for this vehicle and were NOT cancelled. Review them in <Link className="underline" href="/admin/bookings">bookings</Link> and handle each one explicitly.</p>}
          {Number(sp.docs) > 0 && <p>{sp.docs} document deadline{Number(sp.docs) > 1 ? "s" : ""} need attention (see the Maintenance tab).</p>}
        </Alert>
      )}
      {errorText && <Alert tone="error">{errorText}</Alert>}
      {vehicle && (
        <Card>
          <CardHeader><CardTitle>Administration</CardTitle></CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm text-fg-soft">Stored status: <strong>{LABEL[vehicle.status]}</strong>. A vehicle that is out with a customer is shown as <em>Rented now</em>; that is derived from the handover and never stored. A vehicle in service or retired stays so until you change it here.</p>
              {targets.length > 0 ? (
                <form action={changeVehicleStatusAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="vehicleId" value={id} /><input type="hidden" name="returnTo" value={here} />
                  <Field label="Change status to" htmlFor="to" className="min-w-48">
                    <Select id="to" name="to" defaultValue={targets[0]}>{targets.map((t) => <option key={t} value={t}>{t === "AVAILABLE" ? "Available (leave the service)" : t === "IN_SERVICE" ? (vehicle.status === "RETIRED" ? "In service (reactivate)" : "In service") : "Retired"}</option>)}</Select>
                  </Field>
                  <Button variant="dark">Change status</Button>
                </form>
              ) : <p className="text-sm text-muted">No status change is possible.</p>}
              <p className="text-xs text-muted">Not possible while a booking of this vehicle is ACTIVE. Upcoming bookings are never cancelled automatically. A retired vehicle must go through "In service" before it can be available again.</p>
            </div>
            <div className="space-y-3 text-sm">
              <p>Offered by: {vehicle.owner ? <><strong>{vehicle.owner.name}</strong> ({vehicle.owner.email}, {vehicle.owner.role === "RENTAL_COMPANY" ? "rental company" : "individual owner"})</> : <strong>Platform fleet (no commission)</strong>}</p>
              {vehicle.listingStatus === "PENDING" && (
                <form action={moderateListingAction} className="flex gap-2">
                  <input type="hidden" name="vehicleId" value={id} /><input type="hidden" name="returnTo" value={here} />
                  <Button name="decision" value="approve">Approve the listing</Button>
                  <Button variant="dangerOutline" name="decision" value="reject">Reject</Button>
                </form>
              )}
              {vehicle.listingStatus === "APPROVED" && (
                <form action={moderateListingAction}><input type="hidden" name="vehicleId" value={id} /><input type="hidden" name="returnTo" value={here} /><Button variant="dangerOutline" name="decision" value="reject">Withdraw approval (reject)</Button></form>
              )}
              {vehicle.listingStatus === "REJECTED" && (
                <form action={moderateListingAction}><input type="hidden" name="vehicleId" value={id} /><input type="hidden" name="returnTo" value={here} /><Button name="decision" value="approve">Approve the listing</Button></form>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </VehicleManager>
  );
}
