export type SessionStatus = 'waiting' | 'collecting' | 'rating' | 'results'

export interface Participant {
  id: string
  label: string
}

export interface FoodOption {
  id: string
  name: string
  addedBy: string
  address?: string | null
  googlePlaceId?: string | null
  rating?: number | null
  userRatingCount?: number | null
  priceLevel?: string | null
  phone?: string | null
  websiteUri?: string | null
  googleMapsUri?: string | null
  openNow?: boolean | null
  /** Place photo URL (often `/api/places/photo?...` proxied from Google Places). */
  photoUrl?: string | null
}

export interface RankedResult {
  optionId: string
  name: string
  averageScore: number
  disagreementPenalty: number
  finalScore: number
  /** 1-based competition rank; same finalScore shares rank. */
  rank: number
}

export interface SessionSearchBias {
  latitude: number
  longitude: number
  label?: string | null
}

export interface SessionResponse {
  sessionId: string
  joinCode: string
  status: SessionStatus
  participants: Participant[]
  options: FoodOption[]
  ratings: Record<string, Record<string, number>>
  selectionDone: Record<string, boolean>
  maxParticipants: number
  isReadyForResults: boolean
  /** Normalized Google Place IDs already in this session (any participant). */
  usedGooglePlaceIds?: string[]
  /** Optional label for the room (e.g. occasion). */
  title?: string | null
  /** Max options each participant may add; omitted or null means no limit. */
  maxPicksPerParticipant?: number | null
  /** When set, restaurant autocomplete is biased toward this area for everyone in the room. */
  searchBias?: SessionSearchBias | null
}

export interface SessionCreateResponse {
  session: SessionResponse
  participantId: string
}

export interface ResultsResponse {
  ready: boolean
  results: RankedResult[]
  reason?: string
}

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    const fallback = 'Request failed'

    try {
      const payload = (await response.json()) as { detail?: string }
      throw new Error(payload.detail ?? fallback)
    } catch (error) {
      if (error instanceof Error && error.message !== 'Unexpected end of JSON input') {
        throw error
      }
      throw new Error(fallback)
    }
  }

  return (await response.json()) as T
}

export interface CreateSessionExtras {
  title?: string | null
  maxPicksPerParticipant?: number | null
  /** Optional map bias for restaurant search in this room. */
  searchBias?: SessionSearchBias | null
}

export function createSession(
  name: string,
  maxParticipants: number = 2,
  extras?: CreateSessionExtras,
) {
  const bias = extras?.searchBias
  const body: Record<string, unknown> = {
    name: name.trim() || null,
    maxParticipants,
    title: extras?.title?.trim() ? extras.title.trim() : null,
    maxPicksPerParticipant: extras?.maxPicksPerParticipant ?? null,
  }
  if (bias) {
    body.searchBiasLatitude = bias.latitude
    body.searchBiasLongitude = bias.longitude
    body.searchBiasLabel = bias.label?.trim() ? bias.label.trim() : null
  }
  return request<SessionCreateResponse>('/sessions', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function joinSession(joinCode: string, name: string) {
  return request<SessionCreateResponse>('/sessions/join', {
    method: 'POST',
    body: JSON.stringify({ joinCode, name: name.trim() || null }),
  })
}

export function fetchSession(sessionRef: string, participantId?: string) {
  const query =
    participantId !== undefined && participantId !== ''
      ? `?participantId=${encodeURIComponent(participantId)}`
      : ''
  return request<SessionResponse>(`/sessions/${sessionRef}${query}`)
}

export function addOption(
  sessionId: string,
  participantId: string,
  name: string,
  placeId?: string | null,
) {
  const body: { participantId: string; name: string; placeId?: string } = {
    participantId,
    name,
  }
  if (placeId) {
    body.placeId = placeId
  }
  return request<SessionResponse>(`/sessions/${sessionId}/options`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function removeOption(sessionId: string, participantId: string, optionId: string) {
  const q = `?participantId=${encodeURIComponent(participantId)}`
  return request<SessionResponse>(`/sessions/${sessionId}/options/${encodeURIComponent(optionId)}${q}`, {
    method: 'DELETE',
  })
}

export function markSelectionDone(sessionId: string, participantId: string, done: boolean) {
  return request<SessionResponse>(`/sessions/${sessionId}/selection/done`, {
    method: 'POST',
    body: JSON.stringify({ participantId, done }),
  })
}

export function submitRatings(
  sessionId: string,
  participantId: string,
  ratings: Record<string, number>,
) {
  return request<SessionResponse>(`/sessions/${sessionId}/ratings`, {
    method: 'POST',
    body: JSON.stringify({
      participantId,
      ratings: Object.entries(ratings).map(([optionId, score]) => ({
        optionId,
        score,
      })),
    }),
  })
}

export function fetchResults(sessionId: string) {
  return request<ResultsResponse>(`/sessions/${sessionId}/results`)
}

export interface PlaceSuggestion {
  placeId: string
  name: string
  address: string
  types: string[]
  foodType: string
  /** Google average rating when Places details were fetched. */
  rating?: number | null
  userRatingCount?: number | null
}

export type SuggestionEnrichmentPatch = Pick<PlaceSuggestion, 'rating' | 'userRatingCount'>

export function isAbortError(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === 'AbortError') ||
    (e instanceof Error && e.name === 'AbortError')
  )
}

export async function fetchSuggestions(
  query: string,
  options?: { sessionId?: string; signal?: AbortSignal },
): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({ q: query })
  if (options?.sessionId) {
    params.set('sessionId', options.sessionId)
  }
  try {
    const res = await fetch(`${API_BASE}/suggestions?${params}`, { signal: options?.signal })
    if (!res.ok) return []
    return (await res.json()) as PlaceSuggestion[]
  } catch (e) {
    if (isAbortError(e)) throw e
    return []
  }
}

export async function fetchAreaSuggestions(query: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  try {
    const res = await fetch(`${API_BASE}/suggestions/area?q=${encodeURIComponent(query)}`, { signal })
    if (!res.ok) return []
    return (await res.json()) as PlaceSuggestion[]
  } catch (e) {
    if (isAbortError(e)) throw e
    return []
  }
}

export interface PlaceBiasLocation {
  latitude: number
  longitude: number
  label?: string | null
}

export async function fetchPlaceBiasLocation(
  placeId: string,
  signal?: AbortSignal,
): Promise<PlaceBiasLocation | null> {
  try {
    const res = await fetch(
      `${API_BASE}/places/location?placeId=${encodeURIComponent(placeId)}`,
      { signal },
    )
    if (!res.ok) return null
    return (await res.json()) as PlaceBiasLocation
  } catch (e) {
    if (isAbortError(e)) throw e
    return null
  }
}

/** Lazy-load Google ratings after autocomplete (does not block the suggestion list). */
export async function fetchSuggestionEnrichment(
  placeIds: string[],
  init?: RequestInit,
): Promise<Record<string, SuggestionEnrichmentPatch>> {
  if (placeIds.length === 0) {
    return {}
  }
  try {
    const res = await fetch(`${API_BASE}/suggestions/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeIds }),
      signal: init?.signal,
    })
    if (!res.ok) return {}
    return (await res.json()) as Record<string, SuggestionEnrichmentPatch>
  } catch (e) {
    if (isAbortError(e)) throw e
    return {}
  }
}
