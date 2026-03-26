/** Match backend `normalize_google_place_id` for Places API id comparison. */
export function normalizeGooglePlaceId(placeId: string | null | undefined): string | null {
  if (placeId == null || placeId === '') {
    return null
  }
  let raw = String(placeId).trim()
  if (!raw) {
    return null
  }
  if (raw.startsWith('places/')) {
    raw = raw.slice('places/'.length)
  }
  return raw.trim() || null
}
