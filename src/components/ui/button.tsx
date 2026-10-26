import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 aria-busy:opacity-70 cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-accent text-on-accent hover:bg-accent-hover",
        dark: "bg-surface-3 text-fg hover:bg-line-strong",
        outline: "border border-line-strong bg-surface text-fg hover:bg-surface-2",
        ghost: "text-fg-soft hover:bg-surface-3",
        danger: "bg-danger-solid text-white hover:bg-danger-solid/85",
        dangerOutline: "border border-danger/40 bg-surface text-danger hover:bg-danger-soft",
        link: "h-auto p-0 text-accent-fg underline-offset-4 hover:underline",
      },
      size: { sm: "h-8 px-3", md: "h-10 px-4", lg: "h-12 px-6 text-base", icon: "h-10 w-10" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

// For links styled as buttons use the class helper: <Link className={buttonVariants({ variant: "outline" })} />
export function Button({ className, variant, size, type = "submit", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
