import React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface MetricCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  description?: string
  trend?: string
  trendUp?: boolean
  className?: string
}

export function MetricCard({ 
  title, 
  value, 
  icon, 
  description, 
  trend, 
  trendUp,
  className 
}: MetricCardProps) {
  return (
    <Card className={cn("overflow-hidden group", className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between space-x-4">
          <div className="flex flex-col space-y-2">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {title}
            </p>
            <div className="flex items-baseline space-x-2">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                {value}
              </h2>
              {trend && (
                <span className={cn(
                  "text-xs font-semibold px-2 py-0.5 rounded-full",
                  trendUp ? "bg-safe/20 text-safe" : "bg-destructive/20 text-destructive"
                )}>
                  {trendUp ? "↑" : "↓"} {trend}
                </span>
              )}
            </div>
          </div>
          <div className="p-3 bg-primary/10 rounded-xl text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
            {icon}
          </div>
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-4">
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
