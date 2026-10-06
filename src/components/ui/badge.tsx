import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground ring-border",
        primary: "bg-primary-soft text-primary ring-primary/15",
        success: "bg-success-soft text-success ring-success/20",
        warning: "bg-warning-soft text-warning ring-warning/20",
        danger: "bg-danger-soft text-danger ring-danger/20",
        info: "bg-info-soft text-info ring-info/20",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
