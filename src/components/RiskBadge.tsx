import React from "react"
import { Badge } from "@/components/ui/badge"

interface RiskBadgeProps {
  status: "Safe" | "Warning" | "Critical"
  coverageDays: number
  className?: string
}

export function RiskBadge({ status, coverageDays, className }: RiskBadgeProps) {
  let variant: "safe" | "warning" | "destructive" = "safe"
  let icon = "🟢"
  
  if (status === "Critical") {
    variant = "destructive"
    icon = "🔴"
  } else if (status === "Warning") {
    variant = "warning"
    icon = "🟡"
  }

  const coverageText = coverageDays > 365 ? "999+ days" : `${coverageDays.toFixed(1)} days`

  return (
    <Badge variant={variant} className={className}>
      <span className="mr-1">{icon}</span>
      {status} ({coverageText})
    </Badge>
  )
}
