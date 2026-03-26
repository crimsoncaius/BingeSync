import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  API_BASE,
  addOption,
  removeOption,
  createSession,
  fetchResults,
  fetchSession,
  fetchSuggestions,
  joinSession,
  markSelectionDone,
  submitRatings,
  type FoodOption,
  type PlaceSuggestion,
  type RankedResult,
  type SessionResponse,
} from './api'

const STORAGE_KEY = 'bingesync-session'
/** Host-selectable cap: 2–10 inclusive → nine options */
const HOST_PARTICIPANT_RANGE_LEN = 9
const RATING_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const STATUS_COPY: Record<SessionResponse['status'], string> = {
  waiting: 'Choose — room open',
  collecting: 'Choose — private lists',
  rating: 'Rating together',
  results: 'Results unlocked',
}

function participantFinishedRating(session: SessionResponse, pid: string) {
  if (session.options.length === 0) {
    return false
  }

  const row = session.ratings[pid] ?? {}

  return session.options.every((option) => {
    const score = row[option.id]
    return Number.isInteger(score) && score >= 1 && score <= 10
  })
}

/** Stepper groups waiting + collecting as one “Choose” phase (invite is not a separate step). */
type FlowStepKey = 'choose' | 'rating' | 'results'

const FLOW_ORDER: FlowStepKey[] = ['choose', 'rating', 'results']

function flowPhaseFromStatus(status: SessionResponse['status']): FlowStepKey {
  if (status === 'waiting' || status === 'collecting') {
    return 'choose'
  }
  if (status === 'rating') {
    return 'rating'
  }
  return 'results'
}

function flowStepClass(step: FlowStepKey, currentStatus: SessionResponse['status']) {
  const current = flowPhaseFromStatus(currentStatus)
  const stepIndex = FLOW_ORDER.indexOf(step)
  const currentIndex = FLOW_ORDER.indexOf(current)

  if (stepIndex === currentIndex) {
    return 'flow-step flow-step--current'
  }

  if (stepIndex < currentIndex) {
    return 'flow-step flow-step--done'
  }

  return 'flow-step flow-step--upcoming'
}

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

function renderActionLabel(
  pendingAction: PendingAction,
  expectedAction: Exclude<PendingAction, 'restore' | null>,
  idleLabel: string,
  busyLabel: string,
) {
  return pendingAction === expectedAction ? busyLabel : idleLabel
}

function formatReviewCount(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  }
  return String(n)
}

function PlaceOptionMeta({ option }: { option: FoodOption }) {
  const hasDetails =
    option.address ||
    option.rating != null ||
    option.priceLevel ||
    option.openNow != null ||
    option.phone ||
    option.googleMapsUri ||
    option.websiteUri

  if (!hasDetails) {
    return null
  }

  const metaParts: string[] = []
  if (option.rating != null) {
    const rc =
      option.userRatingCount != null ? ` (${formatReviewCount(option.userRatingCount)})` : ''
    metaParts.push(`★ ${option.rating.toFixed(1)}${rc}`)
  }
  if (option.priceLevel) {
    metaParts.push(option.priceLevel)
  }
  if (option.openNow === true) {
    metaParts.push('Open now')
  } else if (option.openNow === false) {
    metaParts.push('Closed')
  }

  const telHref = option.phone ? `tel:${option.phone.replace(/\s/g, '')}` : ''

  return (
    <div className="place-option-meta">
      {option.address ? <p className="place-option-meta__address">{option.address}</p> : null}
      {option.phone ? (
        <p className="place-option-meta__phone">
          <a href={telHref} rel="noopener noreferrer">
            {option.phone}
          </a>
        </p>
      ) : null}
      {metaParts.length > 0 ? <p className="place-option-meta__line">{metaParts.join(' · ')}</p> : null}
      {option.googleMapsUri || option.websiteUri ? (
        <p className="place-option-meta__links">
          {option.googleMapsUri ? (
            <a href={option.googleMapsUri} rel="noopener noreferrer" target="_blank">
              Maps
            </a>
          ) : null}
          {option.googleMapsUri && option.websiteUri ? ' · ' : null}
          {option.websiteUri ? (
            <a href={option.websiteUri} rel="noopener noreferrer" target="_blank">
              Website
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [participantId, setParticipantId] = useState('')
  const [userNameInput, setUserNameInput] = useState('')
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [hostMaxParticipants, setHostMaxParticipants] = useState(2)
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

    const existingRatings = session.ratings[participantId] ?? {}
    setRatings(existingRatings)
  }, [participantId, session])

  useEffect(() => {
    if (!session?.sessionId || !participantId) return

    const source = new EventSource(
      `${API_BASE}/sessions/${session.sessionId}/events?participantId=${encodeURIComponent(participantId)}`,
    )
    source.onmessage = (event) => {
      try {
        setSession(JSON.parse(event.data) as SessionResponse)
      } catch { /* ignore malformed events */ }
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

    const timer = window.setTimeout(async () => {
      const results = await fetchSuggestions(query)
      setSuggestions(results.slice(0, 5))
      setShowSuggestions(true)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [optionInput])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
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
  const ratedCount =
    session?.options.reduce((count, option) => {
      const score = ratings[option.id]
      return Number.isInteger(score) && score >= 1 && score <= 10 ? count + 1 : count
    }, 0) ?? 0

  const hasRatedEverything =
    session !== null &&
    session.options.length > 0 &&
    session.options.every((option) => {
      const score = ratings[option.id]
      return Number.isInteger(score) && score >= 1 && score <= 10
    })

  const topResult = results[0] ?? null

  const selectionDone = useMemo(
    () => session?.selectionDone ?? {},
    [session?.selectionDone],
  )

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

  async function handleCreateSession() {
    try {
      setPendingAction('create')
      setError('')
      const response = await createSession(userNameInput, hostMaxParticipants)
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
    return (
      <main className="shell shell--loading">
        <section className="loading-card" aria-live="polite" aria-busy="true">
          <div className="loading-orb" />
          <p className="eyebrow">Loading your session</p>
          <h1>Pulling your last food shortlist back into view.</h1>
          <p className="lede">Hang tight while BingeSync restores the shared room.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <section className="hero-card">
        <div className="hero-copy">
          {session ? (
            <>
              <p className="eyebrow">🍜 BingeSync room</p>
              <h1>Pick privately, rate together, then reveal.</h1>
              <p className="lede">
                You move through choose → rate → results. No one else sees your list until the
                rating round.
              </p>
            </>
          ) : (
            <>
              <p className="eyebrow">🍜 Shared food picks for small groups</p>
              <h1>Turn “what should we eat?” into one clear winner.</h1>
              <p className="lede">
                Build a shared list, rate each idea, and let BingeSync surface the best mutual pick
                without the usual debate spiral.
              </p>

              <div className="hero-steps" aria-label="How BingeSync works">
                <div className="hero-step">
                  <span>👥</span>
                  <strong>Start a room (2–10 people)</strong>
                </div>
                <div className="hero-step">
                  <span>🍜</span>
                  <strong>Add private picks, then rate</strong>
                </div>
                <div className="hero-step">
                  <span>🏆</span>
                  <strong>Reveal ranked mutual picks</strong>
                </div>
              </div>
            </>
          )}
        </div>

        {session ? (
          <aside className="hero-sidebar">
            <div className="spotlight-card">
              <p className="spotlight-label">Live room</p>
              <div className="join-code-block">
                <span>Join code</span>
                <strong>{session.joinCode}</strong>
              </div>
              <button className="secondary-button secondary-button--compact" onClick={handleCopyJoinCode}>
                {copiedJoinCode ? 'Copied' : 'Copy code'}
              </button>
            </div>

            <div className="session-meta">
              <div className="stat">
                <span className="stat-label">👥 Participants</span>
                <strong>
                  {participantCount}/{session.maxParticipants}
                </strong>
              </div>
              <div className="stat">
                <span className="stat-label">You joined as</span>
                <strong>{participant?.label ?? 'Participant'}</strong>
              </div>
              <div className="stat stat--accent">
                <span className="stat-label">Session stage</span>
                <strong>{STATUS_COPY[session.status]}</strong>
              </div>
            </div>
          </aside>
        ) : (
          <div className="entry-panel">
            <div className="entry-panel__header">
              <h2>Start a fresh room or hop into one fast.</h2>
              <p>Names are optional. The join code does the heavy lifting.</p>
            </div>

            <div className="entry-actions">
              <div className="action-card">
                <p className="action-card__emoji">🍽️</p>
                <h3>Create a room</h3>
                <p>Open a private session and share the code. You choose how many people can join.</p>
                <label className="action-card__field-label" htmlFor="hostMaxParticipants">
                  Max participants (including you)
                </label>
                <select
                  className="action-card__select"
                  disabled={busy}
                  id="hostMaxParticipants"
                  onChange={(event) => setHostMaxParticipants(Number(event.target.value))}
                  value={hostMaxParticipants}
                >
                  {Array.from({ length: HOST_PARTICIPANT_RANGE_LEN }, (_, index) => index + 2).map(
                    (n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ),
                  )}
                </select>
                <button className="primary-button" disabled={busy} onClick={handleCreateSession}>
                  {renderActionLabel(pendingAction, 'create', 'Create session', 'Creating session...')}
                </button>
              </div>

              <form className="join-form action-card" onSubmit={handleJoinSession}>
                <p className="action-card__emoji">👥</p>
                <h3>Join with a code</h3>
                <label htmlFor="userName">Your name</label>
                <input
                  id="userName"
                  maxLength={40}
                  onChange={(event) => setUserNameInput(event.target.value)}
                  placeholder="Caius"
                  value={userNameInput}
                />
                <label htmlFor="joinCode">Join code</label>
                <div className="join-row">
                  <input
                    id="joinCode"
                    maxLength={6}
                    minLength={6}
                    onChange={(event) => setJoinCodeInput(event.target.value.toUpperCase())}
                    placeholder="ABC123"
                    value={joinCodeInput}
                  />
                  <button className="secondary-button" disabled={busy || joinCodeInput.length < 6}>
                    {renderActionLabel(pendingAction, 'join', 'Join', 'Joining...')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>

      {error ? (
        <p className="error-banner" role="alert">
          {error}
        </p>
      ) : null}

      {session ? (
        <div className="workspace">
          <nav aria-label="Session progress" className="flow-stepper">
            <ol className="flow-stepper__list">
              <li className={flowStepClass('choose', session.status)}>
                <span className="flow-step__n">1</span>
                <span className="flow-step__label">Choose</span>
              </li>
              <li className={flowStepClass('rating', session.status)}>
                <span className="flow-step__n">2</span>
                <span className="flow-step__label">Rate</span>
              </li>
              <li className={flowStepClass('results', session.status)}>
                <span className="flow-step__n">3</span>
                <span className="flow-step__label">Results</span>
              </li>
            </ol>
          </nav>

          <div className="flow-toolbar">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => refreshSession(session.sessionId)}
              type="button"
            >
              {renderActionLabel(pendingAction, 'refresh', 'Refresh room', 'Refreshing...')}
            </button>
            <button className="ghost-button" disabled={busy} onClick={handleLeaveSession} type="button">
              Leave session
            </button>
          </div>

          {(session.status === 'waiting' || session.status === 'collecting') && (
            <>
              {(session.status === 'collecting' ||
                (session.status === 'waiting' && participantCount > 1)) ? (
                <section className="panel panel--partner-status">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">🔒 Private picks</p>
                      <h2>You can’t see each other’s lists.</h2>
                      <p>
                        You only see whether everyone has finished — not what they chose. When everyone
                        in the room taps “I’m done choosing”, picks merge for rating. You don’t need to fill
                        every seat first.
                      </p>
                    </div>
                  </div>
                  <div className="partner-status-grid">
                    {session.participants.map((entry) => (
                      <div className="partner-status-card" key={entry.id}>
                        <span className="partner-status-card__who">
                          {entry.id === participantId ? 'You' : entry.label}
                        </span>
                        <span
                          className={
                            selectionDone[entry.id]
                              ? 'partner-status-card__state partner-status-card__state--done'
                              : 'partner-status-card__state'
                          }
                        >
                          {selectionDone[entry.id] ? 'Finished choosing' : 'Still adding'}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="panel panel--shortlist">
                <div className="panel-header">
                  <div>
                    <p className="section-kicker">🍜 Choose</p>
                    <h2>
                      {session.status === 'collecting'
                        ? 'Add your picks — yours stay private.'
                        : participantCount > 1
                          ? 'Add your picks — only you see your list.'
                          : 'Add picks and share the code — new people can join until the room is full.'}
                    </h2>
                    <p>
                      {session.status === 'collecting' || (session.status === 'waiting' && participantCount > 1)
                        ? 'When everyone in the room taps “I’m done choosing”, picks merge for rating. You can start without filling every seat.'
                        : 'Friends can join with the code while spots are open.'}
                    </p>
                  </div>
                  <span className="pill">{session.options.length} on your list</span>
                </div>

                {session.status === 'waiting' ? (
                  <div className="participant-grid">
                    {session.participants.map((entry) => (
                      <article className="participant-card" key={entry.id}>
                        <span className="participant-label">
                          {entry.id === participantId ? 'You' : 'Joined participant'}
                        </span>
                        <strong>{entry.label}</strong>
                      </article>
                    ))}
                    {session.participants.length < session.maxParticipants ? (
                      <article className="participant-card participant-card--empty">
                        <span className="participant-label">Open spot</span>
                        <strong>
                          {session.maxParticipants - session.participants.length === 1
                            ? '1 spot left'
                            : `${session.maxParticipants - session.participants.length} spots left`}
                        </strong>
                        <span className="waiting-code">{session.joinCode}</span>
                        <button
                          className="secondary-button secondary-button--compact"
                          onClick={handleCopyJoinCode}
                          type="button"
                        >
                          {copiedJoinCode ? 'Copied' : 'Copy code'}
                        </button>
                      </article>
                    ) : null}
                  </div>
                ) : null}

                <form className="option-form" onSubmit={handleAddOption}>
                  <div className="autocomplete-wrapper" ref={autocompleteRef}>
                    <input
                      onChange={(event) => setOptionInput(event.target.value)}
                      onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setShowSuggestions(false)
                      }}
                      placeholder="Ramen, tacos, Korean fried chicken..."
                      value={optionInput}
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <ul className="autocomplete-dropdown" role="listbox">
                        {suggestions.map((s, index) => (
                          <li
                            className={busy ? 'autocomplete-dropdown__item--busy' : undefined}
                            key={s.placeId ? s.placeId : `q-${s.name}-${index}`}
                            role="option"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              if (busy) {
                                return
                              }
                              handleSuggestionPick(s)
                            }}
                          >
                            <div className="suggestion-row">
                              <span className="suggestion-icon" aria-hidden="true">
                                🍴
                              </span>
                              <div className="suggestion-text">
                                <strong>{s.name}</strong>
                                {s.address && <small>{s.address}</small>}
                              </div>
                              <span className="suggestion-badge">{s.foodType.replace(/_/g, ' ')}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button className="primary-button" disabled={busy || optionInput.trim().length < 2}>
                    {renderActionLabel(pendingAction, 'add-option', 'Add food option', 'Adding option...')}
                  </button>
                </form>

                <div className="option-list" ref={optionListRef}>
                  {session.options.length === 0 ? (
                    <p className="empty-state">
                      🍜 No options yet. Add at least one place you’d be happy with.
                    </p>
                  ) : (
                    session.options.map((option) => {
                      const isMine = option.addedBy === participantId
                      const canRemove =
                        isMine &&
                        (session.status === 'waiting' || session.status === 'collecting')

                      return (
                        <article className="option-row" key={option.id}>
                          <div className="option-row__main">
                            <strong>{option.name}</strong>
                            <small>
                              {participantCount > 1 || session.status === 'collecting'
                                ? 'On your private list'
                                : 'On your list'}
                            </small>
                            <PlaceOptionMeta option={option} />
                          </div>
                          <div className="option-row__aside">
                            {canRemove ? (
                              <button
                                className="secondary-button secondary-button--compact option-row__remove"
                                disabled={busy}
                                onClick={() => handleRemoveOption(option.id)}
                                type="button"
                              >
                                {pendingAction === 'remove-option' ? 'Removing…' : 'Remove'}
                              </button>
                            ) : null}
                            <span className="option-tag">Private</span>
                          </div>
                        </article>
                      )
                    })
                  )}
                </div>

                {(session.status === 'waiting' || session.status === 'collecting') &&
                participantCount >= 2 ? (
                  <div className="panel-actions panel-actions--stack">
                    <button
                      className="primary-button"
                      disabled={
                        busy ||
                        session.options.length === 0 ||
                        selectionDone[participantId]
                      }
                      onClick={() => handleMarkSelectionDone(true)}
                      type="button"
                    >
                      {renderActionLabel(
                        pendingAction,
                        'mark-selection-done',
                        'I’m done choosing',
                        'Saving...',
                      )}
                    </button>
                    {selectionDone[participantId] ? (
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => handleMarkSelectionDone(false)}
                        type="button"
                      >
                        {pendingAction === 'mark-selection-done' ? 'Saving...' : 'Keep editing my list'}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </>
          )}

          {session.status === 'rating' && (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">⭐ Rate together</p>
                  <h2>Score every combined option from 1 to 10.</h2>
                  <p>
                    You can see who has finished submitting scores — individual ratings stay private
                    until the final step.
                  </p>
                </div>
                <span className="pill">
                  {ratedCount}/{session.options.length} rated by you
                </span>
              </div>

              <div className="partner-status-grid partner-status-grid--rating">
                {session.participants.map((entry) => (
                  <div className="partner-status-card" key={entry.id}>
                    <span className="partner-status-card__who">
                      {entry.id === participantId ? 'You' : entry.label}
                    </span>
                    <span
                      className={
                        participantFinishedRating(session, entry.id)
                          ? 'partner-status-card__state partner-status-card__state--done'
                          : 'partner-status-card__state'
                      }
                    >
                      {participantFinishedRating(session, entry.id)
                        ? 'Ratings submitted'
                        : 'Not done yet'}
                    </span>
                  </div>
                ))}
              </div>

              {session.options.length === 0 ? (
                <p className="empty-state">No options to rate.</p>
              ) : (
                <div className="ratings-list">
                  {session.options.map((option) => {
                    const currentRating = ratings[option.id]

                    return (
                      <article className="rating-card" key={option.id}>
                        <div className="rating-card__header">
                          <div className="rating-card__title">
                            <strong>{option.name}</strong>
                            <small>
                              {option.addedBy === participantId
                                ? 'You suggested this'
                                : `Suggested by ${session.participants.find((p) => p.id === option.addedBy)?.label ?? 'someone'}`}
                            </small>
                            <PlaceOptionMeta option={option} />
                          </div>
                          <span className="rating-value" aria-live="polite">
                            {currentRating ? `${currentRating}/10` : 'Unrated'}
                          </span>
                        </div>

                        <div
                          aria-label={`Rate ${option.name}`}
                          className="rating-scale"
                          role="group"
                        >
                          {RATING_VALUES.map((score) => (
                            <button
                              aria-pressed={currentRating === score}
                              className={`rating-chip${currentRating === score ? ' rating-chip--selected' : ''}`}
                              key={score}
                              onClick={() => setRating(option.id, score)}
                              type="button"
                            >
                              {score}
                            </button>
                          ))}
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}

              <div className="panel-actions">
                <button
                  className="primary-button"
                  disabled={busy || !hasRatedEverything}
                  onClick={handleSubmitRatings}
                  type="button"
                >
                  {renderActionLabel(
                    pendingAction,
                    'submit-ratings',
                    'Submit my ratings',
                    'Saving ratings...',
                  )}
                </button>
              </div>
            </section>
          )}

          {session.status === 'results' && (
            <section className="panel panel--results">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">🏆 Results</p>
                  <h2>Your strongest mutual picks.</h2>
                  <p>Everyone’s ratings are in — here’s how the combined shortlist ranks.</p>
                </div>
                <span className="pill pill--success">Complete</span>
              </div>

              {resultsLoading ? (
                <div className="results-list results-list--loading" aria-live="polite" aria-busy="true">
                  <div className="result-skeleton" />
                  <div className="result-skeleton" />
                  <div className="result-skeleton" />
                </div>
              ) : results.length === 0 ? (
                <p className="empty-state">
                  🏆 Loading ranked results… use Refresh if this stays empty.
                </p>
              ) : (
                <>
                  {topResult ? (
                    <article className="winner-card">
                      <div>
                        <p className="winner-card__label">🏆 Top match</p>
                        <h3>{topResult.name}</h3>
                        <p className="winner-card__copy">
                          This option scored highest across the group, balancing enthusiasm with low
                          disagreement.
                        </p>
                      </div>
                      <dl className="score-grid">
                        <div>
                          <dt>Final score</dt>
                          <dd>{topResult.finalScore.toFixed(1)}</dd>
                        </div>
                        <div>
                          <dt>Average</dt>
                          <dd>{topResult.averageScore.toFixed(1)}</dd>
                        </div>
                        <div>
                          <dt>Penalty</dt>
                          <dd>{topResult.disagreementPenalty.toFixed(1)}</dd>
                        </div>
                      </dl>
                    </article>
                  ) : null}

                  <div className="results-list">
                    {results.map((result, index) => (
                      <article
                        className={`result-card${index === 0 ? ' result-card--winner' : ''}`}
                        key={result.optionId}
                      >
                        <div>
                          <p className="result-rank">{index === 0 ? '🥇 Winner' : `#${index + 1}`}</p>
                          <h3>{result.name}</h3>
                        </div>
                        <dl>
                          <div>
                            <dt>Final score</dt>
                            <dd>{result.finalScore.toFixed(1)}</dd>
                          </div>
                          <div>
                            <dt>Average</dt>
                            <dd>{result.averageScore.toFixed(1)}</dd>
                          </div>
                          <div>
                            <dt>Penalty</dt>
                            <dd>{result.disagreementPenalty.toFixed(1)}</dd>
                          </div>
                        </dl>
                      </article>
                    ))}
                  </div>
                </>
              )}

              <div className="panel-actions">
                <button
                  className="secondary-button"
                  disabled={busy || resultsLoading}
                  onClick={() => loadResults(session.sessionId)}
                  type="button"
                >
                  {renderActionLabel(pendingAction, 'load-results', 'Reload results', 'Loading...')}
                </button>
              </div>
            </section>
          )}
        </div>
      ) : null}
    </main>
  )
}
