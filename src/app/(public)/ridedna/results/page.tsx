import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getCurrency } from "@/lib/currency-server";
import { formatMoney } from "@/lib/currency";
import { addDays, localDateOf, toLocalInputValue } from "@/lib/business-time";
import { answersToQuery, dayToText, parseAnswers } from "@/lib/ridedna/answers";
import { deriveProfile } from "@/lib/ridedna/profile";
import { MAX_RESULTS, recommend } from "@/lib/ridedna/service";
import { EXCELLENT_MIN, FAIR_MIN, GOOD_MIN, REASON_TEXT, WEIGHTS, type Reason } from "@/lib/ridedna/scoring";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { CompareTable } from "@/components/ridedna/compare-table";
import { PeriodForm } from "@/components/ridedna/period-form";
import { ProfileCard } from "@/components/ridedna/profile-card";
import { RecommendationCard } from "@/components/ridedna/recommendation-card";

export const metadata: Metadata = { title: "Your RideDNA" };
export const dynamic = "force-dynamic";

export default async function RideDnaResults({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const parsed = parseAnswers(raw);
  if (!parsed.ok) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState icon={SearchX} title="We need your answers first" description="This link is missing some answers or has values we do not recognise. Answer the questions again; it takes a minute."
          action={<Link href="/ridedna" className={buttonVariants()}>Start the questionnaire</Link>} />
      </div>
    );
  }
  const answers = parsed.answers;
  const [user, currency] = await Promise.all([getCurrentUser(), getCurrency()]);
  const result = await recommend(answers, { currency, excludeOwnerId: user?.id ?? null });
  const profile = deriveProfile(answers);
  const editHref = `/ridedna?${answersToQuery(answers).toString()}`;
  const recs = result.recommendations;
  const exactDates = result.period.kind === "EXACT";
  const minDay = dayToText(addDays(localDateOf(new Date()), 1));
  // "Choose this vehicle" hands the period to the vehicle page, which fills the booking form (and checks it again).
  const chooseHref = (id: string) => (result.period.kind === "EXACT" ? `/vehicles/${id}?start=${toLocalInputValue(result.period.period.startAt)}&end=${toLocalInputValue(result.period.period.endAt)}#book` : `/vehicles/${id}#book`);

  const topReasons = Object.entries(result.excluded).filter(([k]) => k !== "UNAVAILABLE").sort((a, b) => b[1] - a[1]).slice(0, 3) as [Reason, number][];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/ridedna" className="hover:underline">RideDNA</Link> <span aria-hidden>/</span> <span className="text-fg">Your results</span></nav>
      <ProfileCard profile={profile} editHref={editHref} />

      <PeriodForm answers={answers} period={result.period} minDay={minDay} />

      {result.period.kind === "INVALID" && <Alert tone="warning" title="That day has already started or passed">Choose a day from tomorrow on, or change your answers.</Alert>}

      <section aria-labelledby="recs-title" className="space-y-4">
        <div>
          <h2 id="recs-title" className="text-2xl font-bold tracking-tight">{recs.length > 0 ? (recs.length === 1 ? "Your match" : `Your ${recs.length} best matches`) : "No match yet"}</h2>
          <p className="text-sm text-muted">{result.considered} vehicle{result.considered === 1 ? "" : "s"} looked at, {result.eligible} passed every rule{exactDates ? " and are free on your dates" : ""}.</p>
        </div>

        {recs.length > 0 && recs.length < MAX_RESULTS && result.eligible < MAX_RESULTS && (
          <Alert tone="info" title={`Only ${recs.length} vehicle${recs.length === 1 ? "" : "s"} fit${recs.length === 1 ? "s" : ""} your answers`}>We show {recs.length === 1 ? "it" : "them"} and do not fill the list with vehicles that do not fit.</Alert>
        )}

        {recs.length > 0 ? (
          <>
            <div className="grid gap-5 lg:grid-cols-3">
              {recs.map((r, i) => (
                <RecommendationCard key={r.id} rec={r} rank={i + 1} detailsHref={`/vehicles/${r.id}`} chooseHref={chooseHref(r.id)}
                  priceNote={exactDates ? { kind: "EXACT", text: "Price for your dates (the booking recalculates it)." } : { kind: "ESTIMATE", text: "Estimate for a weekday trip of the chosen length; weekend rates and dates can change it." }} />
              ))}
            </div>
            {recs.length > 1 && (
              <section aria-labelledby="compare-title" className="space-y-2">
                <h2 id="compare-title" className="text-lg font-semibold tracking-tight">Side by side</h2>
                <CompareTable items={recs} />
              </section>
            )}
          </>
        ) : result.period.kind !== "INVALID" ? (
          <div className="space-y-4">
            <EmptyState icon={SearchX} title={result.considered === 0 ? "No vehicles are available to rent right now" : "None of our vehicles fits all your answers"}
              description={result.considered === 0 ? "Please come back later or browse the catalog." : "We do not relax your licence, power or budget limits in silence. Here is what kept the vehicles out, and what you could change."}
              action={<div className="flex flex-wrap justify-center gap-2"><Link href={editHref} className={buttonVariants()}>Change my answers</Link><Link href="/vehicles" className={buttonVariants({ variant: "outline" })}>Browse the catalog</Link></div>} />
            {result.considered > 0 && (
              <div className="space-y-3 rounded-xl border border-line bg-surface p-4 text-sm">
                {result.onlyOverBudget && <p><strong>{result.onlyOverBudget.count}</strong> vehicle{result.onlyOverBudget.count === 1 ? "" : "s"} fit everything except the budget; the cheapest costs about <strong>{formatMoney(result.onlyOverBudget.cheapestBani, currency)}</strong> for this trip.</p>}
                {result.onlyUnavailable > 0 && <p><strong>{result.onlyUnavailable}</strong> vehicle{result.onlyUnavailable === 1 ? "" : "s"} fit everything except that {result.onlyUnavailable === 1 ? "it is" : "they are"} booked on your dates.</p>}
                {topReasons.length > 0 && (
                  <div><p className="font-medium">Most common reasons:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">{topReasons.map(([r, n]) => <li key={r}>{n} vehicle{n === 1 ? "" : "s"}: {REASON_TEXT[r]}.</li>)}</ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </section>

      <details className="rounded-xl border border-line bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-semibold">How the score works</summary>
        <div className="mt-3 space-y-2 text-muted">
          <p>First, hard rules remove vehicles that cannot be recommended responsibly: a category not meant for your ride, a licence you do not hold, too much power for your experience, no seat for a passenger, a price above your budget, or booked on your dates. A high score never overrides a rule.</p>
          <p>Then the remaining vehicles get 0 to 100 points: {WEIGHTS.adventure} for how well the category suits your ride, {WEIGHTS.preferences} for your priorities, {WEIGHTS.experience} for power versus your experience and {WEIGHTS.budget} for the price against your budget. Data that is not recorded is left out (and shown to you), not counted as a match.</p>
          <p>Labels: {EXCELLENT_MIN}+ excellent, {GOOD_MIN}+ good, {FAIR_MIN}+ fair. The score is a rule-based compatibility figure, not a probability, and nothing here uses artificial intelligence. Equal scores are ordered by lower price, then name.</p>
        </div>
      </details>
    </div>
  );
}
