"use client"

import React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RiskBadge } from "@/components/RiskBadge"
import { Package, Truck, AlertCircle, ExternalLink } from "lucide-react"

export interface FabricData {
  name: string
  role: string
  consumption_cm: number
  ratio: number
  daily_demand: number
  demand_14d: number
  inventory: number
  wip: number
  lead_time: number
  moq: number
  available: number
  coverage_days: number
  reorder_qty: number
  status: "Safe" | "Warning" | "Critical"
  used_in_styles: string[]
}

interface FabricCardProps {
  fabric: FabricData
  onSelectFabric?: (name: string) => void
}

export function FabricCard({ fabric, onSelectFabric }: FabricCardProps) {
  return (
    <Card
      className="flex flex-col h-full border-border/50 hover:border-primary/50 transition-colors shadow-sm bg-card/60 backdrop-blur-md cursor-pointer group"
      onClick={() => onSelectFabric?.(fabric.name)}
    >
      <CardHeader className="py-4 border-b border-border/30 bg-secondary/20">
        <div className="flex justify-between items-start">
          <div className="space-y-1 min-w-0 flex-1">
            <CardTitle className="text-lg leading-tight text-foreground truncate capitalize">
              {fabric.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              {fabric.role}
            </p>
          </div>
          <RiskBadge
            status={fabric.status}
            coverageDays={fabric.coverage_days}
          />
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-4 grid grid-cols-2 gap-y-4 gap-x-2">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground mb-1">
            Daily Demand
          </span>
          <span className="font-semibold text-sm">
            {fabric.daily_demand.toFixed(1)} m/day
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground mb-1">
            14-Day Need
          </span>
          <span className="font-semibold text-sm">
            {fabric.demand_14d.toFixed(0)} m
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground mb-1">Inventory</span>
          <div className="flex items-center space-x-1">
            <Package size={14} className="text-blue-400" />
            <span className="font-semibold text-sm">
              {fabric.inventory.toFixed(1)} m
            </span>
          </div>
        </div>

        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground mb-1">WIP</span>
          <div className="flex items-center space-x-1">
            <Truck size={14} className="text-purple-400" />
            <span className="font-semibold text-sm">
              {fabric.wip.toFixed(1)} m
            </span>
          </div>
        </div>

        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground mb-1">BOM</span>
          <span className="font-semibold text-sm">
            {fabric.consumption_cm} cm
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground mb-1">Used In</span>
          <span className="font-semibold text-sm">
            {fabric.used_in_styles.length} style{fabric.used_in_styles.length !== 1 ? "s" : ""}
          </span>
        </div>
      </CardContent>

      {fabric.reorder_qty > 0 && (
        <div className="p-4 mt-auto border-t border-border/30 bg-primary/5 rounded-b-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-primary">
              <AlertCircle size={16} />
              <span className="text-xs font-semibold uppercase tracking-wide">
                Reorder Needed
              </span>
            </div>
            <span className="font-bold text-primary">
              {fabric.reorder_qty.toFixed(1)} m
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            MOQ: {fabric.moq} m · Lead: {fabric.lead_time}d
          </div>
        </div>
      )}

      {/* Click hint */}
      <div className="px-4 py-2 border-t border-border/20 flex items-center justify-center gap-1 text-xs text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">
        <ExternalLink size={12} />
        Click for details
      </div>
    </Card>
  )
}
