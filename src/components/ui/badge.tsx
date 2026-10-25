import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-stone-100 text-stone-800",
      success: "bg-green-100 text-green-900",
      warning: "bg-amber-100 text-amber-900",
      danger: "bg-red-100 text-red-900",
      info: "bg-sky-100 text-sky-900",
      brand: "bg-brand-100 text-brand-900",
      dark: "bg-stone-900 text-white",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
