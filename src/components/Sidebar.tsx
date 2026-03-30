"use client"

import React, { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuth, User } from "@/context/AuthContext"
import { apiPost } from "@/lib/api"
import { 
  LayoutDashboard, 
  LineChart, 
  Scissors, 
  Home, 
  Mail, 
  Menu,
  X,
  LogOut,
  User as UserIcon,
  Activity,
  TestTube,
  Shield
} from "lucide-react"

export function Sidebar() {
  const pathname = usePathname()
  const { user, login, logout } = useAuth()
  const [isOpen, setIsOpen] = useState(false)

  // Simple local login state for the sidebar
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  const toggleSidebar = () => setIsOpen(!isOpen)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    try {
      const data = await apiPost<User>("/api/auth/login", { username, password })
      login(data)
      setUsername("")
      setPassword("")
    } catch {
      setError("Invalid username or password")
    }
  }

  const navItems = [
    { name: "Home", href: "/", icon: Home },
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Forecast Engine", href: "/forecast", icon: LineChart },
    { name: "Studio", href: "/studio", icon: Scissors },
  ]

  // Admin-only nav items
  const adminItems = [
    { name: "Admin Panel", href: "/admin", icon: Shield },
    { name: "Email Test", href: "/testemail", icon: Mail },
    { name: "Test Style", href: "/teststyle", icon: TestTube },
  ]

  return (
    <>
      <button 
        onClick={toggleSidebar} 
        className="fixed top-4 left-4 z-50 p-2 rounded-md bg-secondary text-secondary-foreground md:hidden hover:bg-secondary/80 focus:outline-none"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden" 
          onClick={toggleSidebar} 
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 z-40 h-screen w-72 transition-transform duration-300 ease-in-out border-r border-border bg-card/50 backdrop-blur-md flex flex-col",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-6 pb-2">
          <div className="flex items-center space-x-2">
            <Activity className="text-primary h-8 w-8" />
            <h1 className="text-2xl font-bold tracking-tighter bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
              FABRICINTEL
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1 ml-10">AI Fabric Planning</p>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-8">
          
          {/* Auth Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
              ACCOUNT
            </h3>
            
            {user ? (
              <div className="bg-secondary/40 rounded-lg p-4 border border-border/50">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-primary/20 p-2 rounded-full">
                    <UserIcon size={16} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-foreground">{user.username}</p>
                    <p className="text-xs text-muted-foreground">{user.role}</p>
                  </div>
                </div>
                <button 
                  onClick={logout}
                  className="w-full flex items-center justify-center space-x-2 bg-destructive/10 text-destructive hover:bg-destructive/20 px-4 py-2 rounded-md transition-colors text-sm font-medium"
                >
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleLogin} className="bg-secondary/20 rounded-lg p-4 border border-border/30 space-y-3">
                <input 
                  type="text" 
                  placeholder="Username" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary h-9"
                />
                <input 
                  type="password" 
                  placeholder="Password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary h-9"
                />
                {error && <p className="text-xs text-destructive">{error}</p>}
                <button 
                  type="submit" 
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md transition-colors text-sm font-medium shadow-sm h-9"
                >
                  Login
                </button>
              </form>
            )}
          </div>

          {/* Navigation */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-3">
              NAVIGATION
            </h3>
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                    isActive 
                      ? "bg-primary/10 text-primary" 
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )}
                >
                  <item.icon size={18} className={cn(
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  )} />
                  <span>{item.name}</span>
                </Link>
              )
            })}
          </div>

          {/* Admin-only Navigation */}
          {user?.role === "Admin" && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-3">
                ADMIN
              </h3>
              {adminItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                      isActive 
                        ? "bg-primary/10 text-primary" 
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    )}
                  >
                    <item.icon size={18} className={cn(
                      isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    )} />
                    <span>{item.name}</span>
                  </Link>
                )
              })}
            </div>
          )}

        </div>
        
        <div className="p-4 border-t border-border mt-auto">
          <p className="text-xs text-center text-muted-foreground/60 w-full">
            © 2026 FABRICINTEL
          </p>
        </div>
      </aside>
    </>
  )
}
