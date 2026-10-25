import Link from "next/link";
import { ArrowRight, CalendarCheck, ClipboardCheck, KeyRound, MapPin, Search, Store } from "lucide-react";
import { prisma } from "@/lib/db";
import { catalogFacets, vehicleCardSelect } from "@/lib/catalog";
import { getCurrency } from "@/lib/currency-server";
import { addDays, localDateOf } from "@/lib/business-time";
import { creditForPath } from "@/lib/photos";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Section } from "@/components/ui/misc";
import { VehicleCard } from "@/components/vehicle-card";
import { CATEGORIES, CATEGORY_BLURBS, CATEGORY_LABELS } from "@/lib/vehicle-categories";

export const dynamic = "force-dynamic";

const HERO = "/gallery/g1.jpg";

export default async function HomePage() {
  const currency = await getCurrency();
  const today = localDateOf(new Date());
  const iso = (d: { year: number; month: number; day: number }) => `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
  const [featured, facets] = await Promise.all([
    prisma.vehicle.findMany({ where: { listingStatus: "APPROVED", status: "AVAILABLE" }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 6, select: vehicleCardSelect }),
    catalogFacets(),
  ]);
  const counties = [...new Set(facets.locations.map((l) => l.county).filter(Boolean))];
  const heroCredit = creditForPath(HERO);

  return (
    <>
      <section className="relative isolate overflow-hidden bg-stone-900 text-white">
        <img src={HERO} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-stone-950/90 via-stone-900/70 to-stone-900/30" />
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-2xl space-y-4">
            <p className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide">ATVs AND MOTORCYCLES, ALL OVER ROMANIA</p>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Find your ride. Hit the trail.</h1>
            <p className="text-lg text-stone-200">Rent from private owners, rental companies and our own fleet. Pick your dates, book online, and our team confirms and hands you the keys.</p>
          </div>
          <form action="/vehicles" method="get" className="mt-8 grid gap-3 rounded-2xl bg-white p-4 text-stone-900 shadow-pop sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
            <Field label="Vehicle" htmlFor="hero-type">
              <Select id="hero-type" name="type" defaultValue="">
                <option value="">ATVs and motorcycles</option>
                <option value="ATV">ATVs</option>
                <option value="MOTORCYCLE">Motorcycles</option>
              </Select>
            </Field>
            <Field label="Where" htmlFor="hero-county">
              <Select id="hero-county" name="county" defaultValue="">
                <option value="">All of Romania</option>
                {counties.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="From" htmlFor="hero-from"><Input id="hero-from" type="date" name="from" min={iso(today)} /></Field>
            <Field label="Until" htmlFor="hero-to"><Input id="hero-to" type="date" name="to" min={iso(today)} max={iso(addDays(today, 365))} /></Field>
            <Button size="lg" className="sm:col-span-2 lg:col-span-1"><Search aria-hidden className="size-4" /> Search</Button>
          </form>
          {heroCredit && <p className="mt-4 text-xs text-stone-300">Photo: <a className="underline" href={heroCredit.source}>{heroCredit.author}</a>, {heroCredit.license}</p>}
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-16 px-4 py-14 sm:px-6">
        <Section title="Choose your ride" description="Two kinds of adventure, one place to book them.">
          <div className="grid gap-4 sm:grid-cols-2">
            {([["ATV", "ATVs & quads", "/gallery/g2.jpg", "Trails, forests and beaches on four wheels."], ["MOTORCYCLE", "Motorcycles", "/gallery/g3.jpg", "Dirt tracks and open roads on two wheels."]] as const).map(([type, title, image, text]) => (
              <Link key={type} href={`/vehicles?type=${type}`} className="group relative isolate flex min-h-56 flex-col justify-end overflow-hidden rounded-2xl p-6 text-white">
                <img src={image} alt="" loading="lazy" className="absolute inset-0 -z-20 size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-stone-950/85 via-stone-900/30 to-transparent" />
                <h3 className="text-2xl font-bold">{title}</h3>
                <p className="text-sm text-stone-200">{text}</p>
                <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold">{facets.counts[type] ?? 0} available <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" /></p>
              </Link>
            ))}
          </div>
        </Section>

        <Section title="Browse by style" description="From relaxed cruisers to trail-ready quads.">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((c) => (
              <li key={c}>
                <Link href={`/vehicles?category=${c}`} className="group flex h-full flex-col gap-1 rounded-xl border border-stone-200 bg-white p-4 shadow-card transition-shadow hover:shadow-pop">
                  <span className="flex items-center justify-between gap-2 font-semibold">{CATEGORY_LABELS[c]}<span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">{facets.categoryCounts[c] ?? 0}</span></span>
                  <span className="text-sm text-stone-600">{CATEGORY_BLURBS[c]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Featured vehicles" description="The newest listings on the marketplace." actions={<Link href="/vehicles" className={buttonVariants({ variant: "outline", size: "sm" })}>See all vehicles</Link>}>
          {featured.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">No vehicles are listed yet. Check back soon.</p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{featured.map((v) => <VehicleCard key={v.id} vehicle={v} currency={currency} />)}</div>
          )}
        </Section>

        <section id="how-it-works" className="scroll-mt-24 space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">How it works</h2>
            <p className="text-sm text-stone-600">From search to handover in three steps.</p>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {[
              { icon: Search, title: "1. Search and compare", text: "Filter by type, place, price and dates. Every listing is approved by our team before it appears." },
              { icon: CalendarCheck, title: "2. Book online", text: "Choose the exact start and end time. The price is calculated for you and shown before you book." },
              { icon: KeyRound, title: "3. Confirmation and handover", text: "We confirm your booking and record the handover at the pick-up location. You can cancel free of charge until it starts." },
            ].map((s) => (
              <li key={s.title} className="rounded-xl border border-stone-200 bg-white p-5 shadow-card">
                <span className="mb-3 grid size-10 place-items-center rounded-lg bg-brand-100 text-brand-800"><s.icon aria-hidden className="size-5" /></span>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-stone-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="locations" className="scroll-mt-24 space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">Pick-up locations</h2>
            <p className="text-sm text-stone-600">Vehicles are collected and returned at the location of the listing.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {facets.locations.slice(0, 9).map((l) => (
              <Link key={l.id} href={`/vehicles?location=${l.id}`} className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-card hover:border-brand-300">
                <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-700" />
                <span>
                  <span className="block font-semibold">{l.name}</span>
                  <span className="block text-sm text-stone-600">{l.city}, {l.county}</span>
                  <span className="mt-1 block text-xs text-stone-600">{l._count.vehicles} vehicle{l._count.vehicles === 1 ? "" : "s"} available</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-6 rounded-2xl bg-stone-900 p-8 text-white md:grid-cols-[1fr_auto] md:items-center">
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-brand-300"><Store aria-hidden className="size-4" /> For owners and rental companies</p>
            <h2 className="text-2xl font-bold tracking-tight">Put your vehicles to work</h2>
            <p className="max-w-2xl text-stone-300">List an ATV or motorcycle as a private owner, or manage a whole fleet as a rental company. We handle the bookings, you follow earnings, maintenance deadlines and your calendar in one place. Rental companies can also request bulk offers for events and groups.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/register?role=OWNER" className={buttonVariants({ variant: "primary", size: "lg" })}><ClipboardCheck aria-hidden className="size-4" /> List a vehicle</Link>
            <Link href="/register?role=RENTAL_COMPANY" className={buttonVariants({ variant: "outline", size: "lg", className: "border-stone-600 bg-transparent text-white hover:bg-stone-800" })}>Register a company</Link>
          </div>
        </section>
      </div>
    </>
  );
}
