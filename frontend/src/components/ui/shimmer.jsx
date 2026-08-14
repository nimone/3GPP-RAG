import * as React from "react"
import { cn } from "@/lib/utils"

export function ShimmerText({ className, children, ...props }) {
  return (
    <span
      className={cn("shimmer-text inline-block font-medium", className)}
      {...props}
    >
      {children}
    </span>
  )
}

export function ShimmerBlock({ className, ...props }) {
  return (
    <div
      className={cn("shimmer-line h-4 w-full rounded", className)}
      {...props}
    />
  )
}

export function ShimmerSkeleton({ className, lines = 3, ...props }) {
  return (
    <div className={cn("space-y-2.5 w-full py-1", className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <ShimmerBlock
          key={i}
          className={cn(
            i === 0 && "w-3/4",
            i === 1 && "w-full",
            i === 2 && "w-5/6",
            i > 2 && "w-4/5"
          )}
        />
      ))}
    </div>
  )
}
