"use client"

import { useEffect, useState, useCallback, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/context/AuthContext"
import { MetricCard } from "@/components/MetricCard"
import { FabricCard, type FabricData } from "@/components/FabricCard"
import { FabricDetailPanel } from "@/components/FabricDetailPanel"
import {
  Package,
  Activity,
  AlertTriangle,
  ShoppingCart,
  Download,
  Search,
  Filter,
  Save,
  Layers,
  ChevronDown,
  RefreshCw,
} from "lucide-react"
import { apiGet, apiPost } from "@/lib/api"

interface DashboardSummary {
  active_styles: number
  active_families: number
  total_fabrics: number
  total_14d_demand: number
  total_reorder: number
  critical_risks: number
  warnings: number
  forecast_freshness: "Fresh" | "Warning" | "Stale"
  forecast_hours_old: number | null
  forecast_last_update: string | null
}

interface FamilyResult {
  family: string
  style_demand: number
  confidence: string
  fabrics: FabricData[]
}

function DashboardContent() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const familyFilter = searchParams.get("family")

  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [families, setFamilies] = useState<FamilyResult[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [riskFilter, setRiskFilter] = useState<"all" | "Critical" | "Warning" | "Safe">("all")
  const [selectedFabric, setSelectedFabric] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState("")
  const [selectedFamily, setSelectedFamily] = useState<string>("all")
  const [familyList, setFamilyList] = useState<string[]>([])

  // Inventory edit states (keyed by fabric name)
  const [editedInputs, setEditedInputs] = useState<
    Record<string, { inventory: number; wip: number; lead_time: number; buffer_days: number; moq: number }>
  >({})

  const fetchData = useCallback(async () => {
    try {
      const familyParam = selectedFamily !== "all" ? `?family=${encodeURIComponent(selectedFamily)}` : ""
      const [summaryData, familiesData] = await Promise.all([
        apiGet<DashboardSummary>(`/api/dashboard/summary${familyParam}`),
        apiGet<FamilyResult[]>(`/api/dashboard/fabrics${familyParam}`),
      ])
      setSummary(summaryData)
      setFamilies(familiesData)
    } catch (e: unknown) {
      console.error("Dashboard fetch error", e)
    } finally {
      setLoading(false)
    }
  }, [selectedFamily])

  useEffect(() => {
    if (!user) return
    void fetchData()
  }, [user, fetchData])

  // Fetch family list once on mount for the dropdown
  useEffect(() => {
    if (!user) return
    apiGet<string[]>("/api/dashboard/families")
      .then((data) => setFamilyList(data))
      .catch((err: unknown) => console.error("Failed to fetch families", err))
  }, [user])

  // Automatic scrolling and highlighting logic
  useEffect(() => {
    if (familyFilter && families.length > 0) {
      const elementId = `family-group-${familyFilter.replace(/\s+/g, '-').toLowerCase()}`
      const element = document.getElementById(elementId)
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth", block: "center" })
          element.classList.add("ring-2", "ring-primary", "ring-offset-8", "rounded-2xl")
          setTimeout(() => {
            element.classList.remove("ring-2", "ring-primary", "ring-offset-8")
          }, 4000)
        }, 800)
      }
    }
  }, [familyFilter, families])

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="p-8 text-center bg-card rounded-2xl border border-border">
          <AlertTriangle className="mx-auto h-12 w-12 text-warning mb-4" />
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            Please log in using the sidebar to view the Dashboard.
          </p>
        </div>
      </div>
    )
  }

  // Derived data
  const riskCount = summary ? summary.critical_risks + summary.warnings : 0
  const isHighRisk = riskCount > 5
  const isStale = summary?.forecast_freshness === "Stale"
  const isEditor = user.role !== "Viewer"

  // Filter families and fabrics
  const filteredFamilies = families
    .map((f) => ({
      ...f,
      fabrics: f.fabrics
        .map((fab) => {
          if (!editedInputs[fab.name]) return fab

          const edited = editedInputs[fab.name]
          const available = edited.inventory + (edited.wip * (fab.consumption_cm / 100))
          const coverage_days = fab.daily_demand > 0 ? available / fab.daily_demand : 999
          
          const threshold = edited.lead_time + edited.buffer_days
          const status = (coverage_days < threshold ? "Critical" : coverage_days < threshold + 3 ? "Warning" : "Safe") as "Safe" | "Warning" | "Critical"
          
          // Reorder logic matches core_logic.py (LeadTime + Buffer) * Demand
          const required_stock = threshold * fab.daily_demand
          let reorder_qty = Math.max(0, required_stock - available)
          if (reorder_qty > 0) reorder_qty = Math.max(edited.moq, reorder_qty)

          return { ...fab, ...edited, available, coverage_days, status, reorder_qty }
        })
        .filter((fab) => {
          const matchesSearch =
            fab.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            f.family.toLowerCase().includes(searchTerm.toLowerCase())
          const matchesRisk =
            riskFilter === "all" || fab.status === riskFilter
          return matchesSearch && matchesRisk
        }),
    }))
    .filter((f) => f.fabrics.length > 0)

  // CSV export
  const downloadCSV = () => {
    const headers =
      "Fabric Family,Fabric Name,Role,Consumption (cm),Daily Demand (m),14d Demand (m),Inventory (m),WIP (m),Coverage Days,Status,Reorder Qty (m)\n"
    const rows = families
      .flatMap((f) =>
        f.fabrics.map(
          (fab) =>
            `"${f.family}","${fab.name}","${fab.role}",${fab.consumption_cm},${fab.daily_demand},${fab.demand_14d},${fab.inventory},${fab.wip},${fab.coverage_days},"${fab.status}",${fab.reorder_qty}`
        )
      )
      .join("\n")

    const blob = new Blob([headers + rows], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "fabricintel_planning_export.csv"
    a.click()
  }

  // Save inventory inputs
  const handleSaveInputs = async () => {
    if (!isEditor || Object.keys(editedInputs).length === 0) return

    setSaving(true)
    try {
      const items = Object.entries(editedInputs).map(([fabric_name, vals]) => ({
        fabric_name,
        ...vals,
      }))

      await apiPost("/api/dashboard/save-inputs", { user: user.username, items })
      
      setSaveMsg("Inputs saved successfully!")
      setEditedInputs({})
      void fetchData() // Refresh with new calculations
      setTimeout(() => setSaveMsg(""), 3000)
    } catch (err: unknown) {
      console.error(err)
      setSaveMsg(err instanceof Error ? err.message : "Failed to save inputs")
    } finally {
      setSaving(false)
    }
  }

  // Freshness display
  const freshnessColor =
    summary?.forecast_freshness === "Fresh"
      ? "text-safe"
      : summary?.forecast_freshness === "Warning"
      ? "text-warning"
      : "text-destructive"

  const freshnessIcon =
    summary?.forecast_freshness === "Fresh"
      ? "🟢"
      : summary?.forecast_freshness === "Warning"
      ? "🟡"
      : "🔴"

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">Control Tower</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time supply chain overview and inventory risks.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {/* Fabric Family Dropdown */}
          <div className="relative">
            <select
              id="family-selector"
              value={selectedFamily}
              onChange={(e) => {
                setSelectedFamily(e.target.value)
                setLoading(true)
              }}
              className="bg-background border border-primary/30 rounded-lg pl-3 pr-8 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer"
            >
              <option value="all">All Collections</option>
              {familyList.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
          </div>
          {/* Forecast Freshness Badge */}
          {summary && (
            <div
              className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full bg-secondary/40 border border-border/50 ${freshnessColor}`}
            >
              <span>{freshnessIcon}</span>
              <span>{summary.forecast_freshness}</span>
              {summary.forecast_hours_old !== null && (
                <span className="text-muted-foreground font-normal text-xs">
                  ({summary.forecast_hours_old < 24
                    ? `${summary.forecast_hours_old.toFixed(0)}h`
                    : `${(summary.forecast_hours_old / 24).toFixed(1)}d`}
                  )
                </span>
              )}
            </div>
          )}
          <button
            onClick={downloadCSV}
            className="flex items-center space-x-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2 text-sm font-medium rounded-md transition-colors border border-border"
          >
            <Download size={16} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Stale warning */}
      {isStale && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={20} className="text-destructive" />
          <div>
            <div className="text-sm font-semibold text-destructive">
              Forecast is Stale
            </div>
            <div className="text-xs text-destructive/80">
              Reorder actions are disabled. Please update the forecast via the
              Forecast Engine.
            </div>
          </div>
        </div>
      )}

      {/* Metrics Row */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-32 bg-secondary/30 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : (
        summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Active Styles"
              value={summary.active_styles}
              icon={<Package size={20} />}
              description={`${summary.active_families} fabric families`}
            />
            <MetricCard
              title="14-Day Demand"
              value={`${Math.round(summary.total_14d_demand)} m`}
              icon={<Activity size={20} />}
              description="Summed across all fabrics"
            />
            <MetricCard
              title="Total Reorder"
              value={`${Math.round(summary.total_reorder)} m`}
              icon={<ShoppingCart size={20} />}
              description="Required raw material"
            />
            <MetricCard
              title="Risk Alerts"
              value={riskCount}
              icon={<AlertTriangle size={20} />}
              trendUp={!isHighRisk}
              trend={summary.critical_risks + " Critical"}
              className={isHighRisk ? "border-destructive/30" : ""}
            />
          </div>
        )
      )}

      {/* User Flow Guide */}
      {!loading && (
        <div className="bg-secondary/10 border border-border/30 rounded-xl p-4">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Layers size={14} className="text-primary" />
            <span className="font-semibold">How to use:</span>
            <span>Select a fabric card → Enter inventory, WIP, Lead Time, MOQ → View risk level → Save inputs</span>
          </div>
        </div>
      )}

      {/* Fabric Cards Layout */}
      <div className="space-y-6 pt-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Filter size={18} className="text-muted-foreground" />
            Fabric Inventory Details
          </h2>

          <div className="flex items-center gap-3">
            {/* Risk Filter */}
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value as typeof riskFilter)}
              className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Risks</option>
              <option value="Critical">🔴 Critical</option>
              <option value="Warning">🟡 Warning</option>
              <option value="Safe">🟢 Safe</option>
            </select>

            {/* Search */}
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search fabrics or families..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Save bar */}
        {Object.keys(editedInputs).length > 0 && isEditor && (
          <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl p-4">
            <div className="text-sm">
              <span className="font-semibold text-primary">
                {Object.keys(editedInputs).length}
              </span>{" "}
              fabric(s) with unsaved changes
            </div>
            <button
              onClick={handleSaveInputs}
              disabled={saving || isStale}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isStale
                  ? "bg-secondary text-muted-foreground cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save All Inputs"}
            </button>
          </div>
        )}

        {saveMsg && (
          <div className="bg-safe/20 text-safe border border-safe/30 px-4 py-3 rounded-md text-sm font-medium animate-in slide-in-from-top-2">
            ✓ {saveMsg}
          </div>
        )}

        {loading ? (
          <div className="space-y-8">
            {[1, 2].map((i) => (
              <div key={i} className="space-y-4">
                <div className="h-8 w-48 bg-secondary/30 rounded-md animate-pulse" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3].map((j) => (
                    <div
                      key={j}
                      className="h-48 bg-secondary/20 rounded-xl animate-pulse"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-12">
            {filteredFamilies.map((fam, idx) => (
              <div 
                key={idx} 
                id={`family-group-${fam.family.replace(/\s+/g, '-').toLowerCase()}`}
                className="space-y-4 scroll-mt-32 transition-all duration-1000 p-2"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-foreground capitalize">
                    {fam.family}{" "}
                    <span className="text-muted-foreground font-normal text-sm ml-2">
                      Apparel Line
                    </span>
                  </h3>
                  <div className="text-sm px-3 py-1 bg-secondary/40 rounded-full text-secondary-foreground border border-border/50">
                    Demand:{" "}
                    <span className="font-semibold text-primary">
                      {fam.style_demand.toFixed(1)}
                    </span>{" "}
                    units/day
                    <span className="text-muted-foreground ml-2 text-xs">
                      ({fam.confidence})
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {fam.fabrics.map((fabric, fIdx) => (
                    <FabricCard
                      key={fIdx}
                      fabric={fabric}
                      onSelectFabric={setSelectedFabric}
                    />
                  ))}
                </div>

                {/* Inline inventory inputs for this family */}
                {isEditor && !isStale && (
                  <details className="bg-secondary/5 rounded-xl border border-border/30 overflow-hidden shadow-sm">
                    <summary className="p-4 text-sm font-semibold text-muted-foreground cursor-pointer hover:bg-secondary/10 transition-colors list-none flex items-center gap-2">
                      <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
                      ✏️ Edit Inventory Inputs for {fam.family}
                    </summary>
                    <div className="p-4 pt-0 space-y-3">
                      {fam.fabrics.map((fab) => {
                        const edited = editedInputs[fab.name] || {
                          inventory: fab.inventory,
                          wip: fab.wip,
                          lead_time: fab.lead_time,
                          buffer_days: fab.buffer_days,
                          moq: fab.moq,
                        }
                        return (
                          <div
                            key={fab.name}
                            className="grid grid-cols-6 gap-3 items-center bg-secondary/20 rounded-lg p-3 border border-border/30"
                          >
                            <div className="text-sm font-medium capitalize truncate">
                              {fab.name}
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">
                                Inventory (m)
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={edited.inventory}
                                onChange={(e) =>
                                  setEditedInputs((prev) => ({
                                    ...prev,
                                    [fab.name]: {
                                      ...edited,
                                      inventory: Number(e.target.value),
                                    },
                                  }))
                                }
                                className="w-full bg-background border border-border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">
                                WIP (pcs)
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={edited.wip}
                                onChange={(e) =>
                                  setEditedInputs((prev) => ({
                                    ...prev,
                                    [fab.name]: {
                                      ...edited,
                                      wip: Number(e.target.value),
                                    },
                                  }))
                                }
                                className="w-full bg-background border border-border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">
                                Lead (days)
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={edited.lead_time}
                                onChange={(e) =>
                                  setEditedInputs((prev) => ({
                                    ...prev,
                                    [fab.name]: {
                                      ...edited,
                                      lead_time: Number(e.target.value),
                                    },
                                  }))
                                }
                                className="w-full bg-background border border-border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">
                                Buffer (days)
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={edited.buffer_days}
                                onChange={(e) =>
                                  setEditedInputs((prev) => ({
                                    ...prev,
                                    [fab.name]: {
                                      ...edited,
                                      buffer_days: Number(e.target.value),
                                    },
                                  }))
                                }
                                className="w-full bg-background border border-border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">
                                MOQ (m)
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={edited.moq}
                                onChange={(e) =>
                                  setEditedInputs((prev) => ({
                                    ...prev,
                                    [fab.name]: {
                                      ...edited,
                                      moq: Number(e.target.value),
                                    },
                                  }))
                                }
                                className="w-full bg-background border border-border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </details>
                )}

                <div className="h-px bg-gradient-to-r from-border/50 via-border to-transparent mt-8" />
              </div>
            ))}

            {filteredFamilies.length === 0 && (
              <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
                No fabrics found matching your search and filters.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fabric Detail Panel */}
      {selectedFabric && (
        <FabricDetailPanel
          fabricName={selectedFabric}
          onClose={() => setSelectedFabric(null)}
        />
      )}
    </div>
  )
}

export default function Dashboard() {
  return (
    <Suspense fallback={
       <div className="flex h-screen items-center justify-center p-8 bg-background">
          <div className="flex flex-col items-center gap-6">
            <RefreshCw className="h-12 w-12 animate-spin text-primary opacity-50" />
            <p className="text-lg font-bold tracking-tight text-muted-foreground animate-pulse">Initializing Control Tower...</p>
          </div>
        </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}
