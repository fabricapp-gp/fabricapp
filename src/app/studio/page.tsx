"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/AuthContext"
import { Badge } from "@/components/ui/badge"
import {
  Archive,
  RefreshCw,
  Lock,
  Search,
  Plus,
  Upload,
  AlertCircle,
  CheckCircle2,
} from "lucide-react"
import { apiGet, apiPost, apiUpload, apiFetch } from "@/lib/api"
import { StudioOverrides } from "@/lib/firestore"

interface StyleRow {
  style_name: string
  fabric_family: string
  main1_name: string
  main1_cm: number
  main2_name: string
  main2_cm: number
  lining_name: string
  lining_cm: number
  last_updated_by: string
  last_updated_time: string
  status: string
  predicted_demand: number
}

export default function StudioPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [activeStyles, setActiveStyles] = useState<StyleRow[]>([])
  const [archivedStyles, setArchivedStyles] = useState<StyleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE")
  const [searchTerm, setSearchTerm] = useState("")
  const [toastMsg, setToastMsg] = useState("")
  const [toastType, setToastType] = useState<"success" | "error">("success")

  const [showAddForm, setShowAddForm] = useState<false | "ADD" | "EDIT">(false)
  const [newStyle, setNewStyle] = useState({
    style_name: "",
    fabric_family: "",
    fabric1: "",
    fabric1_cm: 0,
    fabric2: "",
    fabric2_cm: 0,
    lining: "",
    lining_cm: 0,
  })
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [adding, setAdding] = useState(false)

  // CSV Upload state
  const [showCsvUpload, setShowCsvUpload] = useState(false)
  const [csvColumns, setCsvColumns] = useState<string[]>([])
  const [csvRowCount, setCsvRowCount] = useState(0)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  
  // Persistent override state for Vercel restarts
  const [studioOverrides, setStudioOverrides] = useState<StudioOverrides>({ added: [], updated: {}, archived: {} })

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToastMsg(msg)
    setToastType(type)
    setTimeout(() => setToastMsg(""), 4000)
  }

  const fetchStyles = useCallback(async (currentOverrides?: StudioOverrides) => {
    try {
      const { loadForecastResult, loadStudioOverrides } = await import("@/lib/firestore")
      const parsedResult = await loadForecastResult()
      const forecastData = (parsedResult?.forecast_data as Record<string, unknown>[]) || []
      
      const activeOverrides = currentOverrides || await loadStudioOverrides()
      if (!currentOverrides) setStudioOverrides(activeOverrides)

      const data = await apiPost<{ active: StyleRow[]; archived: StyleRow[]; total: number }>(
        "/api/studio/styles",
        { forecast_data: forecastData, studio_overrides: activeOverrides }
      )
      setActiveStyles(data.active)
      setArchivedStyles(data.archived)
    } catch (e: unknown) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) void fetchStyles()
  }, [user, fetchStyles])

  const handleToggleArchive = async (styleName: string, archive: boolean) => {
    if (!user || user.role === "Viewer") return

    try {
      const newOverrides = { 
        ...studioOverrides, 
        archived: { ...studioOverrides.archived, [styleName]: archive } 
      }
      setStudioOverrides(newOverrides)
      const { saveStudioOverrides } = await import("@/lib/firestore")
      await saveStudioOverrides(newOverrides)

      await apiPost("/api/studio/styles/archive", {
        style_name: styleName,
        archive,
        user: user.username,
        studio_overrides: newOverrides,
      })
      showToast(
        `${styleName} successfully ${archive ? "archived" : "restored"}.`
      )
      void fetchStyles(newOverrides)
    } catch (e: unknown) {
      console.error(e)
    }
  }

  // Form validation (client-side)
  const validateForm = (): string[] => {
    const errors: string[] = []

    if (!newStyle.style_name.trim()) {
      errors.push("Style name is required")
    }

    const hasFabric1 = newStyle.fabric1.trim() !== ""
    const hasFabric2 = newStyle.fabric2.trim() !== ""
    const hasLining = newStyle.lining.trim() !== ""

    if (!hasFabric1 && !hasFabric2 && !hasLining) {
      errors.push("At least one fabric is required")
    }

    if (hasFabric1 && newStyle.fabric1_cm <= 0) {
      errors.push("Main Fabric 1 consumption must be > 0")
    }
    if (hasFabric2 && newStyle.fabric2_cm <= 0) {
      errors.push("Main Fabric 2 consumption must be > 0")
    }
    if (hasLining && newStyle.lining_cm <= 0) {
      errors.push("Lining consumption must be > 0")
    }

    // Check duplicate ONLY IF ADDING
    if (showAddForm === "ADD") {
      const existing = activeStyles
        .concat(archivedStyles)
        .map((s) => s.style_name.toLowerCase().trim())
      if (existing.includes(newStyle.style_name.toLowerCase().trim())) {
        errors.push(`Style "${newStyle.style_name}" already exists`)
      }
    }

    return errors
  }

  const handleSaveStyle = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors = validateForm()
    setFormErrors(errors)

    if (errors.length > 0) return

    setAdding(true)
    try {
      const endpoint = showAddForm === "EDIT" ? "/api/studio/styles/update" : "/api/studio/styles/add"
      const method = showAddForm === "EDIT" ? "PATCH" : "POST"
      
      // We'll use apiPost for both since our lib helper handles it, but maybe update lib to allow method choice
      // Actually our apiPost is a wrapper for POST. Let's assume we use it or add a custom fetch.
      // For now, let's use a standard fetch or assume our backend accepts POST for update too if we change it.
      // Better: I'll use fetch directly or fix the helper if needed.
      
      const payload = { 
        ...newStyle, 
        user: user?.username,
        // Convert Meters to Centimeters for backend
        fabric1_cm: Number(newStyle.fabric1_cm) * 100,
        fabric2_cm: Number(newStyle.fabric2_cm) * 100,
        lining_cm: Number(newStyle.lining_cm) * 100,
      }
      
      const newOverrides = { ...studioOverrides }
      if (showAddForm === "EDIT") {
        newOverrides.updated = { 
          ...newOverrides.updated, 
          [newStyle.style_name]: {
            ...payload,
            main1_name: payload.fabric1, main1_cm: payload.fabric1_cm,
            main2_name: payload.fabric2, main2_cm: payload.fabric2_cm,
            lining_name: payload.lining, lining_cm: payload.lining_cm
          } 
        }
      } else {
        newOverrides.added = [...newOverrides.added, {
          style_name: payload.style_name,
          fabric_family: payload.fabric_family || payload.style_name,
          main1_name: payload.fabric1, main1_cm: payload.fabric1_cm,
          main2_name: payload.fabric2, main2_cm: payload.fabric2_cm,
          lining_name: payload.lining, lining_cm: payload.lining_cm,
          status: "Active",
          last_updated_by: user?.username,
        }]
      }
      setStudioOverrides(newOverrides)
      const { saveStudioOverrides } = await import("@/lib/firestore")
      await saveStudioOverrides(newOverrides)

      const payloadWithOverrides = { ...payload, studio_overrides: newOverrides }

      const data = await apiFetch<any>(endpoint, {
        method,
        body: JSON.stringify(payloadWithOverrides)
      });

      showToast(`${newStyle.style_name} ${showAddForm === "EDIT" ? "updated" : "saved"} successfully!`)
      setNewStyle({
        style_name: "",
        fabric_family: "",
        fabric1: "",
        fabric1_cm: 0,
        fabric2: "",
        fabric2_cm: 0,
        lining: "",
        lining_cm: 0,
      })
      setFormErrors([])
      setShowAddForm(false)
      void fetchStyles(newOverrides)
    } catch (err: unknown) {
      console.error(err)
      showToast(err instanceof Error ? err.message : "Failed to save style", "error")
    } finally {
      setAdding(false)
    }
  }

  const handleEditClick = (row: StyleRow) => {
    setNewStyle({
      style_name: row.style_name,
      fabric_family: row.fabric_family,
      fabric1: row.main1_name,
      fabric1_cm: row.main1_cm / 100, // Display as Meters
      fabric2: row.main2_name,
      fabric2_cm: row.main2_cm / 100, // Display as Meters
      lining: row.lining_name,
      lining_cm: row.lining_cm / 100, // Display as Meters
    })
    setShowAddForm("EDIT")
    setFormErrors([])
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  // CSV Upload handlers
  const handleCsvSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFile(file)

    const formData = new FormData()
    formData.append("file", file)

    try {
      const data = await apiUpload<{ columns: string[]; row_count: number }>("/api/studio/upload-csv", formData)
      setCsvColumns(data.columns)
      setCsvRowCount(data.row_count)
    } catch (err: unknown) {
      console.error(err)
      showToast("Failed to parse CSV", "error")
    }
  }

  const handleCsvImport = async () => {
    if (!csvFile) return

    const formData = new FormData()
    formData.append("file", csvFile)

    try {
      const data = await apiUpload<{ imported: number }>("/api/studio/import-csv", formData)
      showToast(`Imported ${data.imported} styles successfully!`)
      setShowCsvUpload(false)
      setCsvColumns([])
      setCsvFile(null)
      void fetchStyles()
    } catch (err: unknown) {
      console.error(err)
      showToast("CSV import failed", "error")
    }
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="p-8 text-center bg-card rounded-2xl border border-border">
          <Lock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-2">Login Required</h2>
          <p className="text-muted-foreground">
            Access the Studio via the sidebar login.
          </p>
        </div>
      </div>
    )
  }

  const isEditor = user.role !== "Viewer"
  const displayData = activeTab === "ACTIVE" ? activeStyles : archivedStyles

  const filteredData = displayData.filter(
    (item) =>
      (item.style_name || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (item.fabric_family || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (item.main1_name || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
  )

  // Helper to display fabric name cleanly (no "None", "0", "nan")
  const cleanFabricDisplay = (name: string | undefined | null): string => {
    if (!name) return ""
    const cleaned = String(name).trim().toLowerCase()
    if (["", "0", "nan", "none", "undefined"].includes(cleaned)) return ""
    return name
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Style Studio</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage Bill of Materials (BOM) and active portfolio items.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground bg-secondary/40 px-3 py-1.5 rounded-lg border border-border/50">
            {activeStyles.length} Active · {archivedStyles.length} Archived
          </div>
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-md text-sm font-medium animate-in slide-in-from-top-2 z-50 fixed top-4 right-4 ${
            toastType === "success"
              ? "bg-safe/20 text-safe border border-safe/30 shadow-lg shadow-safe/10 backdrop-blur-md"
              : "bg-destructive/20 text-destructive border border-destructive/30 shadow-lg shadow-destructive/10 backdrop-blur-md"
          }`}
        >
          {toastType === "success" ? (
            <CheckCircle2 size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          {toastMsg}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between p-1 border-b border-border/50">
        <div className="flex space-x-1">
          <button
            onClick={() => setActiveTab("ACTIVE")}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              activeTab === "ACTIVE"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary/50"
            }`}
          >
            Active Styles ({activeStyles.length})
          </button>
          <button
            onClick={() => setActiveTab("ARCHIVED")}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              activeTab === "ARCHIVED"
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-secondary/50"
            }`}
          >
            Archived ({archivedStyles.length})
          </button>
        </div>

        <div className="relative w-full md:w-64 mb-2 md:mb-0">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search BOM..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Add/Edit Style Form + CSV Upload */}
      {isEditor && (
        <div className="space-y-4">
          {/* Add Style BOM */}
          <div className="border border-border/50 rounded-xl overflow-hidden bg-card/40 backdrop-blur-sm shadow-xl shadow-black/5">
            <button
              onClick={() => {
                if (showAddForm === "ADD") setShowAddForm(false)
                else {
                  setShowAddForm("ADD")
                  setNewStyle({
                    style_name: "",
                    fabric_family: "",
                    fabric1: "",
                    fabric1_cm: 0,
                    fabric2: "",
                    fabric2_cm: 0,
                    lining: "",
                    lining_cm: 0,
                  })
                }
              }}
              className="w-full flex items-center justify-between p-4 hover:bg-secondary/20 transition-colors"
            >
              <span className="font-semibold flex items-center space-x-2">
                <Plus size={18} />
                <span>{showAddForm === "EDIT" ? `Editing BOM: ${newStyle.style_name}` : "Add New Style BOM"}</span>
              </span>
              <span className="text-muted-foreground text-sm">
                {showAddForm ? "Collapse" : "Expand"}
              </span>
            </button>

            {showAddForm && (
              <div className="p-6 border-t border-border/50 bg-secondary/5">
                {/* Validation errors */}
                {formErrors.length > 0 && (
                  <div className="mb-4 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-destructive text-sm font-medium mb-1">
                      <AlertCircle size={16} />
                      Validation Errors
                    </div>
                    <ul className="text-xs text-destructive/80 list-disc pl-5 space-y-0.5">
                      {formErrors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <form onSubmit={handleSaveStyle} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-foreground">
                        Style Name {showAddForm === "ADD" && <span className="text-destructive">*</span>}
                      </label>
                      <input
                        type="text"
                        value={newStyle.style_name}
                        disabled={showAddForm === "EDIT"}
                        onChange={(e) =>
                          setNewStyle({
                            ...newStyle,
                            style_name: e.target.value,
                          })
                        }
                        placeholder="e.g. Bianca Top"
                        className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-foreground">
                        Fabric Family{" "}
                        <span className="text-muted-foreground">
                          (auto-derived if empty)
                        </span>
                      </label>
                      <input
                        type="text"
                        value={newStyle.fabric_family}
                        onChange={(e) =>
                          setNewStyle({
                            ...newStyle,
                            fabric_family: e.target.value,
                          })
                        }
                        placeholder="e.g. Bianca"
                        className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-4">
                      <div className="bg-secondary/20 rounded-lg p-4 border border-border/30">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                          Main Fabric 1{" "}
                          <span className="text-destructive">*</span>
                        </h4>
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={newStyle.fabric1}
                            onChange={(e) =>
                              setNewStyle({
                                ...newStyle,
                                fabric1: e.target.value,
                              })
                            }
                            placeholder="Fabric name"
                            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={newStyle.fabric1_cm}
                            onChange={(e) =>
                              setNewStyle({
                                ...newStyle,
                                fabric1_cm: Number(e.target.value),
                              })
                            }
                            placeholder="Consumption (Meters)"
                            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      </div>
                      <div className="bg-secondary/20 rounded-lg p-4 border border-border/30">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                          Main Fabric 2{" "}
                          <span className="text-muted-foreground">
                            (optional)
                          </span>
                        </h4>
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={newStyle.fabric2}
                            onChange={(e) =>
                              setNewStyle({
                                ...newStyle,
                                fabric2: e.target.value,
                              })
                            }
                            placeholder="Fabric name"
                            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={newStyle.fabric2_cm}
                            onChange={(e) =>
                              setNewStyle({
                                ...newStyle,
                                fabric2_cm: Number(e.target.value),
                              })
                            }
                            placeholder="Consumption (Meters)"
                            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-secondary/20 rounded-lg p-4 border border-border/30">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                          Lining Fabric{" "}
                          <span className="text-muted-foreground">
                            (optional)
                          </span>
                        </h4>
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={newStyle.lining}
                            onChange={(e) =>
                              setNewStyle({
                                ...newStyle,
                                lining: e.target.value,
                              })
                            }
                            placeholder="Fabric name"
                            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={newStyle.lining_cm}
                            onChange={(e) =>
                              setNewStyle({
                                ...newStyle,
                                lining_cm: Number(e.target.value),
                              })
                            }
                            placeholder="Consumption (Meters)"
                            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex gap-3">
                    <button
                      type="submit"
                      disabled={adding}
                      className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {adding ? "Saving..." : showAddForm === "EDIT" ? "Update Style BOM" : "Save Style BOM"}
                    </button>
                    {showAddForm === "EDIT" && (
                        <button
                          type="button"
                          onClick={() => setShowAddForm(false)}
                          className="px-4 py-2.5 rounded-md text-sm font-medium border border-border hover:bg-secondary/20 transition-colors"
                        >
                            Cancel
                        </button>
                    )}
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* CSV Upload */}
          <div className="border border-border/50 rounded-xl overflow-hidden bg-card/40 backdrop-blur-sm">
            <button
              onClick={() => setShowCsvUpload(!showCsvUpload)}
              className="w-full flex items-center justify-between p-4 hover:bg-secondary/20 transition-colors"
            >
              <span className="font-semibold flex items-center space-x-2">
                <Upload size={18} />
                <span>Import BOM from CSV</span>
              </span>
              <span className="text-muted-foreground text-sm">
                {showCsvUpload ? "Collapse" : "Expand"}
              </span>
            </button>

            {showCsvUpload && (
              <div className="p-6 border-t border-border/50 bg-secondary/5 space-y-4">
                <div className="border-2 border-dashed border-border/80 rounded-xl p-6 text-center">
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">
                    Upload a CSV file with BOM data
                  </p>
                  <label className="cursor-pointer bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
                    Choose File
                    <input
                        type="file"
                        accept=".csv"
                        onChange={handleCsvSelect}
                        className="hidden"
                    />
                  </label>
                  {csvFile && <div className="mt-2 text-xs font-medium text-primary">{csvFile.name}</div>}
                </div>

                {csvColumns.length > 0 && (
                  <div className="space-y-3">
                    <div className="bg-secondary/30 rounded-lg p-4 border border-border/30">
                      <h4 className="text-sm font-semibold mb-2">
                        Detected Columns ({csvRowCount} rows)
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {csvColumns.map((col) => (
                          <span
                            key={col}
                            className="text-xs bg-secondary/60 px-2 py-1 rounded-full border border-border/50"
                          >
                            {col}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={handleCsvImport}
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 rounded-md text-sm font-medium transition-colors"
                    >
                      Import {csvRowCount} Styles
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="border border-border/50 rounded-xl overflow-hidden bg-card/40 backdrop-blur-sm shadow-xl shadow-black/5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs font-semibold tracking-wider">
              <tr>
                <th className="px-6 py-4">Style Info</th>
                <th className="px-6 py-4">Demand (14d)</th>
                <th className="px-6 py-4">Main Fabrics</th>
                <th className="px-6 py-4">Lining</th>
                <th className="px-6 py-4">Last Updated</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-muted-foreground"
                  >
                    <RefreshCw className="mx-auto h-8 w-8 animate-spin mb-4 text-primary" />
                    <p className="font-medium">Loading BOM repository...</p>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-16 text-center text-muted-foreground border-dashed border-t border-border/50"
                  >
                    No styles matching your search.
                  </td>
                </tr>
              ) : (
                filteredData.map((row, i) => {
                  const fabric1 = cleanFabricDisplay(row.main1_name)
                  const fabric2 = cleanFabricDisplay(row.main2_name)
                  const lining = cleanFabricDisplay(row.lining_name)

                  return (
                    <tr
                      key={i}
                      className="group hover:bg-secondary/20 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="font-bold text-foreground group-hover:text-primary transition-colors">
                          {row.style_name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {row.fabric_family || "No Family"}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                            <span className={`text-sm font-bold ${row.predicted_demand > 0 ? "text-primary" : "text-muted-foreground opacity-40"}`}>
                                {row.predicted_demand.toFixed(1)}m
                            </span>
                            <span className="text-[10px] uppercase text-muted-foreground opacity-60">
                                Total Family Demand
                            </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {fabric1 && (
                            <div className="flex items-center text-xs">
                              <span className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
                              <span className="capitalize">{fabric1}</span>
                              <span className="ml-1 text-muted-foreground">
                                ({row.main1_cm}cm)
                              </span>
                            </div>
                          )}
                          {fabric2 && (
                            <div className="flex items-center text-xs">
                              <span className="w-2 h-2 rounded-full bg-blue-400 mr-2" />
                              <span className="capitalize">{fabric2}</span>
                              <span className="ml-1 text-muted-foreground">
                                ({row.main2_cm}cm)
                              </span>
                            </div>
                          )}
                          {!fabric1 && !fabric2 && (
                            <span className="text-muted-foreground italic text-xs">
                              No main fabric
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {lining ? (
                          <div className="flex items-center text-xs border border-border/50 px-2 py-0.5 rounded-full w-max bg-secondary/10">
                            <span className="capitalize">{lining}</span>
                            <span className="ml-2 text-muted-foreground">
                              {row.lining_cm}cm
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic text-xs">
                            No lining
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs">
                          <div className="text-foreground font-medium">
                            {row.last_updated_by || "—"}
                          </div>
                          <div className="text-muted-foreground text-[10px]">
                            {row.last_updated_time || "—"}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isEditor ? (
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                const url = `/dashboard?family=${encodeURIComponent(row.fabric_family)}`
                                router.push(url)
                              }}
                              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors text-xs font-semibold"
                              title="View Planning in Dashboard"
                            >
                              👁️ Planning
                            </button>
                            {activeTab === "ACTIVE" && (
                              <button
                                onClick={() => handleEditClick(row)}
                                className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors text-xs font-semibold"
                              >
                                ✏️ Edit BOM
                              </button>
                            )}
                            <button
                              onClick={() =>
                                handleToggleArchive(
                                  row.style_name,
                                  activeTab === "ACTIVE"
                                )
                              }
                              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                                activeTab === "ACTIVE"
                                  ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                                  : "bg-safe/10 text-safe hover:bg-safe/20"
                              }`}
                            >
                              {activeTab === "ACTIVE" ? (
                                <>
                                  <Archive size={14} />
                                  <span>Archive</span>
                                </>
                              ) : (
                                <>
                                  <RefreshCw size={14} />
                                  <span>Restore</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <Badge variant="outline" className="opacity-50">
                            View Only
                          </Badge>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
