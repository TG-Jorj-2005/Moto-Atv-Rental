"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Compass, Mountain, RotateCcw, Sparkles, Trees, Route, Bike } from "lucide-react";
import {
  ADVENTURES, ADVENTURE_LABEL, DURATION_IDS, DURATION_LABEL, EXPERIENCES, EXPERIENCE_LABEL, LICENCES, LICENCE_LABEL, MAX_BUDGET_RON, MAX_PRIORITIES, MIN_BUDGET_RON, PRIORITIES, PRIORITY_LABEL,
  answersToQuery, dayToText, type Adventure, type DurationId, type Experience, type Licence, type Priority, type RideDnaAnswers,
} from "@/lib/ridedna/answers";
import { deriveProfile } from "@/lib/ridedna/profile";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { OptionCard } from "@/components/ridedna/option-card";

type Draft = {
  experience: Experience | null;
  licence: Licence | null;
  adventure: Adventure | null;
  priorities: Priority[];
  duration: DurationId | null;
  passengers: 1 | 2;
  start: string; // YYYY-MM-DD or ""
  budget: string; // in the currency of the page
  ack: boolean;
};

const EMPTY: Draft = { experience: null, licence: null, adventure: null, priorities: [], duration: null, passengers: 1, start: "", budget: "", ack: false };
const STORAGE_KEY = "ridedna-draft-v1";

const EXPERIENCE_HINT: Record<Experience, string> = {
  BEGINNER: "New to riding, or only a few rides so far.",
  INTERMEDIATE: "Comfortable on the road, with some seasons behind you.",
  ADVANCED: "Many kilometres, confident with powerful machines.",
};
const LICENCE_HINT: Record<Licence, string> = {
  NONE: "Only vehicles that need no motorcycle licence (ATVs) will be offered. We cannot check any licence for you.",
  A2: "Bikes that need A2 (or A1) are offered.",
  A: "All categories.",
};
const ADVENTURE_HINT: Record<Adventure, string> = {
  ROAD_TOURING: "Mountain roads, long distances, sightseeing.",
  MIXED_TRAILS: "Asphalt, gravel and forest roads in one ride.",
  OFFROAD_TRAILS: "Real trails and rough ground, where allowed.",
  ATV_RECREATION: "A quad for fun on open ground and trails.",
};
const ADVENTURE_ICON: Record<Adventure, React.ReactNode> = {
  ROAD_TOURING: <Route className="size-5" />, MIXED_TRAILS: <Trees className="size-5" />, OFFROAD_TRAILS: <Mountain className="size-5" />, ATV_RECREATION: <Bike className="size-5" />,
};
const PRIORITY_HINT: Record<Priority, string> = {
  COMFORT: "A relaxed seat and an easy ride.", AGILITY: "Light and easy to place in a corner.", POWER: "Strong acceleration and top performance.",
  EXPLORATION: "Ready to go far from the beaten track.", SPORT: "A lively, sporty character.", SIMPLICITY: "Approachable, no fuss.",
};
const BUDGET_PRESETS_RON = [500, 1000, 2000, 4000];

const STEPS = [
  { id: "experience", title: "How much do you ride?" },
  { id: "licence", title: "Which licence do you hold?" },
  { id: "adventure", title: "What kind of ride do you picture?" },
  { id: "priorities", title: "What matters most? Pick up to two" },
  { id: "trip", title: "Tell us about the trip" },
  { id: "budget", title: "What is your budget for the trip?" },
  { id: "summary", title: "Your RideDNA" },
] as const;

function budgetRon(draft: Draft, currency: "RON" | "EUR", rate: number): number | null {
  if (!/^\d{1,7}$/.test(draft.budget.trim())) return null;
  const n = Number(draft.budget.trim());
  const ron = currency === "EUR" ? Math.round(n * rate) : n;
  return ron >= MIN_BUDGET_RON && ron <= MAX_BUDGET_RON ? ron : null;
}

function toDraft(a: Partial<RideDnaAnswers> | undefined, currency: "RON" | "EUR", rate: number): Draft {
  if (!a) return EMPTY;
  return {
    experience: a.experience ?? null, licence: a.licence ?? null, adventure: a.adventure ?? null, priorities: a.priorities ?? [], duration: a.duration ?? null, passengers: a.passengers ?? 1,
    start: a.start ? dayToText(a.start) : "", budget: a.budgetRon !== undefined ? String(currency === "EUR" ? Math.round(a.budgetRon / rate) : a.budgetRon) : "", ack: false,
  };
}

export function RideDnaQuiz({ currency, eurRate, today, initial, startAtSummary }: { currency: "RON" | "EUR"; eurRate: number; today: string; initial?: Partial<RideDnaAnswers>; startAtSummary?: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial, currency, eurRate));
  const [step, setStep] = useState(startAtSummary ? STEPS.length - 1 : 0);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const loaded = useRef(false);

  // The unfinished answers live only in this tab (sessionStorage), so that Back from the results returns to them.
  useEffect(() => {
    if (!initial) {
      try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as { draft?: Draft; step?: number };
          if (parsed.draft) setDraft({ ...EMPTY, ...parsed.draft, ack: false });
          if (typeof parsed.step === "number" && parsed.step >= 0 && parsed.step < STEPS.length) setStep(parsed.step);
        }
      } catch {
        /* storage unavailable: the questionnaire works without it */
      }
    }
    loaded.current = true;
  }, [initial]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ draft, step }));
    } catch {
      /* ignore */
    }
  }, [draft, step]);
  useEffect(() => {
    if (loaded.current) heading.current?.focus();
  }, [step]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const ron = budgetRon(draft, currency, eurRate);
  const startOk = draft.start === "" || (/^\d{4}-\d{2}-\d{2}$/.test(draft.start) && draft.start >= today);
  const valid: Record<(typeof STEPS)[number]["id"], boolean> = {
    experience: draft.experience !== null,
    licence: draft.licence !== null,
    adventure: draft.adventure !== null,
    priorities: draft.priorities.length >= 1 && draft.priorities.length <= MAX_PRIORITIES,
    trip: draft.duration !== null && startOk,
    budget: ron !== null,
    summary: draft.ack,
  };
  const complete = (draft.experience && draft.licence && draft.adventure && draft.priorities.length > 0 && draft.duration && ron !== null && startOk) ? ({
    experience: draft.experience, licence: draft.licence, adventure: draft.adventure, priorities: draft.priorities, budgetRon: ron, duration: draft.duration, passengers: draft.passengers,
    start: draft.start ? { year: +draft.start.slice(0, 4), month: +draft.start.slice(5, 7), day: +draft.start.slice(8, 10) } : null,
  } satisfies RideDnaAnswers) : null;

  const current = STEPS[step]!;
  const goNext = () => {
    if (!valid[current.id]) return setAttempted(true);
    setAttempted(false);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const goBack = () => { setAttempted(false); setStep((s) => Math.max(0, s - 1)); };
  const reset = () => { setDraft(EMPTY); setStep(0); setAttempted(false); try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } };
  const submit = () => {
    if (!complete || !draft.ack) return setAttempted(true);
    setSubmitting(true);
    router.push(`/ridedna/results?${answersToQuery(complete).toString()}`);
  };

  const problem: Record<(typeof STEPS)[number]["id"], string> = {
    experience: "Choose the option that describes you best.", licence: "Choose your licence category.", adventure: "Choose the kind of ride.",
    priorities: "Pick one or two priorities.", trip: !startOk ? "The date cannot be in the past." : "Choose how long the trip lasts.",
    budget: `Enter a whole amount between ${currency === "EUR" ? Math.ceil(MIN_BUDGET_RON / eurRate) : MIN_BUDGET_RON} and ${currency === "EUR" ? Math.floor(MAX_BUDGET_RON / eurRate) : MAX_BUDGET_RON} ${currency}.`,
    summary: "Please confirm the note below to see your recommendations.",
  };

  return (
    <section aria-labelledby="quiz-title" className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-8">
      <div className="mb-6 space-y-2">
        <div className="flex items-center justify-between text-sm text-muted">
          <span>Step {step + 1} of {STEPS.length}</span>
          <button type="button" onClick={reset} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 hover:bg-surface-3 hover:text-fg"><RotateCcw aria-hidden className="size-3.5" /> Start over</button>
        </div>
        <div role="progressbar" aria-label="Questionnaire progress" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} className="h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <h2 id="quiz-title" ref={heading} tabIndex={-1} className="mb-5 text-2xl font-bold tracking-tight outline-none">{current.title}</h2>

      {current.id === "experience" && (
        <fieldset className="grid gap-3 sm:grid-cols-3"><legend className="sr-only">{current.title}</legend>
          {EXPERIENCES.map((e) => <OptionCard key={e} type="radio" name="experience" value={e} checked={draft.experience === e} onChange={() => set("experience", e)} title={EXPERIENCE_LABEL[e]} hint={EXPERIENCE_HINT[e]} />)}
        </fieldset>
      )}
      {current.id === "licence" && (
        <div className="space-y-3">
          <fieldset className="grid gap-3 sm:grid-cols-3"><legend className="sr-only">{current.title}</legend>
            {LICENCES.map((l) => <OptionCard key={l} type="radio" name="licence" value={l} checked={draft.licence === l} onChange={() => set("licence", l)} title={LICENCE_LABEL[l]} hint={LICENCE_HINT[l]} />)}
          </fieldset>
          <p className="text-sm text-muted">RideDNA uses your answer to filter the offer. It does not verify a licence: the rental company checks your documents at handover.</p>
        </div>
      )}
      {current.id === "adventure" && (
        <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="sr-only">{current.title}</legend>
          {ADVENTURES.map((x) => <OptionCard key={x} type="radio" name="adventure" value={x} checked={draft.adventure === x} onChange={() => set("adventure", x)} title={ADVENTURE_LABEL[x]} hint={ADVENTURE_HINT[x]} icon={ADVENTURE_ICON[x]} />)}
        </fieldset>
      )}
      {current.id === "priorities" && (
        <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><legend className="sr-only">{current.title}</legend>
          {PRIORITIES.map((p) => {
            const checked = draft.priorities.includes(p);
            const full = draft.priorities.length >= MAX_PRIORITIES && !checked;
            return <OptionCard key={p} type="checkbox" name="priorities" value={p} checked={checked} disabled={full} onChange={() => set("priorities", checked ? draft.priorities.filter((x) => x !== p) : [...draft.priorities, p])} title={PRIORITY_LABEL[p]} hint={PRIORITY_HINT[p]} />;
          })}
        </fieldset>
      )}
      {current.id === "trip" && (
        <div className="space-y-6">
          <fieldset className="space-y-2"><legend className="font-semibold">How long?</legend>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {DURATION_IDS.map((d) => <OptionCard key={d} type="radio" name="duration" value={d} checked={draft.duration === d} onChange={() => set("duration", d)} title={DURATION_LABEL[d]} />)}
            </div>
          </fieldset>
          <fieldset className="space-y-2"><legend className="font-semibold">Who rides?</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <OptionCard type="radio" name="passengers" value="1" checked={draft.passengers === 1} onChange={() => set("passengers", 1)} title="Just me" />
              <OptionCard type="radio" name="passengers" value="2" checked={draft.passengers === 2} onChange={() => set("passengers", 2)} title="Me and a passenger" hint="Only vehicles recorded with two seats are offered." />
            </div>
          </fieldset>
          <Field label="Do you already know the first day? (optional)" htmlFor="start" hint="Bucharest time, the ride starts at 09:00. With a date we check availability and show the exact price." error={!startOk ? "The date cannot be in the past." : null} className="max-w-xs">
            <Input id="start" type="date" min={today} value={draft.start} onChange={(e) => set("start", e.target.value)} />
          </Field>
        </div>
      )}
      {current.id === "budget" && (
        <div className="space-y-4">
          <Field label={`Maximum for the whole trip, in ${currency}`} htmlFor="budget" hint={ron !== null && currency === "EUR" ? `About ${ron} RON.` : "A vehicle whose estimated price is above this amount is not offered."} error={attempted && ron === null ? problem.budget : null} className="max-w-xs">
            <Input id="budget" inputMode="numeric" autoComplete="off" value={draft.budget} onChange={(e) => set("budget", e.target.value.replace(/[^\d]/g, "").slice(0, 7))} placeholder={currency === "EUR" ? "e.g. 300" : "e.g. 1500"} />
          </Field>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
            {BUDGET_PRESETS_RON.map((p) => {
              const shown = currency === "EUR" ? Math.round(p / eurRate) : p;
              return <button key={p} type="button" onClick={() => set("budget", String(shown))} className="cursor-pointer rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-sm font-medium hover:bg-surface-2">{shown} {currency}</button>;
            })}
          </div>
        </div>
      )}
      {current.id === "summary" && complete && <Summary draft={draft} answers={complete} onEdit={(i) => { setAttempted(false); setStep(i); }} onAck={(v) => set("ack", v)} attempted={attempted} currency={currency} />}
      {current.id === "summary" && !complete && <Alert tone="warning" title="Some answers are missing">Go back and complete the earlier steps.</Alert>}

      {attempted && current.id !== "summary" && current.id !== "budget" && !valid[current.id] && <Alert tone="error" className="mt-4">{problem[current.id]}</Alert>}

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={goBack} disabled={step === 0 || submitting}><ArrowLeft aria-hidden className="size-4" /> Back</Button>
        {current.id !== "summary" ? (
          <Button type="button" onClick={goNext}>Continue <ArrowRight aria-hidden className="size-4" /></Button>
        ) : (
          <Button type="button" onClick={submit} disabled={submitting || !complete} aria-busy={submitting}><Sparkles aria-hidden className="size-4" /> {submitting ? "Finding your rides…" : "Show my recommendations"}</Button>
        )}
      </div>
    </section>
  );
}

function Summary({ draft, answers, onEdit, onAck, attempted, currency }: { draft: Draft; answers: RideDnaAnswers; onEdit: (step: number) => void; onAck: (v: boolean) => void; attempted: boolean; currency: "RON" | "EUR" }) {
  const profile = deriveProfile(answers);
  const rows: { label: string; value: string; step: number }[] = [
    { label: "Experience", value: EXPERIENCE_LABEL[answers.experience], step: 0 },
    { label: "Licence", value: LICENCE_LABEL[answers.licence], step: 1 },
    { label: "Ride", value: ADVENTURE_LABEL[answers.adventure], step: 2 },
    { label: "Priorities", value: answers.priorities.map((p) => PRIORITY_LABEL[p]).join(", "), step: 3 },
    { label: "Trip", value: `${DURATION_LABEL[answers.duration]}, ${answers.passengers === 2 ? "with a passenger" : "alone"}${draft.start ? `, from ${draft.start}` : ""}`, step: 4 },
    { label: "Budget", value: `${draft.budget} ${currency}${currency === "EUR" ? ` (about ${answers.budgetRon} RON)` : ""}`, step: 5 },
  ];
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-accent/40 bg-accent-soft p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-accent-fg"><Compass aria-hidden className="size-4" /> Your rider profile</p>
        <p className="mt-1 text-2xl font-bold tracking-tight">{profile.name}</p>
        <p className="mt-1 text-fg-soft">{profile.description}</p>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Your answers in short">
          {profile.traits.map((t) => <li key={t} className="rounded-full border border-line-strong bg-surface px-3 py-1 text-xs text-fg-soft">{t}</li>)}
        </ul>
      </div>
      <dl className="divide-y divide-line rounded-xl border border-line">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0"><dt className="text-xs text-muted">{r.label}</dt><dd className="font-medium">{r.value}</dd></div>
            <button type="button" onClick={() => onEdit(r.step)} className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-sm font-medium text-accent-fg hover:bg-surface-3" aria-label={`Change ${r.label.toLowerCase()}`}>Change</button>
          </div>
        ))}
      </dl>
      <div className="space-y-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4">
          <input type="checkbox" checked={draft.ack} onChange={(e) => onAck(e.target.checked)} className="mt-1 size-4 accent-[var(--color-accent)]" />
          <span className="text-sm text-fg-soft">I understand that the profile and the recommendations are a suggestion based on what I answered. They do not check my licence or my riding skills, and a vehicle is only booked when I confirm a booking.</span>
        </label>
        {attempted && !draft.ack && <p role="alert" className="text-sm text-danger">Please confirm the note above to continue.</p>}
      </div>
    </div>
  );
}
