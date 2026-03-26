"use client"

import React, { createContext, useContext, useState, useEffect } from "react"

export type UserRole = "Admin" | "Editor" | "Viewer" | null

export interface User {
  username: string
  role: UserRole
  token: string
}

interface AuthContextType {
  user: User | null
  login: (userData: User) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  
  // Hydrate from localStorage on client
  useEffect(() => {
    const stored = localStorage.getItem("fabricintel_user")
    if (stored) {
      try {
        setUser(JSON.parse(stored)) // eslint-disable-line react-hooks/set-state-in-effect
      } catch {
        // ignore parse error
      }
    }
  }, [])

  const login = (userData: User) => {
    setUser(userData)
    localStorage.setItem("fabricintel_user", JSON.stringify(userData))
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem("fabricintel_user")
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
