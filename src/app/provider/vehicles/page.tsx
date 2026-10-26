import Link from "next/link";
import { AlertTriangle, Bike, Plus } from "lucide-react";
import { requireRole } from "@/lib/session";
import { getCurrency } from "@/lib/currency-server";
import { formatMoney } from "@/lib/currency";
import { coverOf } from "@/lib/photos";
import { ownerVehicleRows } from "@/lib/provider-data";
import { ListingStatusBadge, VehicleStatusBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TYPE_LABEL } from "@/components/vehicle-card";

export const metadata = { title: "My vehicles" };
export const dynamic = "force-dynamic";

export default async function ProviderVehicles() {
  const user = await requireRole("OWNER", "RENTAL_COMPANY");
  const [currency, vehicles] = await Promise.all([getCurrency(), ownerVehicleRows(user.id)]);
  return (
    <>
      <PageHeader title="My vehicles" description="Every new listing is reviewed by an administrator before customers can see it." actions={<Link href="/provider/vehicles/new" className={buttonVariants()}><Plus aria-hidden className="size-4" /> Add a vehicle</Link>} />
      {vehicles.length === 0 ? (
        <EmptyState icon={Bike} title="You have not listed any vehicle yet" description="Add your first ATV or motorcycle, upload photos and send it for approval." action={<Link href="/provider/vehicles/new" className={buttonVariants()}>Add a vehicle</Link>} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {vehicles.map((v) => {
            const cover = coverOf(v.photos);
            return (
              <li key={v.id}>
                <Card className="flex h-full flex-col overflow-hidden">
                  <div className="aspect-[16/9] bg-surface-3">{cover && <img src={cover} alt="" loading="lazy" className="size-full object-cover" />}</div>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-center gap-1.5"><ListingStatusBadge status={v.listingStatus} /><VehicleStatusBadge status={v.display} /><Badge>{TYPE_LABEL[v.type]}</Badge></div>
                    <div>
                      <h2 className="font-semibold">{v.name}</h2>
                      <p className="text-sm text-muted">{v.plate} · {v.location ? `${v.location.name}, ${v.location.city}` : "No location"}</p>
                    </div>
                    <p className="text-sm text-fg-soft">{formatMoney(v.dailyRate, currency)} / day · {v.upcomingBookings} upcoming booking{v.upcomingBookings === 1 ? "" : "s"}</p>
                    {v.warnings.length > 0 && <p className="flex items-center gap-1.5 text-sm font-medium text-warning"><AlertTriangle aria-hidden className="size-4" /> {v.warnings.length} document{v.warnings.length > 1 ? "s" : ""} need attention</p>}
                    <Link href={`/provider/vehicles/${v.id}`} className={buttonVariants({ variant: "outline", className: "mt-auto" })}>Manage</Link>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
