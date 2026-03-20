export type SessionStatus = 'waiting' | 'collecting' | 'rating' | 'results'

export interface Participant {
  id: string
  label: string
}

export interface FoodOption {
  id: string
  name: string
  addedBy: string
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

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

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

export function createSession(name: string) {
  return request<SessionCreateResponse>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ name: name.trim() || null }),
  })
}

export function joinSession(joinCode: string, name: string) {
  return request<SessionCreateResponse>('/sessions/join', {
    method: 'POST',
    body: JSON.stringify({ joinCode, name: name.trim() || null }),
  })
}

export function fetchSession(sessionRef: string) {
  return request<SessionResponse>(`/sessions/${sessionRef}`)
}

export function addOption(sessionId: string, participantId: string, name: string) {
  return request<SessionResponse>(`/sessions/${sessionId}/options`, {
    method: 'POST',
    body: JSON.stringify({ participantId, name }),
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
