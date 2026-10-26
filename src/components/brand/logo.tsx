import Link from "next/link";
import { cn } from "@/lib/utils";

// The mark: a wheel (the ring) and a trail climbing away from it (the zig-zag), on an accent tile. It is drawn with two
// strokes only, so it stays readable at 16px. The same geometry lives in public/brand/*.svg and src/app/icon.svg.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden focusable="false" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="8" fill="var(--color-accent)" />
      <g fill="none" stroke="var(--color-on-accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="20" r="5.5" />
        <path d="M17.5 22 21 13.5l2.5 4.5L27 9" />
      </g>
    </svg>
  );
}

// `full` = mark + wordmark, `mark` = mark only (compact menus, tight spaces). The link has an accessible name either way.
export function Logo({ href = "/", variant = "full", className }: { href?: string; variant?: "full" | "mark"; className?: string }) {
  return (
    <Link href={href} aria-label="Moto & ATV Rental, home" className={cn("inline-flex items-center gap-2.5 rounded-lg", className)}>
      <LogoMark />
      {variant === "full" && (
        <span aria-hidden className="flex flex-col whitespace-nowrap leading-none">
          <span className="text-[15px] font-extrabold uppercase tracking-[0.06em] text-fg">Moto &amp; ATV</span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.34em] text-accent-fg">Rental</span>
        </span>
      )}
    </Link>
  );
}
