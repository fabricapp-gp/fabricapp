"use client"

import React, { useEffect, useState } from "react"
import {
  X,
  Package,
  Truck,
  Clock,
  ShoppingCart,
  AlertCircle,
  Layers,
  ArrowRight,
} from "lucide-react"
import { apiGet } from "@/lib/api"

interface FabricUsage {
  style: string
  family: string
  consumption_cm: number
}

interface FabricDetailData {
  fabric_name: string
  main_usage: FabricUsage[]
  lining_usage: FabricUsage[]
  demand: {
    fabric: string
    demand_daily: number
    demand_14d: number
    used_in_count: number
    role: string
  } | null
  saved_inputs: {
    inventory: number
    wip: number
    lead_time: number
    moq: number
  }
}

interface FabricDetailPanelProps {
  fabricName: string
  family?: string
  onClose: () => void
}

export function FabricDetailPanel({ fabricName, family, onClose }: FabricDetailPanelProps) {
  const [data, setData] = useState<FabricDetailData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const familyParam = family ? `?family=${encodeURIComponent(family)}` : ""
        const data = await apiGet<FabricDetailData>(
          `/api/dashboard/fabric-detail/${encodeURIComponent(fabricName)}${familyParam}`
        )
        setData(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchDetail()
  }, [fabricName])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg h-full bg-card border-l border-border overflow-y-auto animate-in slide-in-from-right-4 duration-300">
        {/* Header */}
        <div className="sticky top-0 bg-card/95 backdrop-blur-md border-b border-border p-5 flex items-center justify-between z-10">
          <div>
            <h3 className="text-lg font-bold capitalize">{fabricName}</h3>
            <p className="text-xs text-muted-foreground">Fabric Detail & Usage</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary/50 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground">
            Loading fabric details...
          </div>
        ) : data ? (
          <div className="p-5 space-y-6">
            {/* Demand Overview */}
            {data.demand && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary/30 rounded-lg p-4 border border-border/30">
                  <div className="text-xs text-muted-foreground mb-1">
                    Daily Demand
                  </div>
                  <div className="text-xl font-bold text-primary">
                    {data.demand.demand_daily.toFixed(2)} m
                  </div>
                </div>
                <div className="bg-secondary/30 rounded-lg p-4 border border-border/30">
                  <div className="text-xs text-muted-foreground mb-1">
                    14-Day Demand
                  </div>
                  <div className="text-xl font-bold text-primary">
                    {data.demand.demand_14d.toFixed(1)} m
                  </div>
                </div>
              </div>
            )}

            {/* Current Inventory Inputs */}
            <div className="bg-secondary/10 rounded-xl p-4 border border-border/30 space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Inventory Parameters
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Package size={14} className="text-blue-400" />
                  <span className="text-xs text-muted-foreground">Inventory:</span>
                  <span className="text-sm font-semibold">
                    {data.saved_inputs.inventory} m
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Truck size={14} className="text-purple-400" />
                  <span className="text-xs text-muted-foreground">WIP:</span>
                  <span className="text-sm font-semibold">
                    {data.saved_inputs.wip} pcs
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-amber-400" />
                  <span className="text-xs text-muted-foreground">Lead Time:</span>
                  <span className="text-sm font-semibold">
                    {data.saved_inputs.lead_time} days
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <ShoppingCart size={14} className="text-emerald-400" />
                  <span className="text-xs text-muted-foreground">MOQ:</span>
                  <span className="text-sm font-semibold">
                    {data.saved_inputs.moq} m
                  </span>
                </div>
              </div>
            </div>

            {/* Usage: Where is this fabric used? */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Layers size={16} className="text-primary" />
                Where is this fabric used?
              </h4>

              {/* Main usage */}
              {data.main_usage.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    As Main Fabric ({data.main_usage.length})
                  </div>
                  {data.main_usage.map((u, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-secondary/20 rounded-lg p-3 border border-border/30"
                    >
                      <div className="flex items-center gap-2">
                        <ArrowRight size={12} className="text-blue-400" />
                        <div>
                          <div className="text-sm font-medium">{u.style}</div>
                          <div className="text-xs text-muted-foreground">
                            {u.family}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {u.consumption_cm} cm
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Lining usage */}
              {data.lining_usage.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    As Lining ({data.lining_usage.length})
                  </div>
                  {data.lining_usage.map((u, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-secondary/20 rounded-lg p-3 border border-border/30"
                    >
                      <div className="flex items-center gap-2">
                        <ArrowRight size={12} className="text-purple-400" />
                        <div>
                          <div className="text-sm font-medium">{u.style}</div>
                          <div className="text-xs text-muted-foreground">
                            {u.family}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {u.consumption_cm} cm
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {data.main_usage.length === 0 && data.lining_usage.length === 0 && (
                <div className="text-xs text-muted-foreground bg-secondary/20 rounded-lg p-4 text-center border border-border/30">
                  <AlertCircle size={16} className="mx-auto mb-2 text-muted-foreground" />
                  No usage data found for this fabric.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            Failed to load fabric details.
          </div>
        )}
      </div>
    </div>
  )
}
