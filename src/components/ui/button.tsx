import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-brand-700 text-white hover:bg-brand-800",
        dark: "bg-stone-900 text-white hover:bg-stone-700",
        outline: "border border-stone-300 bg-white text-stone-900 hover:bg-stone-50",
        ghost: "text-stone-700 hover:bg-stone-100",
        danger: "bg-red-700 text-white hover:bg-red-800",
        dangerOutline: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
        link: "h-auto p-0 text-brand-700 underline-offset-4 hover:underline",
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
