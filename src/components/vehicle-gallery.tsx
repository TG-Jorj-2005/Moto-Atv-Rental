"use client";

import { useState } from "react";
import { Mountain } from "lucide-react";
import { cn } from "@/lib/utils";

export type GalleryPhoto = { url: string; alt: string; credit?: { author: string; license: string; source: string } | null };

// Large photo with a strip of thumbnails. Buttons, so it works with the keyboard and screen readers.
export function VehicleGallery({ photos, name }: { photos: GalleryPhoto[]; name: string }) {
  const [index, setIndex] = useState(0);
  if (photos.length === 0) {
    return <div className="grid aspect-[16/10] place-items-center rounded-2xl bg-stone-200 text-stone-500"><Mountain aria-hidden className="size-14" /><span className="sr-only">No photo of {name}</span></div>;
  }
  const current = photos[index] ?? photos[0]!;
  return (
    <figure className="space-y-3">
      <div className="overflow-hidden rounded-2xl bg-stone-200">
        <img src={current.url} alt={current.alt} className="aspect-[16/10] w-full object-cover" />
      </div>
      {photos.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Photos">
          {photos.map((p, i) => (
            <li key={p.url}>
              <button type="button" onClick={() => setIndex(i)} aria-label={`Show photo ${i + 1} of ${photos.length}`} aria-current={i === index} className={cn("block size-16 cursor-pointer overflow-hidden rounded-lg border-2 sm:size-20", i === index ? "border-brand-700" : "border-transparent opacity-80 hover:opacity-100")}>
                <img src={p.url} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {current.credit && (
        <figcaption className="text-xs text-stone-600">Photo: <a className="underline" href={current.credit.source}>{current.credit.author}</a>, {current.credit.license}</figcaption>
      )}
    </figure>
  );
}
