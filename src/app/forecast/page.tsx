"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/context/AuthContext"
import {
  LineChart,
  UploadCloud,
  Lock,
  PlayCircle,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Database,
  Activity,
} from "lucide-react"
import { apiGet, apiPost, apiUpload } from "@/lib/api"

interface ForecastStatus {
  freshness: "Fresh" | "Warning" | "Stale"
  hours_old: number | null
  last_update: string | null
  total_rows?: number
  styles_forecasted?: number
}

interface UploadResult {
  success: boolean
  cleaning_log: string[]
  total_rows: number
  unique_styles: number
  date_range: string
  master_total: number
}

interface ForecastResult {
  success: boolean
  message: string
  styles_forecasted?: number
  styles_skipped?: number
  total_rows?: number
  logs?: string[]
}

export default function ForecastPage() {
  const { user } = useAuth()
  const [running, setRunning] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null)
  const [forecastStatus, setForecastStatus] = useState<ForecastStatus | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")

  // Fetch forecast status on load
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await apiGet<ForecastStatus>("/api/forecast/status")
        setForecastStatus(data)
      } catch (err: unknown) {
        console.error("Failed to fetch forecast status", err)
      }
    }
    void fetchStatus()
  }, [])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError("")
    setUploadResult(null)
    setForecastResult(null)

    const formData = new FormData()
    formData.append("file", file)

    try {
      const data = await apiUpload<UploadResult>("/api/forecast/upload", formData)
      setUploadResult(data)
    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const handleRunPipeline = async () => {
    setRunning(true)
    setError("")
    setForecastResult(null)

    try {
      const data = await apiPost<ForecastResult>("/api/forecast/run", {})
      setForecastResult(data)
      // Refresh status
      const statusData = await apiGet<ForecastStatus>("/api/forecast/status")
      setForecastStatus(statusData)
    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Forecast failed")
    } finally {
      setRunning(false)
    }
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="p-8 text-center bg-card rounded-2xl border border-border">
          <Lock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-2">Login Required</h2>
          <p className="text-muted-foreground">
            Access the Forecast Engine via the sidebar login.
          </p>
        </div>
      </div>
    )
  }

  const isEditor = user.role !== "Viewer"

  const freshnessColor =
    forecastStatus?.freshness === "Fresh"
      ? "text-safe"
      : forecastStatus?.freshness === "Warning"
      ? "text-warning"
      : "text-destructive"

  const freshnessIcon =
    forecastStatus?.freshness === "Fresh"
      ? "🟢"
      : forecastStatus?.freshness === "Warning"
      ? "🟡"
      : "🔴"

  return (
    <div className="max-w-5xl space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Forecast Engine</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Machine Learning pipeline using Prophet to predict 14-day fabric
            demand.
          </p>
        </div>
      </div>

      {/* Forecast Freshness Status */}
      {forecastStatus && (
        <div className="bg-card/60 border border-border/50 rounded-xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock size={20} className="text-muted-foreground" />
              <div>
                <div className="text-sm font-semibold">Forecast Status</div>
                <div className="text-xs text-muted-foreground">
                  {forecastStatus.last_update || "No forecast generated"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-1.5 text-sm font-semibold ${freshnessColor}`}>
                <span>{freshnessIcon}</span>
                <span>{forecastStatus.freshness}</span>
                {forecastStatus.hours_old !== null && (
                  <span className="text-muted-foreground font-normal text-xs ml-1">
                    ({forecastStatus.hours_old < 24
                      ? `${forecastStatus.hours_old.toFixed(1)} hrs`
                      : `${(forecastStatus.hours_old / 24).toFixed(1)} days`}
                    )
                  </span>
                )}
              </div>
              {forecastStatus.styles_forecasted !== undefined && (
                <div className="text-xs text-muted-foreground bg-secondary/40 px-2 py-1 rounded-full">
                  {forecastStatus.styles_forecasted} styles forecasted
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-destructive mt-0.5" />
          <div className="text-sm text-destructive">{error}</div>
        </div>
      )}

      {/* Step 1: Upload */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="border border-dashed border-border/80 rounded-2xl p-8 flex flex-col items-center justify-center text-center bg-secondary/10 hover:bg-secondary/20 transition-colors">
          <UploadCloud className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg">
            Step 1: Upload Shopify Orders
          </h3>
          <p className="text-xs text-muted-foreground mt-2 mb-6 max-w-[280px]">
            Upload the latest Shopify orders CSV. Data will be cleaned
            automatically (cancelled/test orders removed, dates converted,
            styles standardized).
          </p>
          <label
            className={`cursor-pointer bg-foreground text-background px-5 py-2.5 rounded-md text-sm font-medium hover:bg-foreground/90 transition-colors ${
              uploading ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {uploading ? "Processing..." : "Select CSV File"}
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        </div>

        {/* Step 2: Run */}
        <div className="border border-primary/20 bg-primary/5 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
          <LineChart className="w-12 h-12 text-primary mb-4" />
          <h3 className="font-semibold text-lg text-primary">
            Step 2: Run ML Pipeline
          </h3>
          <p className="text-xs text-primary/70 mt-2 mb-6 max-w-[280px]">
            Executes the Prophet time-series model to generate demand forecasts for
            each style group. Results feed directly into the Dashboard.
          </p>

          <button
            disabled={running || !isEditor}
            onClick={handleRunPipeline}
            className={`flex items-center space-x-2 px-6 py-3 rounded-md text-sm font-medium transition-all ${
              running
                ? "bg-primary/50 text-primary-foreground cursor-not-allowed"
                : !isEditor
                ? "bg-secondary text-muted-foreground cursor-not-allowed opacity-50"
                : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg"
            }`}
          >
            {running ? (
              <>
                <span className="animate-spin mr-2">◒</span>
                <span>Training Models...</span>
              </>
            ) : (
              <>
                <PlayCircle size={18} />
                <span>Execute Forecast</span>
              </>
            )}
          </button>

          {!isEditor && (
            <p className="text-xs text-destructive mt-4">
              Viewer accounts cannot trigger pipelines.
            </p>
          )}
        </div>
      </div>

      {/* Upload Results — Data Preview */}
      {uploadResult && (
        <div className="bg-card/60 border border-border/50 rounded-xl overflow-hidden backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="p-5 border-b border-border/30 bg-safe/5">
            <div className="flex items-center gap-2 text-safe font-semibold text-sm">
              <CheckCircle2 size={18} />
              Data Uploaded & Cleaned Successfully
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Cleaning Log */}
            {uploadResult.cleaning_log.length > 0 && (
              <div className="bg-secondary/20 rounded-lg p-4 border border-border/30">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Data Cleaning Pipeline
                </h4>
                <ul className="space-y-1">
                  {uploadResult.cleaning_log.map((log, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                      <CheckCircle2 size={12} className="text-safe" />
                      {log}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-secondary/30 rounded-lg p-4 text-center border border-border/30">
                <Database size={20} className="mx-auto text-primary mb-2" />
                <div className="text-xl font-bold">{uploadResult.total_rows.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Training Rows</div>
              </div>
              <div className="bg-secondary/30 rounded-lg p-4 text-center border border-border/30">
                <Activity size={20} className="mx-auto text-primary mb-2" />
                <div className="text-xl font-bold">{uploadResult.unique_styles}</div>
                <div className="text-xs text-muted-foreground">Unique Styles</div>
              </div>
              <div className="bg-secondary/30 rounded-lg p-4 text-center border border-border/30 col-span-2">
                <Clock size={20} className="mx-auto text-primary mb-2" />
                <div className="text-lg font-bold">{uploadResult.date_range}</div>
                <div className="text-xs text-muted-foreground">Date Range</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Forecast Results */}
      {forecastResult && (
        <div className="bg-card/60 border border-border/50 rounded-xl overflow-hidden backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div
            className={`p-5 border-b border-border/30 ${
              forecastResult.success ? "bg-safe/5" : "bg-destructive/5"
            }`}
          >
            <div
              className={`flex items-center gap-2 font-semibold text-sm ${
                forecastResult.success ? "text-safe" : "text-destructive"
              }`}
            >
              {forecastResult.success ? (
                <CheckCircle2 size={18} />
              ) : (
                <AlertCircle size={18} />
              )}
              {forecastResult.message}
            </div>
          </div>

          {forecastResult.success && (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-secondary/30 rounded-lg p-4 text-center border border-border/30">
                  <div className="text-2xl font-bold text-primary">
                    {forecastResult.styles_forecasted}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Styles Forecasted
                  </div>
                </div>
                <div className="bg-secondary/30 rounded-lg p-4 text-center border border-border/30">
                  <div className="text-2xl font-bold text-warning">
                    {forecastResult.styles_skipped}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Styles Skipped
                  </div>
                </div>
                <div className="bg-secondary/30 rounded-lg p-4 text-center border border-border/30">
                  <div className="text-2xl font-bold">
                    {forecastResult.total_rows?.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Forecast Rows
                  </div>
                </div>
              </div>

              {/* Training Logs */}
              {forecastResult.logs && forecastResult.logs.length > 0 && (
                <details className="bg-secondary/20 rounded-lg border border-border/30">
                  <summary className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-secondary/30 transition-colors">
                    Training Logs ({forecastResult.logs.length} entries)
                  </summary>
                  <div className="p-3 pt-0 max-h-48 overflow-y-auto">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                      {forecastResult.logs.join("\n")}
                    </pre>
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* User Flow Guidance */}
      <div className="bg-secondary/10 border border-border/30 rounded-xl p-5">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <FileText size={16} className="text-primary" />
          How It Works
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[
            { step: "1", title: "Upload", desc: "Shopify orders CSV" },
            { step: "2", title: "Clean", desc: "Auto-remove test/cancelled" },
            { step: "3", title: "Train", desc: "Prophet models per style" },
            { step: "4", title: "Deploy", desc: "Output feeds Dashboard" },
          ].map((item) => (
            <div
              key={item.step}
              className="flex items-center gap-3 bg-secondary/20 rounded-lg p-3 border border-border/30"
            >
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                {item.step}
              </div>
              <div>
                <div className="text-xs font-semibold">{item.title}</div>
                <div className="text-xs text-muted-foreground">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
