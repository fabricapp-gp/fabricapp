"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/context/AuthContext"
import { MetricCard } from "@/components/MetricCard"
import { 
  Package, 
  Cpu, 
  Clock, 
  ArrowRight,
  ShieldAlert,
  BarChart3,
  Scissors,
  Activity
} from "lucide-react"
import Link from "next/link"
import { apiGet } from "@/lib/api"

interface SystemMetrics {
  styles_detected: number
  fabric_families: number
  forecast_status: string
  forecast_updated_str: string
}

export default function Home() {
  const { user } = useAuth()
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const data = await apiGet<SystemMetrics>("/api/system/metrics")
        setMetrics(data)
      } catch (e: unknown) {
        console.error("Failed to fetch metrics", e)
      } finally {
        setLoading(false)
      }
    }
    void fetchMetrics()
  }, [])

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center py-12 md:py-16 text-center space-y-6 relative overflow-hidden rounded-3xl border border-border/50 bg-card/30 backdrop-blur-sm">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent opacity-50 pointer-events-none" />
        <div className="z-10 space-y-4 px-6 max-w-3xl">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight">
            Industrial <span className="bg-gradient-to-r from-blue-400 to-indigo-500 text-transparent bg-clip-text">Fabric Planning</span>
          </h1>
          <p className="text-base md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Predict demand. Plan fabric. Prevent shortages. The intelligent control tower for your entire supply chain.
          </p>
          
          {!user ? (
            <div className="pt-4">
              <p className="text-xs sm:text-sm font-medium text-warning bg-warning/10 px-4 py-2 rounded-full inline-block border border-warning/20 shadow-sm">
                Please login using the sidebar to access features.
              </p>
            </div>
          ) : (
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/dashboard" className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 rounded-full font-medium transition-all shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5">
                <span>Go to Dashboard</span>
                <ArrowRight size={18} />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* System Intelligence */}
      <section className="space-y-6">
        <div className="flex items-center space-x-2">
          <Cpu className="text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">System Intelligence</h2>
        </div>
        
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-secondary/50 animate-pulse rounded-xl border border-border/50" />
            ))}
          </div>
        ) : metrics ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricCard
              title="Total Styles Monitored"
              value={metrics.styles_detected}
              icon={<Package size={24} />}
              description={`Across ${metrics.fabric_families} distinct fabric families.`}
            />
            
            <MetricCard
              title="Forecast Engine Status"
              value={metrics.forecast_status}
              icon={<BarChart3 size={24} />}
              className={metrics.forecast_status === "Stale" ? "border-destructive/50" : ""}
              description={`Machine learning pipeline relies on recent data.`}
            />

            <MetricCard
              title="AI Forecast Updated"
              value="Last Sync"
              icon={<Clock size={24} />}
              description={metrics.forecast_updated_str}
            />
          </div>
        ) : (
          <div className="p-6 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl flex items-center space-x-3">
            <ShieldAlert />
            <p>Could not connect to the Backend API. Ensure FastAPI is running on port 8000.</p>
          </div>
        )}
      </section>
      
      {/* Platform Capabilities */}
      <section className="space-y-6 pt-4">
        <div className="flex items-center space-x-2">
          <Activity className="text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">Platform Modules</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-xl border border-border bg-card hover:border-primary/50 transition-colors group">
            <BarChart3 className="w-10 h-10 text-blue-500 mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-bold mb-2">Control Tower</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Real-time dashboard summarizing total demand, calculated reorder quantities, and critical fabric risks across your entire portfolio.
            </p>
          </div>
          <div className="p-6 rounded-xl border border-border bg-card hover:border-primary/50 transition-colors group">
            <Scissors className="w-10 h-10 text-indigo-500 mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-bold mb-2">Style Studio</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Manage Bill of Materials (BOM), create new styles, and archive obsolete ones with robust Role-Based Access Control.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}


