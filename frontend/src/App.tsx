import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  API_BASE,
  addOption,
  removeOption,
  createSession,
  fetchAreaSuggestions,
  fetchPlaceBiasLocation,
  fetchResults,
  fetchSession,
  fetchSuggestions,
  fetchSuggestionEnrichment,
  isAbortError,
  joinSession,
  markSelectionDone,
  submitRatings,
  type PlaceSuggestion,
  type RankedResult,
  type SessionResponse,
  type SessionSearchBias,
} from './api'
import { normalizeGooglePlaceId } from './placeId'
import { flowPhaseFromStatus } from './sessionHelpers'
import { LandingPage } from './ui/LandingPage'
import { LoadingScreen } from './ui/LoadingScreen'
import { ChoosePhase } from './ui/ChoosePhase'
import { RatePhase } from './ui/RatePhase'
import { ResultsPhase } from './ui/ResultsPhase'
import { RoomChrome } from './ui/RoomChrome'
import { ChoosePhaseSidebar, RatePhaseSidebar } from './ui/phaseSidebars'

const STORAGE_KEY = 'bingesync-session'

type PendingAction =
  | 'restore'
  | 'create'
  | 'join'
  | 'refresh'
  | 'add-option'
  | 'remove-option'
  | 'mark-selection-done'
  | 'submit-ratings'
  | 'load-results'
  | null

interface StoredSession {
  participantId: string
  sessionId: string
}

function readStoredSession(): StoredSession | null {
  const rawValue = window.sessionStorage.getItem(STORAGE_KEY)

  if (!rawValue) {
    return null
  }

  try {
    return JSON.parse(rawValue) as StoredSession
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function persistSession(value: StoredSession | null) {
  if (!value) {
    window.sessionStorage.removeItem(STORAGE_KEY)
    return
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

export default function App() {
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [participantId, setParticipantId] = useState('')
  const [userNameInput, setUserNameInput] = useState('')
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [hostMaxParticipants, setHostMaxParticipants] = useState(2)
  const [hostRoomTitle, setHostRoomTitle] = useState('')
  const [hostMaxPicksPerParticipant, setHostMaxPicksPerParticipant] = useState<number | null>(5)
  const [optionInput, setOptionInput] = useState('')
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [results, setResults] = useState<RankedResult[]>([])
  const [error, setError] = useState('')
  const [pendingAction, setPendingAction] = useState<PendingAction>('restore')
  const [bootstrapping, setBootstrapping] = useState(true)
  const [resultsLoading, setResultsLoading] = useState(false)
  const [copiedJoinCode, setCopiedJoinCode] = useState(false)
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const autocompleteRef = useRef<HTMLDivElement>(null)
  const optionListRef = useRef<HTMLDivElement>(null)

  const [hostAreaInput, setHostAreaInput] = useState('')
  const [hostAreaSuggestions, setHostAreaSuggestions] = useState<PlaceSuggestion[]>([])
  const [hostAreaShowSuggestions, setHostAreaShowSuggestions] = useState(false)
  const [hostSearchBias, setHostSearchBias] = useState<SessionSearchBias | null>(null)
  const hostAreaRef = useRef<HTMLDivElement>(null)

  const busy = pendingAction !== null

  useEffect(() => {
    const stored = readStoredSession()

    if (!stored) {
      setPendingAction(null)
      setBootstrapping(false)
      return
    }

    setParticipantId(stored.participantId)

    void refreshSession(stored.sessionId, stored.participantId, 'restore').finally(() => {
      setBootstrapping(false)
      setPendingAction(null)
    })
  }, [])

  useEffect(() => {
    if (!session || !participantId) {
      return
    }

    setRatings((prev) => {
      const fromServer = session.ratings[participantId] ?? {}
      const next: Record<string, number> = { ...prev }
      for (const o of session.options) {
        if (fromServer[o.id] != null && Number.isInteger(fromServer[o.id])) {
          next[o.id] = fromServer[o.id] as number
        } else if (next[o.id] == null && session.status === 'rating') {
          next[o.id] = 5
        }
      }
      return next
    })
  }, [participantId, session])

  useEffect(() => {
    if (!session?.sessionId || !participantId) return

    const source = new EventSource(
      `${API_BASE}/sessions/${session.sessionId}/events?participantId=${encodeURIComponent(participantId)}`,
    )
    source.onmessage = (event) => {
      try {
        setSession(JSON.parse(event.data) as SessionResponse)
      } catch {
        /* ignore malformed events */
      }
    }
    return () => source.close()
  }, [session?.sessionId, participantId])

  useEffect(() => {
    if (!session?.isReadyForResults) {
      setResults([])
      setResultsLoading(false)
      return
    }

    void loadResults(session.sessionId, false)
  }, [session?.isReadyForResults, session?.sessionId])

  useEffect(() => {
    if (!copiedJoinCode) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setCopiedJoinCode(false)
    }, 1800)

    return () => window.clearTimeout(timeoutId)
  }, [copiedJoinCode])

  useEffect(() => {
    const query = optionInput.trim()
    if (query.length < 2) {
      setSuggestions([])
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const resultsList = await fetchSuggestions(query, {
            signal: controller.signal,
            sessionId: session?.sessionId,
          })
          if (controller.signal.aborted) return
          const slice = resultsList.slice(0, 8)
          setSuggestions(slice)
          setShowSuggestions(true)

          const ids = slice.map((s) => s.placeId).filter((id) => id.length > 0)
          if (ids.length === 0) return

          void fetchSuggestionEnrichment(ids, { signal: controller.signal })
            .then((patch) => {
              if (controller.signal.aborted) return
              setSuggestions((prev) =>
                prev.map((s) => {
                  const extra = patch[s.placeId]
                  if (!extra) return s
                  return {
                    ...s,
                    rating: extra.rating ?? s.rating,
                    userRatingCount: extra.userRatingCount ?? s.userRatingCount,
                  }
                }),
              )
            })
            .catch((e: unknown) => {
              if (isAbortError(e)) return
            })
        } catch (e: unknown) {
          if (isAbortError(e)) return
        }
      })()
    }, 300)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [optionInput, session?.sessionId])

  useEffect(() => {
    const query = hostAreaInput.trim()
    if (query.length < 2) {
      setHostAreaSuggestions([])
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const list = await fetchAreaSuggestions(query, controller.signal)
          if (controller.signal.aborted) return
          setHostAreaSuggestions(list.slice(0, 8))
          setHostAreaShowSuggestions(true)
        } catch (e: unknown) {
          if (isAbortError(e)) return
        }
      })()
    }, 300)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [hostAreaInput])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
      if (hostAreaRef.current && !hostAreaRef.current.contains(e.target as Node)) {
        setHostAreaShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const participant = useMemo(
    () => session?.participants.find((entry) => entry.id === participantId) ?? null,
    [participantId, session?.participants],
  )

  const participantCount = session?.participants.length ?? 0

  const hasRatedEverything =
    session !== null &&
    session.options.length > 0 &&
    session.options.every((option) => {
      const score = ratings[option.id]
      return Number.isInteger(score) && score >= 0 && score <= 10
    })

  async function refreshSession(
    sessionId: string,
    storedParticipantId: string = participantId,
    action: Extract<PendingAction, 'restore' | 'refresh'> = 'refresh',
  ) {
    try {
      if (action === 'refresh') {
        setPendingAction('refresh')
      }

      setError('')
      const nextSession = await fetchSession(sessionId, storedParticipantId)
      setSession(nextSession)
      setParticipantId(storedParticipantId)
      persistSession({ sessionId, participantId: storedParticipantId })
    } catch (refreshError) {
      persistSession(null)
      setSession(null)
      setParticipantId('')
      setError(refreshError instanceof Error ? refreshError.message : 'Could not load session')
    } finally {
      if (action === 'refresh') {
        setPendingAction(null)
      }
    }
  }

  async function handleHostAreaSuggestionPick(suggestion: PlaceSuggestion) {
    if (busy) {
      return
    }
    const pid = suggestion.placeId?.trim()
    if (!pid) {
      return
    }
    try {
      setError('')
      const loc = await fetchPlaceBiasLocation(pid)
      if (!loc) {
        setError('Could not resolve that location. Try another place or leave this blank.')
        return
      }
      setHostSearchBias({
        latitude: loc.latitude,
        longitude: loc.longitude,
        label: loc.label ?? suggestion.name,
      })
      const line = [suggestion.name, suggestion.address].filter(Boolean).join(', ')
      setHostAreaInput(line)
      setHostAreaSuggestions([])
      setHostAreaShowSuggestions(false)
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : 'Could not resolve location')
    }
  }

  async function handleCreateSession() {
    try {
      setPendingAction('create')
      setError('')
      const response = await createSession(userNameInput, hostMaxParticipants, {
        title: hostRoomTitle.trim() || null,
        maxPicksPerParticipant: hostMaxPicksPerParticipant,
        searchBias: hostSearchBias,
      })
      setSession(response.session)
      setParticipantId(response.participantId)
      persistSession({
        sessionId: response.session.sessionId,
        participantId: response.participantId,
      })
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create session')
    } finally {
      setPendingAction(null)
    }
  }

  async function handleJoinSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setPendingAction('join')
      setError('')
      const response = await joinSession(joinCodeInput.trim().toUpperCase(), userNameInput)
      setSession(response.session)
      setParticipantId(response.participantId)
      persistSession({
        sessionId: response.session.sessionId,
        participantId: response.participantId,
      })
      setJoinCodeInput('')
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'Could not join session')
    } finally {
      setPendingAction(null)
    }
  }

  async function submitFoodOption(name: string, placeId?: string | null) {
    if (!session || !participantId) {
      return
    }

    const trimmed = name.trim()
    if (trimmed.length < 2) {
      return
    }

    try {
      setPendingAction('add-option')
      setError('')
      const nextSession = await addOption(
        session.sessionId,
        participantId,
        trimmed,
        placeId && placeId.length > 0 ? placeId : null,
      )
      setSession(nextSession)
      setOptionInput('')
      setSuggestions([])
      setShowSuggestions(false)
      window.requestAnimationFrame(() => {
        optionListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    } catch (optionError) {
      setError(optionError instanceof Error ? optionError.message : 'Could not add option')
    } finally {
      setPendingAction(null)
    }
  }

  async function handleAddOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await submitFoodOption(optionInput)
  }

  async function handleRemoveOption(optionId: string) {
    if (!session || !participantId) {
      return
    }

    try {
      setPendingAction('remove-option')
      setError('')
      const nextSession = await removeOption(session.sessionId, participantId, optionId)
      setSession(nextSession)
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Could not remove option')
    } finally {
      setPendingAction(null)
    }
  }

  function handleSuggestionPick(suggestion: PlaceSuggestion) {
    if (busy) {
      return
    }
    const key = normalizeGooglePlaceId(suggestion.placeId)
    const used = session?.usedGooglePlaceIds ?? []
    if (key != null && used.includes(key)) {
      return
    }
    void submitFoodOption(suggestion.name, suggestion.placeId || null)
  }

  async function handleMarkSelectionDone(done: boolean) {
    if (!session || !participantId) {
      return
    }

    try {
      setPendingAction('mark-selection-done')
      setError('')
      const nextSession = await markSelectionDone(session.sessionId, participantId, done)
      setSession(nextSession)
    } catch (selectionError) {
      setError(
        selectionError instanceof Error ? selectionError.message : 'Could not update your status',
      )
    } finally {
      setPendingAction(null)
    }
  }

  async function handleSubmitRatings() {
    if (!session || !participantId || !hasRatedEverything) {
      return
    }

    try {
      setPendingAction('submit-ratings')
      setError('')
      const nextSession = await submitRatings(session.sessionId, participantId, ratings)
      setSession(nextSession)
    } catch (ratingsError) {
      setError(ratingsError instanceof Error ? ratingsError.message : 'Could not save ratings')
    } finally {
      setPendingAction(null)
    }
  }

  async function loadResults(sessionId: string, showBusyState: boolean = true) {
    try {
      if (showBusyState) {
        setPendingAction('load-results')
      }

      setResultsLoading(true)
      setError('')
      const payload = await fetchResults(sessionId)
      setResults(payload.results)
    } catch (resultsError) {
      setError(resultsError instanceof Error ? resultsError.message : 'Could not load results')
    } finally {
      setResultsLoading(false)

      if (showBusyState) {
        setPendingAction(null)
      }
    }
  }

  async function handleCopyJoinCode() {
    if (!session) {
      return
    }

    try {
      await navigator.clipboard.writeText(session.joinCode)
      setCopiedJoinCode(true)
    } catch {
      setError('Could not copy the join code')
    }
  }

  function handleLeaveSession() {
    persistSession(null)
    setSession(null)
    setParticipantId('')
    setUserNameInput('')
    setJoinCodeInput('')
    setOptionInput('')
    setSuggestions([])
    setShowSuggestions(false)
    setHostAreaInput('')
    setHostAreaSuggestions([])
    setHostAreaShowSuggestions(false)
    setHostSearchBias(null)
    setRatings({})
    setResults([])
    setError('')
    setCopiedJoinCode(false)
    setResultsLoading(false)
    setPendingAction(null)
  }

  function setRating(optionId: string, score: number) {
    setRatings((currentRatings) => ({
      ...currentRatings,
      [optionId]: score,
    }))
  }

  if (bootstrapping) {
    return <LoadingScreen />
  }

  if (!session) {
    return (
      <LandingPage
        busy={busy}
        hostAreaInput={hostAreaInput}
        hostAreaRef={hostAreaRef}
        hostAreaShowSuggestions={hostAreaShowSuggestions}
        hostAreaSuggestions={hostAreaSuggestions}
        hostMaxParticipants={hostMaxParticipants}
        hostMaxPicksPerParticipant={hostMaxPicksPerParticipant}
        hostRoomTitle={hostRoomTitle}
        hostSearchBias={hostSearchBias}
        joinCodeInput={joinCodeInput}
        onClearHostSearchBias={() => {
          setHostSearchBias(null)
          setHostAreaInput('')
          setHostAreaSuggestions([])
          setHostAreaShowSuggestions(false)
        }}
        onInvalidateHostSearchBias={() => setHostSearchBias(null)}
        onCreate={handleCreateSession}
        onHostAreaSuggestionPick={handleHostAreaSuggestionPick}
        onJoinSubmit={handleJoinSession}
        pendingAction={pendingAction}
        setHostAreaInput={setHostAreaInput}
        setHostAreaShowSuggestions={setHostAreaShowSuggestions}
        setHostMaxParticipants={setHostMaxParticipants}
        setHostMaxPicksPerParticipant={setHostMaxPicksPerParticipant}
        setHostRoomTitle={setHostRoomTitle}
        setJoinCodeInput={setJoinCodeInput}
        setUserNameInput={setUserNameInput}
        userNameInput={userNameInput}
      />
    )
  }

  const phase = flowPhaseFromStatus(session.status)
  const sidebarFooter =
    phase === 'choose' ? (
      <ChoosePhaseSidebar participantId={participantId} session={session} />
    ) : phase === 'rating' ? (
      <RatePhaseSidebar participantId={participantId} session={session} />
    ) : null

  return (
    <RoomChrome
      activePhase={phase}
      busy={busy}
      copiedJoinCode={copiedJoinCode}
      error={error || null}
      joinCode={session.joinCode}
      maxParticipants={session.maxParticipants}
      roomTitle={session.title ?? null}
      searchAreaHint={session.searchBias?.label ?? null}
      onCopyCode={handleCopyJoinCode}
      onLeave={handleLeaveSession}
      onRefresh={() => refreshSession(session.sessionId)}
      participantCount={participantCount}
      participantLabel={participant?.label ?? 'You'}
      sidebarFooter={sidebarFooter}
    >
      {(session.status === 'waiting' || session.status === 'collecting') && (
        <ChoosePhase
          autocompleteRef={autocompleteRef}
          busy={busy}
          onAddSubmit={handleAddOption}
          onMarkSelectionDone={handleMarkSelectionDone}
          onRemoveOption={handleRemoveOption}
          onSuggestionPick={handleSuggestionPick}
          optionInput={optionInput}
          optionListRef={optionListRef}
          participantId={participantId}
          pendingAction={pendingAction}
          session={session}
          setOptionInput={setOptionInput}
          setShowSuggestions={setShowSuggestions}
          showSuggestions={showSuggestions}
          suggestions={suggestions}
          usedGooglePlaceIds={session.usedGooglePlaceIds ?? []}
        />
      )}

      {session.status === 'rating' && (
        <RatePhase
          busy={busy}
          hasRatedEverything={hasRatedEverything}
          onSubmitRatings={handleSubmitRatings}
          participantId={participantId}
          pendingAction={pendingAction}
          ratings={ratings}
          session={session}
          setRating={setRating}
        />
      )}

      {session.status === 'results' && (
        <ResultsPhase
          busy={busy}
          onRefreshResults={() => loadResults(session.sessionId)}
          participantId={participantId}
          pendingAction={pendingAction}
          results={results}
          resultsLoading={resultsLoading}
          session={session}
        />
      )}
    </RoomChrome>
  )
}
