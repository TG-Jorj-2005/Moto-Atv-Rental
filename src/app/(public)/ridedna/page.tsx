import type { Metadata } from "next";
import { ClipboardList, Dna, Sparkles, CalendarCheck } from "lucide-react";
import { getCurrency } from "@/lib/currency-server";
import { eurRonRate } from "@/lib/currency";
import { dayToText, parseAnswers } from "@/lib/ridedna/answers";
import { localDateOf } from "@/lib/business-time";
import { creditForPath } from "@/lib/photos";
import { RideDnaQuiz } from "@/components/ridedna/quiz";

export const metadata: Metadata = { title: "RideDNA", description: "Answer a few questions and get a rider profile and three vehicles that fit you." };
export const dynamic = "force-dynamic";

const HERO = "/gallery/g3.jpg";

export default async function RideDnaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [currency, raw] = await Promise.all([getCurrency(), searchParams]);
  const parsed = parseAnswers(raw);
  const credit = creditForPath(HERO);
  const steps = [
    { icon: ClipboardList, title: "Tell us how you ride", text: "Seven short questions: experience, licence, kind of ride, priorities, trip and budget." },
    { icon: Sparkles, title: "Meet your profile", text: "A rider profile and up to three real vehicles from our fleet, with the reasons for each match." },
    { icon: CalendarCheck, title: "Check dates and book", text: "See availability and the exact price for your dates, then continue to the normal booking." },
  ];

  return (
    <>
      <section className="relative isolate overflow-hidden bg-canvas text-fg">
        <img src={HERO} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-canvas via-canvas/85 to-canvas/40" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-canvas via-transparent to-transparent" />
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="max-w-2xl space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-xs font-semibold tracking-wide text-accent-fg"><Dna aria-hidden className="size-3.5" /> RIDEDNA</p>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Find the ride that fits you.</h1>
            <p className="text-lg text-fg-soft">Answer a few questions. We build your rider profile and pick up to three vehicles from our fleet, and tell you why each one fits.</p>
          </div>
          {credit && <p className="mt-8 text-xs text-muted">Photo: {credit.author}, {credit.license}</p>}
        </div>
      </section>

      <div className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6">
        <ol className="grid gap-3 sm:grid-cols-3" aria-label="How RideDNA works">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-line bg-surface p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-accent-fg"><s.icon aria-hidden className="size-4" /> {i + 1}. {s.title}</p>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>

        <RideDnaQuiz currency={currency} eurRate={eurRonRate()} today={dayToText(localDateOf(new Date()))} initial={parsed.ok ? parsed.answers : undefined} startAtSummary={parsed.ok} />

        <p className="text-center text-sm text-muted">No account is needed to try RideDNA, and we do not save your answers in our database. A booking always needs your confirmation.</p>
      </div>
    </>
  );
}
