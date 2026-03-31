import type { FoodOption } from '../api'

/**
 * Returns the place photo URL from the session when present (Google Places via backend proxy).
 * No synthetic image when missing — callers render an empty frame instead.
 */
export function foodImageForOption(option: FoodOption | undefined | null): string | null {
  const raw = option?.photoUrl?.trim()
  return raw || null
}
