"use client"

import { useEffect, useState, useCallback } from "react"
import { useAuth } from "@/context/AuthContext"
import { apiGet, apiPost } from "@/lib/api"
import {
  Shield,
  Lock,
  Users,
  Clock,
  ScrollText,
  RefreshCw,
  UserPlus,
  Archive,
  LogIn,
  Plus,
  Undo2,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"

interface UserInfo {
  username: string
  role: string
}

interface AuditEntry {
  action: string
  user: string
  details: string
  timestamp: string
}

const ACTION_ICON: Record<string, React.ReactNode> = {
  CREATE_STYLE: <Plus size={14} className="text-blue-400" />,
  ARCHIVE_STYLE: <Archive size={14} className="text-amber-400" />,
  RESTORE_STYLE: <Undo2 size={14} className="text-emerald-400" />,
  LOGIN: <LogIn size={14} className="text-indigo-400" />,
  ADD_USER: <UserPlus size={14} className="text-cyan-400" />,
  DELETE_USER: <Trash2 size={14} className="text-red-400" />,
}

const ACTION_LABEL: Record<string, string> = {
  CREATE_STYLE: "Created Style",
  ARCHIVE_STYLE: "Archived Style",
  RESTORE_STYLE: "Restored Style",
  LOGIN: "Logged In",
  ADD_USER: "Added User",
  DELETE_USER: "Deleted User",
}

export default function AdminPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<UserInfo[]>([])
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Add User form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newUsername, setNewUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newRole, setNewRole] = useState<"Admin" | "Viewer">("Viewer")
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState("")
  const [formSuccess, setFormSuccess] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    if (!user || user.role !== "Admin") return
    setLoading(true)
    setError("")
    try {
      const [usersData, logData] = await Promise.all([
        apiGet<UserInfo[]>(`/api/admin/users?requesting_user=${user.username}`),
        apiGet<AuditEntry[]>(`/api/admin/audit-log?requesting_user=${user.username}`),
      ])
      setUsers(usersData)
      setAuditLog(logData)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load admin data")
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError("")
    setFormSuccess("")

    if (!newUsername.trim() || !newPassword.trim()) {
      setFormError("Username and password are required")
      return
    }

    setSubmitting(true)
    try {
      await apiPost("/api/admin/users/add", {
        requesting_user: user?.username,
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
      })
      setFormSuccess(`User "${newUsername}" created successfully!`)
      setNewUsername("")
      setNewPassword("")
      setNewRole("Viewer")
      setShowAddForm(false)
      void fetchData()
      setTimeout(() => setFormSuccess(""), 4000)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create user")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteUser = async (username: string) => {
    if (!confirm(`Are you sure you want to delete user "${username}"? This cannot be undone.`)) return

    try {
      await apiPost("/api/admin/users/delete", {
        requesting_user: user?.username,
        username,
      })
      void fetchData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete user")
    }
  }

  // Block non-admin users
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="p-8 text-center bg-card rounded-2xl border border-border">
          <Lock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-2">Login Required</h2>
          <p className="text-muted-foreground">
            Access the Admin Panel via the sidebar login.
          </p>
        </div>
      </div>
    )
  }

  if (user.role !== "Admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="p-8 text-center bg-card rounded-2xl border border-destructive/30">
          <Shield className="mx-auto h-12 w-12 text-destructive mb-4" />
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            This page is restricted to Admin accounts only.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Shield className="text-primary" size={28} />
            Admin Panel
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage users, review activity, and control access. Logged in as{" "}
            <span className="text-primary font-semibold">{user.username}</span>.
          </p>
        </div>
        <button
          onClick={() => void fetchData()}
          className="inline-flex items-center gap-2 bg-secondary/50 hover:bg-secondary/80 text-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-border/50"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Toasts */}
      {error && (
        <div className="flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {formSuccess && (
        <div className="flex items-center gap-2 bg-safe/20 text-safe border border-safe/30 rounded-xl px-4 py-3 text-sm font-medium animate-in slide-in-from-top-2">
          <CheckCircle2 size={16} />
          {formSuccess}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* User Management Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="text-primary" size={20} />
                <h2 className="text-xl font-semibold tracking-tight">
                  Registered Users
                </h2>
                <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full border border-border/50">
                  {users.length}
                </span>
              </div>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                <UserPlus size={14} />
                Add User
              </button>
            </div>

            {/* Add User Form */}
            {showAddForm && (
              <div className="bg-card/60 backdrop-blur-sm border border-primary/30 rounded-xl p-6 animate-in slide-in-from-top-2 duration-300">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <UserPlus size={16} className="text-primary" />
                  Create New User
                </h3>
                {formError && (
                  <div className="flex items-center gap-2 bg-destructive/10 text-destructive text-xs border border-destructive/20 rounded-lg px-3 py-2 mb-4">
                    <AlertCircle size={14} />
                    {formError}
                  </div>
                )}
                <form onSubmit={handleAddUser} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Username
                      </label>
                      <input
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder="e.g. nishtha"
                        className="w-full mt-1 bg-background/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Password
                      </label>
                      <div className="relative mt-1">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Secure password"
                          className="w-full bg-background/50 border border-border rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Role
                      </label>
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as "Admin" | "Viewer")}
                        className="w-full mt-1 bg-background/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="Viewer">Viewer (Read-only)</option>
                        <option value="Admin">Admin (Full access)</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {submitting ? "Creating..." : "Create User"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false)
                        setFormError("")
                      }}
                      className="text-muted-foreground hover:text-foreground text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {users.map((u) => (
                <div
                  key={u.username}
                  className="bg-card/60 backdrop-blur-sm border border-border/50 rounded-xl p-5 flex items-center gap-4 hover:border-primary/30 transition-colors group"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      u.role === "Admin"
                        ? "bg-primary/20 text-primary"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">
                      {u.username}
                    </p>
                    <p
                      className={`text-xs font-medium ${
                        u.role === "Admin"
                          ? "text-primary"
                          : "text-muted-foreground"
                      }`}
                    >
                      {u.role}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {u.role === "Admin" && (
                      <Shield size={16} className="text-primary/60" />
                    )}
                    {u.username !== user.username && (
                      <button
                        onClick={() => handleDeleteUser(u.username)}
                        className="opacity-0 group-hover:opacity-100 text-destructive/60 hover:text-destructive transition-all p-1 rounded"
                        title={`Delete ${u.username}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Audit Trail Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <ScrollText className="text-primary" size={20} />
              <h2 className="text-xl font-semibold tracking-tight">
                Activity Log
              </h2>
              <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full border border-border/50">
                {auditLog.length} events
              </span>
            </div>

            <div className="border border-border/50 rounded-xl overflow-hidden bg-card/40 backdrop-blur-sm">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs font-semibold tracking-wider sticky top-0">
                    <tr>
                      <th className="px-5 py-3">Action</th>
                      <th className="px-5 py-3">User</th>
                      <th className="px-5 py-3">Details</th>
                      <th className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <Clock size={12} />
                          Timestamp
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {auditLog.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-5 py-12 text-center text-muted-foreground"
                        >
                          <ScrollText className="mx-auto h-8 w-8 mb-2 opacity-40" />
                          No activity recorded yet. Actions will appear here as
                          users create, archive, or restore styles.
                        </td>
                      </tr>
                    ) : (
                      auditLog.map((entry, i) => (
                        <tr
                          key={i}
                          className="hover:bg-secondary/20 transition-colors"
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              {ACTION_ICON[entry.action] || (
                                <ScrollText size={14} className="text-muted-foreground" />
                              )}
                              <span className="font-medium text-foreground text-xs">
                                {ACTION_LABEL[entry.action] || entry.action}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <span className="bg-secondary/60 text-foreground px-2 py-0.5 rounded text-xs font-medium">
                              {entry.user}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-muted-foreground text-xs max-w-xs truncate">
                            {entry.details}
                          </td>
                          <td className="px-5 py-3 text-muted-foreground text-xs whitespace-nowrap">
                            {entry.timestamp}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
