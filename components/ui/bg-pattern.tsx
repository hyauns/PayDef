import * as React from "react"
import { cn } from "@/lib/utils"

interface BGPatternProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "grid" | "dots" | "stripes" | "checkerboard"
  mask?: "none" | "fade-edges" | "fade-bottom" | "fade-top"
  size?: number
  fill?: string
}

export function BGPattern({
  variant = "grid",
  mask = "fade-edges",
  size = 28,
  fill = "rgba(255, 255, 255, 0.055)",
  className,
  style,
  ...props
}: BGPatternProps) {
  const maskClasses = {
    none: "",
    "fade-edges": "[mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]",
    "fade-bottom": "[mask-image:linear-gradient(to_bottom,black_40%,transparent_100%)]",
    "fade-top": "[mask-image:linear-gradient(to_top,black_40%,transparent_100%)]",
  }

  const renderPattern = () => {
    switch (variant) {
      case "grid":
        return (
          <svg className="absolute inset-0 size-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern
                id={`pattern-grid`}
                width={size}
                height={size}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${size} 0 L 0 0 0 ${size}`}
                  fill="none"
                  stroke={fill}
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#pattern-grid)`} />
          </svg>
        )
      default:
        return null
    }
  }

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-0 size-full",
        maskClasses[mask],
        className
      )}
      style={style}
      {...props}
    >
      {renderPattern()}
    </div>
  )
}
