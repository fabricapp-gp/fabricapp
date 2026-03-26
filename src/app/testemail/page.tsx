"use client"

import { useState } from "react"
import { useAuth } from "@/context/AuthContext"
import { Mail, Send, AlertCircle, CheckCircle, Lock } from "lucide-react"
import { apiFetch } from "@/lib/api"

export default function TestEmailPage() {
  const { user } = useAuth()
  
  const [sender, setSender] = useState(process.env.NEXT_PUBLIC_SENDER_EMAIL || "")
  const [password, setPassword] = useState(process.env.NEXT_PUBLIC_SENDER_PASSWORD || "")
  const [receivers, setReceivers] = useState("sathinishtha1054@gmail.com")
  
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{success: boolean, message: string} | null>(null)

  if (!user || user.role !== "Admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="p-8 text-center bg-card rounded-2xl border border-border">
          <Lock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-2">Admin Login Required</h2>
          <p className="text-muted-foreground">Access the Email Test Center requires Admin privileges.</p>
        </div>
      </div>
    )
  }

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    
    const receiverList = receivers.split(",").map(r => r.trim()).filter(r => r.length > 0)
    
    try {
      const data = await apiFetch<any>("/api/email/test", {
        method: "POST",
        body: JSON.stringify({ sender, password, receivers: receiverList })
      })
      
      setResult({ success: true, message: data.message })
    } catch (err) {
      const error = err as Error
      setResult({ success: false, message: error.message || "Failed to connect to API" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-8 animate-in fade-in duration-500 pb-12">
      
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Mail className="text-primary" />
          Email Alert Tester
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Test the SMTP email functionality for FABRICINTEL supply chain alerts.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
        
        <form onSubmit={handleSendTest} className="space-y-6 bg-card border border-border rounded-xl p-6 shadow-sm">
          
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Sender Settings (From)</h3>
              <p className="text-xs text-muted-foreground mb-4">Uses smtp.gmail.com by default. Use an App Password for Gmail.</p>
              
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-foreground">Sender Email</label>
                  <input 
                    type="email" 
                    value={sender} 
                    onChange={e => setSender(e.target.value)}
                    className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">App Password</label>
                  <input 
                    type="password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)}
                    className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="h-px bg-border my-4" />

            <div>
              <h3 className="text-sm font-semibold mb-2">Recipient Settings (To)</h3>
              <div>
                <label className="text-xs font-medium text-foreground">Recipient Emails</label>
                <textarea 
                  value={receivers} 
                  readOnly
                  className="w-full mt-1 bg-secondary/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary h-20 cursor-not-allowed opacity-80"
                />
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full flex justify-center items-center space-x-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-3 rounded-md transition-colors text-sm font-medium shadow-sm"
          >
            {loading ? (
              <><span className="animate-spin mr-2">◒</span><span>Sending Email...</span></>
            ) : (
              <><Send size={18} /><span>Send Test SMTP Email</span></>
            )}
          </button>
        </form>

        <div className="space-y-6">
          <div className="bg-secondary/20 border border-border rounded-xl p-6">
            <h3 className="text-sm font-semibold mb-4">Test Alert Package</h3>
            <p className="text-xs text-muted-foreground mb-4">This mock data will be injected into the email body to simulate a real shortage alert.</p>
            
            <pre className="text-xs bg-background p-4 rounded-md border border-border overflow-x-auto text-primary/80">
{`[
  {
    "style": "Test Style Alpha",
    "fabric": "Main Fabric A",
    "qty": 150
  },
  {
    "style": "Test Style Alpha",
    "fabric": "Lining Fabric B",
    "qty": 45
  }
]`}
            </pre>
          </div>

          {result && (
            <div className={`p-4 rounded-xl border ${result.success ? "bg-safe/10 border-safe/30 text-safe" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
              <div className="flex items-start space-x-3">
                {result.success ? <CheckCircle className="mt-0.5" /> : <AlertCircle className="mt-0.5" />}
                <div>
                  <h4 className="text-sm font-bold">{result.success ? "Success" : "Error sending email"}</h4>
                  <p className="text-xs mt-1 opacity-90">{result.message}</p>
                  
                  {!result.success && result.message.includes("535") && (
                    <div className="mt-3 text-xs bg-background/50 p-3 rounded-md border border-destructive/20 text-foreground">
                      <strong>How to fix:</strong>
                      <ol className="list-decimal pl-4 mt-2 space-y-1">
                        <li>Go to Google Account &rarr; Security</li>
                        <li>Enable 2-Step Verification</li>
                        <li>Search &quot;App Passwords&quot;</li>
                        <li>Generate a new App Password for &quot;Mail&quot;</li>
                        <li>Paste the 16-character code into the password field</li>
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
