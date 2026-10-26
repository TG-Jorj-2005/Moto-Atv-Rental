"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

// Shown when the recommendations cannot be computed (for example the database is not reachable). Nothing was changed.
export default function ResultsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-20 text-center">
      <TriangleAlert aria-hidden className="mx-auto size-10 text-warning" />
      <h1 className="text-2xl font-bold tracking-tight">We could not find your rides</h1>
      <p className="text-muted">Something went wrong while looking at our fleet. Your answers are safe in the address of this page. Nothing was booked.</p>
      <div className="flex justify-center gap-2">
        <button type="button" onClick={reset} className={buttonVariants()}>Try again</button>
        <Link href="/ridedna" className={buttonVariants({ variant: "outline" })}>Back to RideDNA</Link>
      </div>
    </div>
  );
}
