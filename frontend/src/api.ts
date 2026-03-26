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
}

export interface RankedResult {
  optionId: string
  name: string
  averageScore: number
  disagreementPenalty: number
  finalScore: number
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

export function createSession(name: string, maxParticipants: number = 2) {
  return request<SessionCreateResponse>('/sessions', {
    method: 'POST',
    body: JSON.stringify({
      name: name.trim() || null,
      maxParticipants,
    }),
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
}

export async function fetchSuggestions(query: string): Promise<PlaceSuggestion[]> {
  try {
    const res = await fetch(`${API_BASE}/suggestions?q=${encodeURIComponent(query)}`)
    if (!res.ok) return []
    return (await res.json()) as PlaceSuggestion[]
  } catch {
    return []
  }
}
