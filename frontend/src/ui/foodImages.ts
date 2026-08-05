import type { FoodOption } from '../api'
import { API_BASE } from '../api'

/**
 * Returns the place photo URL from the session when present (Google Places via backend proxy).
 * Backend-relative paths (e.g. /api/places/photo?...) are resolved against the configured
 * API origin so they work in both local dev (Vite proxy) and production (Railway → Vercel).
 * No synthetic image when missing — callers render an empty frame instead.
 */
export function foodImageForOption(option: FoodOption | undefined | null): string | null {
  const raw = option?.photoUrl?.trim()
  if (!raw) return null
  if (raw.startsWith('/')) {
    try {
      // API_BASE is an absolute URL in production (e.g. https://…railway.app/api).
      // Extract its origin so relative proxy paths resolve against the right server.
      const apiOrigin = new URL(API_BASE).origin
      return `${apiOrigin}${raw}`
    } catch {
      // API_BASE is relative in local dev ('/api') — the Vite proxy handles it as-is.
    }
  }
  return raw
}
