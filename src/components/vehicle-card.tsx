import Link from "next/link";
import { Gauge, MapPin, Mountain, Users, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { VehicleCardData } from "@/lib/catalog";
import { coverOf } from "@/lib/photos";
import { formatMoney, type CurrencyCode } from "@/lib/currency";

export const TYPE_LABEL = { ATV: "ATV", MOTORCYCLE: "Motorcycle", SCOOTER: "Scooter" } as const;

export function offerKind(owner: { role: string } | null): string {
  return !owner ? "Platform fleet" : owner.role === "RENTAL_COMPANY" ? "Rental company" : "Private owner";
}

export function VehicleCard({ vehicle, currency }: { vehicle: VehicleCardData; currency: CurrencyCode }) {
  const cover = coverOf(vehicle.photos);
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-card transition-shadow hover:shadow-pop">
      <Link href={`/vehicles/${vehicle.id}`} className="relative block aspect-[4/3] overflow-hidden bg-stone-200" aria-label={`View ${vehicle.name}`}>
        {cover ? (
          // Plain <img>: uploaded photos are served from our own storage, so the image optimizer is not needed.
          <img src={cover} alt={vehicle.name} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <span className="grid size-full place-items-center text-stone-500"><Mountain aria-hidden className="size-10" /></span>
        )}
        <Badge tone="dark" className="absolute left-3 top-3">{TYPE_LABEL[vehicle.type]}</Badge>
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <h3 className="line-clamp-1 text-base font-semibold tracking-tight"><Link href={`/vehicles/${vehicle.id}`} className="hover:underline">{vehicle.name}</Link></h3>
          {vehicle.location && <p className="flex items-center gap-1 text-sm text-stone-600"><MapPin aria-hidden className="size-3.5 shrink-0" /> {vehicle.location.city}, {vehicle.location.county}</p>}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600" aria-label="Specifications">
          {vehicle.engineCc != null && <li className="flex items-center gap-1"><Gauge aria-hidden className="size-3.5" /> {vehicle.engineCc} cc</li>}
          {vehicle.powerHp != null && <li className="flex items-center gap-1"><Zap aria-hidden className="size-3.5" /> {vehicle.powerHp} hp</li>}
          {vehicle.seats != null && <li className="flex items-center gap-1"><Users aria-hidden className="size-3.5" /> {vehicle.seats} seat{vehicle.seats > 1 ? "s" : ""}</li>}
          {vehicle.year != null && <li>{vehicle.year}</li>}
        </ul>
        <div className="mt-auto flex items-end justify-between gap-2 border-t border-stone-100 pt-3">
          <div>
            <p className="text-lg font-bold leading-tight">{formatMoney(vehicle.dailyRate, currency)}<span className="text-sm font-medium text-stone-600"> / day</span></p>
            <p className="text-xs text-stone-600">{formatMoney(vehicle.hourlyRate, currency)} / hour</p>
          </div>
          <span className="text-xs text-stone-600">{offerKind(vehicle.owner)}</span>
        </div>
      </div>
    </article>
  );
}
