import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        "status-pending":
          "border-transparent bg-[hsl(var(--status-pending))] text-[hsl(var(--status-pending-foreground))] uppercase",
        "status-paid":
          "border-transparent bg-emerald-500 text-white uppercase",
        "status-expired":
          "border-transparent bg-[hsl(var(--status-expired))] text-[hsl(var(--status-expired-foreground))] uppercase",
        "status-failed":
          "border-transparent bg-red-600 text-white uppercase",
        "user-recurring":
          "border-transparent bg-[hsl(var(--user-recurring))] text-[hsl(var(--user-recurring-foreground))] uppercase",
        "user-new":
          "border-transparent bg-[hsl(var(--user-new))] text-[hsl(var(--user-new-foreground))] uppercase",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
