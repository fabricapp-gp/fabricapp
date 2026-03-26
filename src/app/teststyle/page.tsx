"use client"

import { useState } from "react"
import { useAuth } from "@/context/AuthContext"
import { TestTube, Server, Send, AlertCircle, CheckCircle, Lock, Code } from "lucide-react"
import { apiPost } from "@/lib/api"

export default function TestStylePage() {
  const { user } = useAuth()
  
  const [newStyle, setNewStyle] = useState({
    style_name: "Debug Style Alpha",
    fabric_family: "Debug Family",
    fabric1: "Debug Fabric 1",
    fabric1_cm: 120,
    fabric2: "",
    fabric2_cm: 0,
    lining: "Debug Lining",
    lining_cm: 50,
  })
  
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{success: boolean, message: string, detail?: any} | null>(null)
  const [rawResponse, setRawResponse] = useState<string>("")

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="p-8 text-center bg-card rounded-2xl border border-border">
          <Lock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-2">Login Required</h2>
          <p className="text-muted-foreground">Access the Style Debugger via the sidebar login.</p>
        </div>
      </div>
    )
  }

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    setRawResponse("")
    
    try {
      // Using standard fetch instead of apiPost to capture RAW response for debugging
      const res = await fetch("http://localhost:8000/api/studio/styles/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newStyle, user: user?.username })
      })
      
      const data = await res.json()
      setRawResponse(JSON.stringify(data, null, 2))
      
      if (res.ok) {
        setResult({ success: true, message: data.message })
      } else {
        setResult({ success: false, message: data.detail || "Validation Error", detail: data.detail })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network Error"
      setRawResponse(msg)
      setResult({ success: false, message: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-6xl space-y-8 animate-in fade-in duration-500 pb-12">
      
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <TestTube className="text-primary" />
          Style BOM Debugger
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Detailed testing interface for the <code className="bg-secondary px-1.5 py-0.5 rounded">/api/studio/styles/add</code> endpoint.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        
        {/* Form Panel */}
        <form onSubmit={handleSendTest} className="space-y-6 bg-card border border-border rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Code size={16} /> Input Payload Form
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-foreground">Style Name</label>
              <input 
                type="text" 
                value={newStyle.style_name} 
                onChange={e => setNewStyle({...newStyle, style_name: e.target.value})}
                className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Fabric Family</label>
              <input 
                type="text" 
                value={newStyle.fabric_family} 
                onChange={e => setNewStyle({...newStyle, fabric_family: e.target.value})}
                className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            
            <div className="col-span-2 mt-2 pt-4 border-t border-border">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Main Fabric 1</span>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Name</label>
              <input 
                type="text" 
                value={newStyle.fabric1} 
                onChange={e => setNewStyle({...newStyle, fabric1: e.target.value})}
                className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Consumption (cm)</label>
              <input 
                type="number" 
                value={newStyle.fabric1_cm} 
                onChange={e => setNewStyle({...newStyle, fabric1_cm: Number(e.target.value)})}
                className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            
            <div className="col-span-2 mt-2 pt-4 border-t border-border">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Main Fabric 2 (Optional)</span>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Name</label>
              <input 
                type="text" 
                value={newStyle.fabric2} 
                onChange={e => setNewStyle({...newStyle, fabric2: e.target.value})}
                className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Consumption (cm)</label>
              <input 
                type="number" 
                value={newStyle.fabric2_cm} 
                onChange={e => setNewStyle({...newStyle, fabric2_cm: Number(e.target.value)})}
                className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            
            <div className="col-span-2 mt-2 pt-4 border-t border-border">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Lining (Optional)</span>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Name</label>
              <input 
                type="text" 
                value={newStyle.lining} 
                onChange={e => setNewStyle({...newStyle, lining: e.target.value})}
                className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Consumption (cm)</label>
              <input 
                type="number" 
                value={newStyle.lining_cm} 
                onChange={e => setNewStyle({...newStyle, lining_cm: Number(e.target.value)})}
                className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full flex justify-center items-center space-x-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-3 rounded-md transition-colors text-sm font-medium shadow-sm mt-4"
          >
            {loading ? (
              <><span className="animate-spin mr-2">◒</span><span>Making API Request...</span></>
            ) : (
              <><Send size={18} /><span>Send POST Request</span></>
            )}
          </button>
        </form>

        {/* Debug Panel */}
        <div className="space-y-6 flex flex-col">
          
          {/* JSON Payload Preview */}
          <div className="bg-secondary/20 border border-border rounded-xl p-6 flex-1">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-muted-foreground">
              <Send size={14} /> Outgoing JSON Payload
            </h3>
            <pre className="text-xs bg-background p-4 rounded-md border border-border overflow-x-auto text-primary/80 h-[240px] overflow-y-auto">
{JSON.stringify({ ...newStyle, user: user?.username }, null, 2)}
            </pre>
          </div>

          {/* API Response Preview */}
          <div className="bg-secondary/20 border border-border rounded-xl p-6 flex-1">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-muted-foreground">
              <Server size={14} /> Raw API Response
            </h3>
            <pre className={`text-xs p-4 rounded-md border overflow-x-auto h-[160px] overflow-y-auto ${result?.success ? 'bg-safe/5 border-safe/30 text-safe' : result !== null ? 'bg-destructive/5 border-destructive/30 text-destructive' : 'bg-background border-border text-muted-foreground'}`}>
{rawResponse || "Waiting for request..."}
            </pre>
            
            {result && (
              <div className={`mt-4 p-3 rounded-lg border flex items-start gap-3 ${result.success ? "bg-safe/10 border-safe/20 text-safe" : "bg-destructive/10 border-destructive/20 text-destructive"}`}>
                {result.success ? <CheckCircle size={18} className="mt-0.5" /> : <AlertCircle size={18} className="mt-0.5" />}
                <div>
                  <h4 className="text-sm font-bold">{result.success ? "Success" : "Request Failed"}</h4>
                  <p className="text-xs mt-1 opacity-90">{result.message}</p>
                </div>
              </div>
            )}
          </div>
          
        </div>

      </div>
    </div>
  )
}
