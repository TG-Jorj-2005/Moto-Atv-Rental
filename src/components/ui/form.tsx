import * as React from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-subtle disabled:cursor-not-allowed disabled:bg-surface-2 read-only:bg-surface-2";

export function Input({ className, type = "text", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type={type} className={cn(control, "h-10", className)} {...props} />;
}
export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-24 py-2", className)} {...props} />;
}
export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, "h-10 pr-8", className)} {...props} />;
}
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-fg", className)} {...props} />;
}

// A labelled field. `hint` explains the rule, `error` shows what went wrong (announced to screen readers).
export function Field({ label, htmlFor, hint, error, className, children }: { label: string; htmlFor?: string; hint?: string; error?: string | null; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
