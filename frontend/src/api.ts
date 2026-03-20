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

export interface PlaceSearchResult {
  id: string
  name: string
  formattedAddress?: string
  rating?: number
  googleMapsUri?: string
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

export interface SuggestionStreamHandlers {
  onChunk: (text: string) => void
  onDone?: () => void
  onError?: (message: string) => void
  signal?: AbortSignal
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

export function searchPlaces(query: string) {
  const params = new URLSearchParams({ query: query.trim() })
  return request<PlaceSearchResult[]>(`/places/search?${params.toString()}`)
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

export async function streamPlaceSuggestions(
  sessionId: string,
  participantId: string,
  vibe: string,
  handlers: SuggestionStreamHandlers,
) {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/place-suggestions/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      participantId,
      vibe: vibe.trim() || null,
    }),
    signal: handlers.signal,
  })

  if (!response.ok) {
    const fallback = 'Could not start suggestion stream'

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

  if (!response.body) {
    throw new Error('Streaming is not supported in this browser')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  function flushEvent(eventBlock: string) {
    const lines = eventBlock
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? 'message'
    const dataLines = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())

    if (dataLines.length === 0) {
      return
    }

    const rawData = dataLines.join('\n')

    try {
      const payload = JSON.parse(rawData) as { message?: string; text?: string }

      if (event === 'chunk' && payload.text) {
        handlers.onChunk(payload.text)
      } else if (event === 'error') {
        handlers.onError?.(payload.message ?? 'Suggestion stream failed')
      } else if (event === 'done') {
        handlers.onDone?.()
      }
    } catch {
      // Ignore malformed chunks and keep the stream alive.
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

    let separatorIndex = buffer.indexOf('\n\n')
    while (separatorIndex >= 0) {
      const eventBlock = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      flushEvent(eventBlock)
      separatorIndex = buffer.indexOf('\n\n')
    }

    if (done) {
      break
    }
  }

  if (buffer.trim()) {
    flushEvent(buffer)
  }
}
