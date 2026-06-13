import * as React from "react"

import { cn } from "@/lib/utils"

const Card = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-2xl border bg-card text-card-foreground shadow-sm", className)} {...props} />
  ),
)
Card.displayName = "Card"

const CardContent = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn(className)} {...props} />,
)
CardContent.displayName = "CardContent"

export { Card, CardContent }

