/**
 * FABRICINTEL — Firestore Persistence Helpers
 *
 * Replaces localStorage with Firebase Firestore for persistent,
 * cross-device, cross-session data storage.
 *
 * Collections:
 *   fabricintel/forecast/result     — forecast output + timestamp
 *   fabricintel/dashboard/edits     — user-edited inventory inputs
 *   fabricintel/dashboard/summary   — cached dashboard summary
 *   fabricintel/dashboard/families  — cached family results
 */

import { db } from "./firebase"
import { doc, getDoc, setDoc } from "firebase/firestore"

// ─── Forecast Result ────────────────────────────────────

export async function saveForecastResult(data: Record<string, unknown>): Promise<void> {
  try {
    await setDoc(doc(db, "fabricintel", "forecast_result"), data, { merge: true })
  } catch (err) {
    console.error("Firestore saveForecastResult error:", err)
  }
}

export async function loadForecastResult(): Promise<Record<string, unknown> | null> {
  try {
    const snap = await getDoc(doc(db, "fabricintel", "forecast_result"))
    return snap.exists() ? (snap.data() as Record<string, unknown>) : null
  } catch (err) {
    console.error("Firestore loadForecastResult error:", err)
    return null
  }
}

// ─── Dashboard Edits ────────────────────────────────────

export async function saveDashboardEdits(
  edits: Record<string, { inventory: number; wip: number; lead_time: number; buffer_days: number; moq: number }>
): Promise<void> {
  try {
    await setDoc(doc(db, "fabricintel", "dashboard_edits"), { edits }, { merge: true })
  } catch (err) {
    console.error("Firestore saveDashboardEdits error:", err)
  }
}

export async function loadDashboardEdits(): Promise<Record<string, { inventory: number; wip: number; lead_time: number; buffer_days: number; moq: number }>> {
  try {
    const snap = await getDoc(doc(db, "fabricintel", "dashboard_edits"))
    if (snap.exists()) {
      return (snap.data() as { edits: Record<string, { inventory: number; wip: number; lead_time: number; buffer_days: number; moq: number }> }).edits || {}
    }
    return {}
  } catch (err) {
    console.error("Firestore loadDashboardEdits error:", err)
    return {}
  }
}

// ─── Dashboard Cache (Summary + Families) ─────────────

export async function saveDashboardCache(summary: unknown, families: unknown): Promise<void> {
  try {
    await setDoc(doc(db, "fabricintel", "dashboard_cache"), { summary, families }, { merge: true })
  } catch (err) {
    console.error("Firestore saveDashboardCache error:", err)
  }
}

export async function loadDashboardCache(): Promise<{ summary: unknown; families: unknown } | null> {
  try {
    const snap = await getDoc(doc(db, "fabricintel", "dashboard_cache"))
    return snap.exists() ? (snap.data() as { summary: unknown; families: unknown }) : null
  } catch (err) {
    console.error("Firestore loadDashboardCache error:", err)
    return null
  }
}

// ─── Studio Overrides ───────────────────────────────────

export interface StudioOverrides {
  added: Record<string, unknown>[]
  updated: Record<string, Record<string, unknown>>
  archived: Record<string, boolean>
  deleted: Record<string, boolean>
}

export async function saveStudioOverrides(overrides: StudioOverrides): Promise<void> {
  try {
    await setDoc(doc(db, "fabricintel", "studio_overrides"), overrides, { merge: true })
  } catch (err) {
    console.error("Firestore saveStudioOverrides error:", err)
  }
}
export async function loadStudioOverrides(): Promise<StudioOverrides> {
  const defaultOverrides = { added: [], updated: {}, archived: {}, deleted: {} }
  try {
    const snap = await getDoc(doc(db, "fabricintel", "studio_overrides"))
    if (snap.exists()) {
      const data = snap.data() as Partial<StudioOverrides>
      return {
        added: data.added || [],
        updated: data.updated || {},
        archived: data.archived || {},
        deleted: data.deleted || {}
      }
    }
    return defaultOverrides
  } catch (err) {
    console.error("Firestore loadStudioOverrides error:", err)
    return defaultOverrides
  }
}
