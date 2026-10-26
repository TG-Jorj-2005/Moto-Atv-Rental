import Link from "next/link";
import { CalendarSearch } from "lucide-react";
import { DURATION_IDS, DURATION_LABEL, answersToQuery, dayToText, type RideDnaAnswers } from "@/lib/ridedna/answers";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import type { PeriodState } from "@/lib/ridedna/service";
import { formatLocalDateTime } from "@/lib/business-time";

// A plain GET form: it reopens the same results with another first day or length. The server recomputes everything.
export function PeriodForm({ answers, period, minDay }: { answers: RideDnaAnswers; period: PeriodState; minDay: string }) {
  const keep = answersToQuery(answers);
  keep.delete("start");
  keep.delete("dur");
  const withoutDate = answersToQuery({ ...answers, start: null });
  return (
    <section aria-labelledby="period-title" className="rounded-2xl border border-line bg-surface p-5">
      <h2 id="period-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight"><CalendarSearch aria-hidden className="size-5 text-accent-fg" /> When do you want to ride?</h2>
      <p className="mt-1 text-sm text-muted">Choose the first day (the ride starts at 09:00, Bucharest time) and we check which of these vehicles are free and show the exact price. The price and availability are checked again when you book.</p>
      <form method="get" action="/ridedna/results" className="mt-4 flex flex-wrap items-end gap-3">
        {[...keep.entries()].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <Field label="First day" htmlFor="rd-start" className="w-48"><Input id="rd-start" type="date" name="start" min={minDay} defaultValue={answers.start ? dayToText(answers.start) : ""} /></Field>
        <Field label="How long" htmlFor="rd-dur" className="w-52">
          <Select id="rd-dur" name="dur" defaultValue={answers.duration}>{DURATION_IDS.map((d) => <option key={d} value={d}>{DURATION_LABEL[d]}</option>)}</Select>
        </Field>
        <Button><CalendarSearch aria-hidden className="size-4" /> Check availability</Button>
        {answers.start && <Link href={`/ridedna/results?${withoutDate.toString()}`} className={buttonVariants({ variant: "ghost" })}>Clear the day</Link>}
      </form>
      {period.kind === "EXACT" && <p className="mt-3 text-sm font-medium text-success">Showing vehicles free from {formatLocalDateTime(period.period.startAt)} to {formatLocalDateTime(period.period.endAt)} (Bucharest time).</p>}
    </section>
  );
}
