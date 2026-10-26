import * as React from "react";
import { cn } from "@/lib/utils";

// A choice drawn as a card. It is a real radio button or checkbox underneath (keyboard, screen readers, form value).
export function OptionCard({ type, name, value, checked, disabled, onChange, title, hint, icon, className }: {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("relative block cursor-pointer", disabled && "cursor-not-allowed opacity-50", className)}>
      <input type={type} name={name} value={value} checked={checked} disabled={disabled} onChange={onChange} className="peer sr-only" />
      <span className="flex h-full items-start gap-3 rounded-xl border border-line bg-surface p-4 transition-colors peer-checked:border-accent peer-checked:bg-accent-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-fg hover:border-line-strong">
        {icon && <span aria-hidden className="mt-0.5 text-accent-fg">{icon}</span>}
        <span className="space-y-0.5">
          <span className="block font-semibold text-fg">{title}</span>
          {hint && <span className="block text-sm text-muted">{hint}</span>}
        </span>
      </span>
      <span aria-hidden className={cn("pointer-events-none absolute right-3 top-3 grid size-5 place-items-center rounded-full border text-[11px] font-bold", checked ? "border-accent bg-accent text-on-accent" : "border-line-strong text-transparent")}>✓</span>
    </label>
  );
}
