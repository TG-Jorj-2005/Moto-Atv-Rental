import Link from "next/link";
import { CalendarCheck, CalendarX2, Gauge, Info, MapPin, Mountain, Users, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { TYPE_LABEL } from "@/components/vehicle-card";
import { creditForPath, photoUrl } from "@/lib/photos";
import { CATEGORY_LABELS } from "@/lib/vehicle-categories";
import type { Recommendation } from "@/lib/ridedna/service";
import { cn } from "@/lib/utils";

export type PriceNote = { kind: "EXACT" | "ESTIMATE"; text: string };

// One of the (up to three) recommended vehicles: photo, the facts that are stored, the score and why it fits.
export function RecommendationCard({ rec, rank, priceNote, chooseHref, detailsHref }: { rec: Recommendation; rank: number; priceNote: PriceNote; chooseHref: string; detailsHref: string }) {
  const credit = rec.photoPath ? creditForPath(rec.photoPath) : null;
  const tone = rec.score >= 85 ? "text-success" : rec.score >= 70 ? "text-accent-fg" : "text-warning";
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card" aria-labelledby={`rec-${rec.id}`}>
      <Link href={detailsHref} className="relative block aspect-[4/3] overflow-hidden bg-surface-3" aria-label={`View ${rec.name}`}>
        {rec.photoPath ? <img src={photoUrl(rec.photoPath)} alt={rec.name} loading={rank === 1 ? "eager" : "lazy"} className="size-full object-cover" /> : <span className="grid size-full place-items-center text-subtle"><Mountain aria-hidden className="size-10" /></span>}
        <span className="absolute left-3 top-3 grid size-8 place-items-center rounded-full bg-canvas/85 text-sm font-bold text-accent-fg ring-1 ring-line-strong" aria-label={`Match number ${rank}`}>{rank}</span>
        <Badge tone="dark" className="absolute right-3 top-3">{rec.category ? CATEGORY_LABELS[rec.category] : TYPE_LABEL[rec.type]}</Badge>
      </Link>
      {credit && <p className="border-b border-line px-5 py-1.5 text-[11px] text-subtle">Photo: {credit.author}, {credit.license}</p>}

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="space-y-1">
          <h3 id={`rec-${rec.id}`} className="text-xl font-bold tracking-tight">{rec.name}</h3>
          {rec.locationLabel && <p className="flex items-center gap-1 text-sm text-muted"><MapPin aria-hidden className="size-3.5 shrink-0" /> {rec.locationLabel}</p>}
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className={cn("text-3xl font-bold tabular-nums", tone)}>{rec.score}<span className="text-base font-medium text-muted"> / 100</span></p>
            <p className="text-sm font-semibold">{rec.label}</p>
          </div>
          <div role="meter" aria-label="Compatibility score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rec.score} className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent" style={{ width: `${rec.score}%` }} />
          </div>
          <p className="mt-1 text-xs text-subtle">A compatibility score from our rules, not a probability.</p>
        </div>

        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label="Specifications">
          {rec.engineCc != null && <li className="flex items-center gap-1"><Gauge aria-hidden className="size-4" /> {rec.engineCc} cc</li>}
          {rec.powerHp != null && <li className="flex items-center gap-1"><Zap aria-hidden className="size-4" /> {rec.powerHp} hp</li>}
          {rec.seats != null && <li className="flex items-center gap-1"><Users aria-hidden className="size-4" /> {rec.seats} seat{rec.seats > 1 ? "s" : ""}</li>}
          {rec.licenseCategory && <li>Licence {rec.licenseCategory}</li>}
          {rec.year != null && <li>{rec.year}</li>}
        </ul>

        <div>
          <h4 className="text-sm font-semibold">Why it fits you</h4>
          <ul className="mt-1.5 space-y-1.5 text-sm text-fg-soft">
            {rec.explanations.map((e) => <li key={e} className="flex gap-2"><span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />{e}</li>)}
          </ul>
          {rec.dataGaps.length > 0 && (
            <p className="mt-2 flex gap-2 rounded-lg bg-warning-soft p-2 text-xs text-fg"><Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" /> Not judged for lack of data: {rec.dataGaps.join(", ").toLowerCase()}.</p>
          )}
        </div>

        <div className="mt-auto space-y-3 border-t border-line pt-4">
          <div>
            <p className="text-2xl font-bold tracking-tight">{rec.priceLabel}</p>
            <p className="text-xs text-muted">{priceNote.text}</p>
          </div>
          {rec.available === true && <p className="flex items-center gap-1.5 text-sm font-medium text-success"><CalendarCheck aria-hidden className="size-4" /> Free for your dates right now</p>}
          {rec.available === false && <p className="flex items-center gap-1.5 text-sm font-medium text-danger"><CalendarX2 aria-hidden className="size-4" /> Booked for your dates</p>}
          {rec.available === null && <p className="text-sm text-muted">Availability is checked once you choose a day.</p>}
          <div className="flex flex-wrap gap-2">
            <Link href={chooseHref} className={buttonVariants({ className: "flex-1" })}>Choose this vehicle</Link>
            <Link href={detailsHref} className={buttonVariants({ variant: "outline" })}>View details</Link>
          </div>
        </div>
      </div>
    </article>
  );
}
