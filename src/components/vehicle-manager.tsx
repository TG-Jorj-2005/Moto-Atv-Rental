import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ExternalLink, ImagePlus, Star, Trash2, Wrench } from "lucide-react";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/current-user";
import { getCurrency } from "@/lib/currency-server";
import { formatMoney } from "@/lib/currency";
import { formatLocalDate, formatLocalDateTime } from "@/lib/business-time";
import { documentWarnings } from "@/lib/maintenance-rules";
import { displayStatus } from "@/lib/vehicle-rules";
import { creditForPath, photoUrl } from "@/lib/photos";
import { MAX_PHOTOS_PER_VEHICLE } from "@/lib/uploads";
import { VEHICLE_ERROR, VEHICLE_OK } from "@/lib/vehicle-messages";
import { addMaintenanceAction, deleteMaintenanceAction, deletePhotoAction, makeCoverAction, resubmitListingAction, saveVehicleDetailsAction, uploadPhotosAction } from "@/app/actions/vehicle";
import { BookingStatusBadge, ListingStatusBadge, VehicleStatusBadge } from "@/components/status-badges";
import { VehicleFormFields } from "@/components/vehicle-form-fields";
import { TYPE_LABEL } from "@/components/vehicle-card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState, LinkTabs } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const TABS = ["details", "photos", "maintenance", "bookings"] as const;
type Tab = (typeof TABS)[number];
const DOC = { ITP: "ITP (technical inspection)", RCA: "RCA (insurance)", SERVICE: "Service", OTHER: "Other" } as const;

// The management screen of one vehicle, shared by the provider area (own vehicles only) and the admin area (any
// vehicle). `children` is where the admin area adds its own controls (status, moderation).
export async function VehicleManager({ vehicleId, user, basePath, tab: tabParam, ok, error, children }: { vehicleId: string; user: CurrentUser; basePath: "/provider" | "/admin"; tab?: string; ok?: string; error?: string; children?: React.ReactNode }) {
  const tab: Tab = TABS.find((t) => t === tabParam) ?? "details";
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, ...(user.role === "ADMIN" ? {} : { ownerId: user.id }) }, // somebody else's vehicle does not exist
    include: {
      location: true,
      photos: { orderBy: { position: "asc" } },
      maintenance: { orderBy: [{ performedAt: "desc" }, { id: "desc" }] },
    },
  });
  if (!vehicle) notFound();

  const now = new Date();
  const [currency, locations, bookings, active] = await Promise.all([
    getCurrency(),
    prisma.location.findMany({ orderBy: [{ county: "asc" }, { name: "asc" }], select: { id: true, name: true, city: true, county: true } }),
    prisma.booking.findMany({ where: { vehicleId }, orderBy: { startAt: "desc" }, take: 50, select: { id: true, startAt: true, endAt: true, status: true, totalPrice: true, ownerAmount: true, commissionAmount: true, customer: { select: { fullName: true } } } }),
    prisma.booking.count({ where: { vehicleId, status: "ACTIVE" } }),
  ]);
  const warnings = documentWarnings(vehicle.maintenance, now);
  const here = `${basePath}/vehicles/${vehicleId}`;
  const returnTo = (t: Tab) => `${here}?tab=${t}`;
  const tabHref = (t: Tab) => `${here}?tab=${t}`;

  return (
    <>
      <Link href={`${basePath}/vehicles`} className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-soft hover:underline"><ArrowLeft aria-hidden className="size-4" /> {basePath === "/admin" ? "All vehicles" : "My vehicles"}</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{vehicle.name}</h1>
            <ListingStatusBadge status={vehicle.listingStatus} />
            <VehicleStatusBadge status={displayStatus(vehicle.status, active > 0)} />
            <Badge>{TYPE_LABEL[vehicle.type]}</Badge>
          </div>
          <p className="text-sm text-muted">{vehicle.plate}{vehicle.location ? ` · ${vehicle.location.name}, ${vehicle.location.city}` : ""}</p>
        </div>
        {vehicle.listingStatus === "APPROVED" && vehicle.status !== "RETIRED" && <Link href={`/vehicles/${vehicle.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Public page <ExternalLink aria-hidden className="size-3.5" /></Link>}
      </div>

      {ok && <Alert tone="success">{VEHICLE_OK[ok] ?? "Done."}</Alert>}
      {error && <Alert tone="error">{VEHICLE_ERROR[error] ?? "Something went wrong."}</Alert>}
      {vehicle.listingStatus === "PENDING" && <Alert tone="info" title="Awaiting approval">Customers cannot see this listing until an administrator approves it.</Alert>}
      {vehicle.listingStatus === "REJECTED" && (
        <Alert tone="error" title="This listing was rejected">
          <form action={resubmitListingAction} className="mt-2 flex flex-wrap items-center gap-3">
            <input type="hidden" name="vehicleId" value={vehicle.id} /><input type="hidden" name="returnTo" value={returnTo(tab)} />
            <span>Fix the details or the photos, then send it for review again.</span>
            <Button size="sm" variant="dark">Send for approval again</Button>
          </form>
        </Alert>
      )}
      {children}

      <LinkTabs items={[
        { href: tabHref("details"), label: "Details", active: tab === "details" },
        { href: tabHref("photos"), label: "Photos", active: tab === "photos", count: vehicle.photos.length },
        { href: tabHref("maintenance"), label: "Maintenance", active: tab === "maintenance", count: warnings.length || undefined },
        { href: tabHref("bookings"), label: "Bookings", active: tab === "bookings", count: bookings.length },
      ]} />

      {tab === "details" && (
        <Card>
          <CardContent className="p-6">
            <form action={saveVehicleDetailsAction} className="space-y-6">
              <input type="hidden" name="vehicleId" value={vehicle.id} /><input type="hidden" name="returnTo" value={returnTo("details")} />
              <VehicleFormFields mode="edit" locations={locations} defaults={vehicle} />
              {user.role !== "ADMIN" && <p className="text-xs text-muted">Changing the name or the description of an approved listing sends it for approval again. Prices only affect new bookings.</p>}
              <Button size="lg">Save changes</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {tab === "photos" && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Add photos</CardTitle><p className="text-sm text-muted">JPEG, PNG or WebP, up to 5 MB each, at most {MAX_PHOTOS_PER_VEHICLE} per vehicle ({vehicle.photos.length} used). The first photo is the cover.</p></CardHeader>
            <CardContent>
              <form action={uploadPhotosAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="vehicleId" value={vehicle.id} /><input type="hidden" name="returnTo" value={returnTo("photos")} />
                <Field label="Photos" htmlFor="photos" className="min-w-64 flex-1"><Input id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple required className="h-auto py-2" /></Field>
                <Button><ImagePlus aria-hidden className="size-4" /> Upload</Button>
              </form>
              {user.role !== "ADMIN" && vehicle.listingStatus === "APPROVED" && <p className="mt-3 text-xs text-muted">New photos are reviewed: an approved listing goes back to approval when you add photos.</p>}
            </CardContent>
          </Card>
          {vehicle.photos.length === 0 ? <EmptyState title="No photos yet" description="Listings with photos get more bookings." /> : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {vehicle.photos.map((p, i) => {
                const credit = creditForPath(p.path);
                return (
                  <li key={p.id}>
                    <Card className="overflow-hidden">
                      <div className="relative aspect-[4/3] bg-surface-3"><img src={photoUrl(p.path)} alt={`${vehicle.name}, photo ${i + 1}`} loading="lazy" className="size-full object-cover" />{i === 0 && <Badge tone="dark" className="absolute left-2 top-2"><Star aria-hidden className="size-3" /> Cover</Badge>}</div>
                      <CardContent className="space-y-2 p-3">
                        {credit && <p className="text-xs text-muted">Demo photo: {credit.author}, {credit.license}</p>}
                        <div className="flex gap-2">
                          {i > 0 && <form action={makeCoverAction}><input type="hidden" name="photoId" value={p.id} /><input type="hidden" name="returnTo" value={returnTo("photos")} /><Button size="sm" variant="outline">Make cover</Button></form>}
                          <form action={deletePhotoAction}><input type="hidden" name="photoId" value={p.id} /><input type="hidden" name="returnTo" value={returnTo("photos")} /><Button size="sm" variant="dangerOutline" aria-label={`Remove photo ${i + 1}`}><Trash2 aria-hidden className="size-3.5" /> Remove</Button></form>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === "maintenance" && (
        <div className="space-y-6">
          {warnings.length > 0 ? (
            <Alert tone="warning" title="Needs attention">
              <ul className="mt-1 space-y-0.5">
                {warnings.map((w, i) => (
                  <li key={i}>
                    <strong>{DOC[w.type]}</strong>: {w.state === "NO_RECORD" ? "no record yet" : w.state === "OVERDUE" ? `overdue since ${formatLocalDate(w.dueAt!)}` : `due on ${formatLocalDate(w.dueAt!)}`}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs">A document deadline never blocks bookings by itself. Putting a vehicle in service is a decision of an administrator.</p>
            </Alert>
          ) : (
            <Alert tone="success">ITP and RCA are recorded and valid.</Alert>
          )}
          <Card>
            <CardHeader><CardTitle>Record a service, ITP, RCA or other work</CardTitle></CardHeader>
            <CardContent>
              <form action={addMaintenanceAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="vehicleId" value={vehicle.id} /><input type="hidden" name="returnTo" value={returnTo("maintenance")} />
                <Field label="Type" htmlFor="m-type"><Select id="m-type" name="type" defaultValue="ITP"><option value="ITP">ITP</option><option value="RCA">RCA</option><option value="SERVICE">Service</option><option value="OTHER">Other</option></Select></Field>
                <Field label="Done on" htmlFor="m-done"><Input id="m-done" name="performedOn" type="date" required /></Field>
                <Field label="Next deadline" htmlFor="m-next" hint="Optional."><Input id="m-next" name="nextDueOn" type="date" /></Field>
                <Field label="Notes" htmlFor="m-notes" className="sm:col-span-2 lg:col-span-4"><Textarea id="m-notes" name="notes" maxLength={500} className="min-h-16" /></Field>
                <div className="sm:col-span-2 lg:col-span-4"><Button><Wrench aria-hidden className="size-4" /> Add record</Button></div>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>History</CardTitle></CardHeader>
            <CardContent className="p-0">
              {vehicle.maintenance.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted">No records yet.</p> : (
                <Table>
                  <THead><TR><TH>Type</TH><TH>Done on</TH><TH>Next deadline</TH><TH>Notes</TH><TH><span className="sr-only">Actions</span></TH></TR></THead>
                  <TBody>
                    {vehicle.maintenance.map((m) => (
                      <TR key={m.id}>
                        <TD className="font-medium">{DOC[m.type]}</TD>
                        <TD>{formatLocalDate(m.performedAt)}</TD>
                        <TD>{m.nextDueAt ? formatLocalDate(m.nextDueAt) : "—"}</TD>
                        <TD className="max-w-xs truncate text-muted" title={m.notes ?? ""}>{m.notes ?? "—"}</TD>
                        <TD><form action={deleteMaintenanceAction}><input type="hidden" name="recordId" value={m.id} /><input type="hidden" name="returnTo" value={returnTo("maintenance")} /><Button size="sm" variant="dangerOutline" aria-label="Remove record"><Trash2 aria-hidden className="size-3.5" /></Button></form></TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "bookings" && (
        <Card>
          <CardContent className="p-0">
            {bookings.length === 0 ? <p className="px-5 py-10 text-center text-sm text-muted">No bookings for this vehicle yet.</p> : (
              <Table>
                <THead><TR><TH>Customer</TH><TH>Period (Bucharest time)</TH><TH>Status</TH><TH className="text-right">Total</TH><TH className="text-right">Owner share</TH></TR></THead>
                <TBody>
                  {bookings.map((b) => (
                    <TR key={b.id}>
                      <TD className="font-medium">{b.customer.fullName}</TD>
                      <TD className="whitespace-nowrap text-muted">{formatLocalDateTime(b.startAt)} → {formatLocalDateTime(b.endAt)}</TD>
                      <TD><BookingStatusBadge status={b.status} /></TD>
                      <TD className="text-right">{formatMoney(b.totalPrice, currency)}</TD>
                      <TD className="text-right font-medium">{b.ownerAmount != null ? formatMoney(b.ownerAmount, currency) : "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
      {warnings.length > 0 && tab !== "maintenance" && (
        <p className="flex items-center gap-2 text-sm text-warning"><AlertTriangle aria-hidden className="size-4" /> {warnings.length} document{warnings.length > 1 ? "s" : ""} need attention. <Link className="font-semibold underline" href={tabHref("maintenance")}>Open maintenance</Link></p>
      )}
    </>
  );
}
