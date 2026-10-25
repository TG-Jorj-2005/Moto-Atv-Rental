import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-stone-200", className)} />;
}

export function PageHeader({ title, description, actions, className }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-stone-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center", className)}>
      <Icon aria-hidden className="size-8 text-stone-500" />
      <p className="font-semibold text-stone-900">{title}</p>
      {description && <p className="max-w-md text-sm text-stone-600">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; tone?: "warning" | "danger" }) {
  return (
    <Card className={cn("p-4", tone === "warning" && "border-amber-300 bg-amber-50", tone === "danger" && "border-red-300 bg-red-50")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-stone-600">{label}</p>
        {Icon && <Icon aria-hidden className="size-4 text-stone-500" />}
      </div>
      <p className="mt-1 text-2xl font-bold tracking-tight text-stone-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-stone-600">{hint}</p>}
    </Card>
  );
}

export function Section({ title, description, actions, children, className }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-stone-900">{title}</h2>
          {description && <p className="text-sm text-stone-600">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

// Tabs made of plain links: the current tab is marked with aria-current and works without JavaScript.
export function LinkTabs({ items, className }: { items: { href: string; label: string; active: boolean; count?: number }[]; className?: string }) {
  return (
    <nav aria-label="Sections" className={cn("flex flex-wrap gap-1 rounded-lg bg-stone-100 p-1", className)}>
      {items.map((t) => (
        <a
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn("rounded-md px-3 py-1.5 text-sm font-medium", t.active ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900")}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 text-xs text-stone-500">{t.count}</span>}
        </a>
      ))}
    </nav>
  );
}
