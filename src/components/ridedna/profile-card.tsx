import Link from "next/link";
import { Compass, Pencil } from "lucide-react";
import type { RiderProfile } from "@/lib/ridedna/profile";

export function ProfileCard({ profile, editHref }: { profile: RiderProfile; editHref: string }) {
  return (
    <section aria-labelledby="profile-title" className="rounded-2xl border border-accent/40 bg-accent-soft p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-accent-fg"><Compass aria-hidden className="size-4" /> Your rider profile</p>
          <h2 id="profile-title" className="text-3xl font-bold tracking-tight">{profile.name}</h2>
          <p className="max-w-2xl text-fg-soft">{profile.description}</p>
        </div>
        <Link href={editHref} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold hover:bg-surface-2"><Pencil aria-hidden className="size-3.5" /> Change my answers</Link>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Your answers in short">
        {profile.traits.map((t) => <li key={t} className="rounded-full border border-line-strong bg-surface px-3 py-1 text-xs text-fg-soft">{t}</li>)}
      </ul>
      <ul className="mt-4 space-y-1 text-sm text-muted">
        {profile.reminders.map((r) => <li key={r}>{r}</li>)}
      </ul>
    </section>
  );
}
