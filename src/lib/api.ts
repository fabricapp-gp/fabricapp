/**
 * FABRICINTEL - Centralized API Utility
 * 
 * Handles base URL from environment variables, provides reusable fetcher,
 * and ensures consistent error handling across all frontend modules.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith("http") 
    ? endpoint 
    : `${BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: "" }));
    throw new Error((errorData as { detail?: string }).detail || `API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Convenience method for GET requests
 */
export function apiGet<T>(endpoint: string, options: RequestInit = {}) {
  return apiFetch<T>(endpoint, { ...options, method: "GET" });
}

/**
 * Convenience method for POST requests
 */
export function apiPost<T>(endpoint: string, body: unknown, options: RequestInit = {}) {
  return apiFetch<T>(endpoint, {
    ...options,
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Convenience method for File Upload (Multipart Form Data)
 */
export async function apiUpload<T>(endpoint: string, formData: FormData): Promise<T> {
  const url = `${BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: "" }));
    throw new Error((errorData as { detail?: string }).detail || `Upload error: ${response.status}`);
  }

  return response.json();
}
