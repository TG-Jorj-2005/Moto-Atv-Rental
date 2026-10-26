import Link from "next/link";
import { ChevronLeft, ChevronRight, SearchX, SlidersHorizontal } from "lucide-react";
import { catalogFacets, parseCatalogParams, searchVehicles, PAGE_SIZE, type CatalogFilters } from "@/lib/catalog";
import { getCurrency } from "@/lib/currency-server";
import { localDateOf } from "@/lib/business-time";
import { Suspense } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { VehicleCard } from "@/components/vehicle-card";
import { cn } from "@/lib/utils";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/vehicle-categories";

export const metadata = { title: "Vehicles" };
export const dynamic = "force-dynamic";

const iso = (d: { year: number; month: number; day: number } | null) => (d ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}` : "");

function queryString(f: CatalogFilters, page: number): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.type) p.set("type", f.type);
  if (f.category) p.set("category", f.category);
  if (f.county) p.set("county", f.county);
  if (f.locationId) p.set("location", f.locationId);
  if (f.minDailyRon !== null) p.set("minPrice", String(f.minDailyRon));
  if (f.maxDailyRon !== null) p.set("maxPrice", String(f.maxDailyRon));
  if (f.from && f.to) {
    p.set("from", iso(f.from));
    p.set("to", iso(f.to));
  }
  if (f.sort !== "newest") p.set("sort", f.sort);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `?${s}` : "";
}


function ResultsSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading vehicles" className="space-y-5">
      <Skeleton className="h-5 w-48" />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-80" />)}</div>
    </section>
  );
}

// The results are fetched inside a Suspense boundary: the page shell and the filters appear at once, and a skeleton
// is shown while the query runs.
async function Results({ filters }: { filters: CatalogFilters }) {
  const [currency, result] = await Promise.all([getCurrency(), searchVehicles(filters)]);
  const first = result.total === 0 ? 0 : (result.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(result.page * PAGE_SIZE, result.total);
  return (
    <section aria-live="polite" className="space-y-5">
      <p className="text-sm text-muted">{result.total === 0 ? "No vehicles found" : `Showing ${first}–${last} of ${result.total} vehicle${result.total === 1 ? "" : "s"}`}</p>
      {result.total === 0 ? (
        <EmptyState icon={SearchX} title="No vehicles match your filters" description="Try other dates, a wider price range or another location." action={<Link href="/vehicles" className={buttonVariants({ variant: "outline" })}>Clear all filters</Link>} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{result.items.map((v) => <VehicleCard key={v.id} vehicle={v} currency={currency} />)}</div>
      )}
      {result.pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-2 pt-2">
          <Link aria-disabled={result.page <= 1} tabIndex={result.page <= 1 ? -1 : undefined} href={`/vehicles${queryString(filters, result.page - 1)}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), result.page <= 1 && "pointer-events-none opacity-50")}><ChevronLeft aria-hidden className="size-4" /> Previous</Link>
          <span className="text-sm text-muted">Page {result.page} of {result.pages}</span>
          <Link aria-disabled={result.page >= result.pages} tabIndex={result.page >= result.pages ? -1 : undefined} href={`/vehicles${queryString(filters, result.page + 1)}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), result.page >= result.pages && "pointer-events-none opacity-50")}>Next <ChevronRight aria-hidden className="size-4" /></Link>
        </nav>
      )}
    </section>
  );
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { filters, problems } = parseCatalogParams(await searchParams);
  const facets = await catalogFacets();
  const counties = [...new Set(facets.locations.map((l) => l.county).filter(Boolean))];
  const today = iso(localDateOf(new Date()));
  const activeCount = [filters.q, filters.type, filters.category, filters.county, filters.locationId, filters.minDailyRon, filters.maxDailyRon, filters.from].filter((v) => v !== null && v !== "").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader title="Vehicles for rent" description="ATVs and motorcycles from private owners, rental companies and our own fleet. Every listing is approved before it appears." />

      {problems.map((p) => <Alert key={p} tone="warning">{p}</Alert>)}

      <nav aria-label="Categories" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {[{ value: null, label: "All" }, ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))].map((c) => {
          const active = filters.category === c.value;
          const count = c.value ? facets.categoryCounts[c.value] : undefined;
          return (
            <Link
              key={c.label}
              href={`/vehicles${queryString({ ...filters, category: c.value, type: null }, 1)}`}
              aria-current={active ? "true" : undefined}
              className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", active ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-surface text-fg hover:bg-surface-2")}
            >
              {c.label}{count ? <span className={cn("ml-1.5 text-xs", active ? "text-fg-soft" : "text-subtle")}>{count}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <details className="group self-start rounded-xl border border-line bg-surface shadow-card lg:open:block" open>
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold lg:pointer-events-none">
            <SlidersHorizontal aria-hidden className="size-4" /> Filters{activeCount > 0 && <span className="rounded-full bg-accent-soft px-2 text-xs text-accent-fg">{activeCount}</span>}
          </summary>
          <form method="get" action="/vehicles" className="space-y-4 border-t border-line p-4">
            <Field label="Search by name" htmlFor="q"><Input id="q" name="q" defaultValue={filters.q} placeholder="e.g. Grizzly or cruiser" maxLength={60} /></Field>
            <Field label="Type" htmlFor="type">
              <Select id="type" name="type" defaultValue={filters.type ?? ""}>
                <option value="">All types</option>
                <option value="ATV">ATVs</option>
                <option value="MOTORCYCLE">Motorcycles</option>
                <option value="SCOOTER">Scooters</option>
              </Select>
            </Field>
            <Field label="Category" htmlFor="category">
              <Select id="category" name="category" defaultValue={filters.category ?? ""}>
                <option value="">All categories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}{facets.categoryCounts[c] ? ` (${facets.categoryCounts[c]})` : ""}</option>)}
              </Select>
            </Field>
            <Field label="County" htmlFor="county">
              <Select id="county" name="county" defaultValue={filters.county ?? ""}>
                <option value="">All counties</option>
                {counties.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Pick-up location" htmlFor="location">
              <Select id="location" name="location" defaultValue={filters.locationId ?? ""}>
                <option value="">Any location</option>
                {facets.locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.city})</option>)}
              </Select>
            </Field>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-fg">Price per day (RON)</legend>
              <div className="grid grid-cols-2 gap-2">
                <Input name="minPrice" type="number" min="0" step="1" inputMode="numeric" aria-label="Minimum price per day in RON" placeholder="Min" defaultValue={filters.minDailyRon ?? ""} />
                <Input name="maxPrice" type="number" min="0" step="1" inputMode="numeric" aria-label="Maximum price per day in RON" placeholder="Max" defaultValue={filters.maxDailyRon ?? ""} />
              </div>
            </fieldset>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-fg">Free on these days</legend>
              <div className="grid grid-cols-2 gap-2">
                <Input name="from" type="date" min={today} aria-label="First day" defaultValue={iso(filters.from)} />
                <Input name="to" type="date" min={today} aria-label="Last day" defaultValue={iso(filters.to)} />
              </div>
              <p className="text-xs text-muted">Shows only vehicles with no booking during the whole period.</p>
            </fieldset>
            <Field label="Sort by" htmlFor="sort">
              <Select id="sort" name="sort" defaultValue={filters.sort}>
                <option value="newest">Newest first</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
                <option value="name">Name</option>
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button className="flex-1">Apply filters</Button>
              <Link href="/vehicles" className={buttonVariants({ variant: "outline" })}>Reset</Link>
            </div>
          </form>
        </details>

        <Suspense fallback={<ResultsSkeleton />}>
          <Results filters={filters} />
        </Suspense>
      </div>
    </div>
  );
}
