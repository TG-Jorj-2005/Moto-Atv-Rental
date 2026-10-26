"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

// Shown when something unexpected fails while rendering. The details are never shown to the visitor.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md space-y-5 text-center">
        <TriangleAlert aria-hidden className="mx-auto size-12 text-warning" />
        <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
        <p className="text-muted">We could not complete your request. Nothing was changed by this error. Please try again.</p>
        <div className="flex justify-center gap-2">
          <button onClick={reset} className={buttonVariants()}>Try again</button>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>Home</Link>
        </div>
      </div>
    </div>
  );
}
