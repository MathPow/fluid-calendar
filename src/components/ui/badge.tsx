import * as React from "react";

import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Pill badges. Warm variants (`positive`, `pending`, `negative`) are for
 * statuses only; `tint` is the client colour and never means a status.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-medium leading-[1.25] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-secondary text-muted-foreground",
        secondary: "bg-secondary text-muted-foreground",
        ink: "bg-foreground text-background",
        tint: "bg-tint-soft text-foreground",
        positive: "bg-positive text-positive-foreground",
        pending: "bg-pending text-pending-foreground",
        negative: "bg-negative text-negative-foreground",
        destructive: "bg-negative text-negative-foreground",
        outline: "border border-border bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
