import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  API_BASE,
  addOption,
  createSession,
  fetchResults,
  fetchSession,
  fetchSuggestions,
  joinSession,
  submitRatings,
  type PlaceSuggestion,
  type RankedResult,
  type SessionResponse,
} from './api'

const STORAGE_KEY = 'bingesync-session'
const RATING_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const STATUS_COPY: Record<SessionResponse['status'], string> = {
  waiting: 'Waiting for your duo',
  collecting: 'Collecting options',
  rating: 'Ratings in progress',
  results: 'Results unlocked',
}

type PendingAction =
  | 'restore'
  | 'create'
  | 'join'
  | 'refresh'
  | 'add-option'
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

export default function App() {
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [participantId, setParticipantId] = useState('')
  const [userNameInput, setUserNameInput] = useState('')
  const [joinCodeInput, setJoinCodeInput] = useState('')
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

    const source = new EventSource(`${API_BASE}/sessions/${session.sessionId}/events`)
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
      const nextSession = await fetchSession(sessionId)
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
      const response = await createSession(userNameInput)
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

  async function handleAddOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!session || !participantId) {
      return
    }

    try {
      setPendingAction('add-option')
      setError('')
      const nextSession = await addOption(session.sessionId, participantId, optionInput.trim())
      setSession(nextSession)
      setOptionInput('')
      setSuggestions([])
      setShowSuggestions(false)
    } catch (optionError) {
      setError(optionError instanceof Error ? optionError.message : 'Could not add option')
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
          <p className="eyebrow">🍜 Shared food picks for two</p>
          <h1>Turn “what should we eat?” into one clear winner.</h1>
          <p className="lede">
            Build a shared list, rate each idea, and let BingeSync surface the best mutual pick
            without the usual debate spiral.
          </p>

          <div className="hero-steps" aria-label="How BingeSync works">
            <div className="hero-step">
              <span>👥</span>
              <strong>Start a duo session</strong>
            </div>
            <div className="hero-step">
              <span>🍜</span>
              <strong>Add options together</strong>
            </div>
            <div className="hero-step">
              <span>🏆</span>
              <strong>Reveal ranked mutual picks</strong>
            </div>
          </div>
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
                <p>Open a private session and share the code with your food partner.</p>
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
          <section className="panel panel--session">
            <div className="panel-header">
              <div>
                <p className="section-kicker">👥 Session</p>
                <h2>Keep the room moving.</h2>
                <p>
                  Share the code, refresh when your partner joins, and watch the session advance as
                  each step gets completed.
                </p>
              </div>
              <div className="panel-actions">
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => refreshSession(session.sessionId)}
                >
                  {renderActionLabel(pendingAction, 'refresh', 'Refresh room', 'Refreshing...')}
                </button>
                <button className="ghost-button" disabled={busy} onClick={handleLeaveSession}>
                  Leave session
                </button>
              </div>
            </div>

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
                  <span className="participant-label">Waiting slot</span>
                  <strong>Share this code to invite your duo</strong>
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
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">🍜 Options</p>
                <h2>Fill the shortlist.</h2>
                <p>Add places or food ideas from either person so the shared pool feels real.</p>
              </div>
              <span className="pill">{session.options.length} picks in play</span>
            </div>

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
                    {suggestions.map((s) => (
                      <li
                        key={s.placeId}
                        role="option"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setOptionInput(s.name)
                          setSuggestions([])
                          setShowSuggestions(false)
                        }}
                      >
                        <div className="suggestion-row">
                          <span className="suggestion-icon" aria-hidden="true">🍴</span>
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

            <div className="option-list">
              {session.options.length === 0 ? (
                <p className="empty-state">
                  🍜 No options yet. Add a few strong cravings to unlock the rating round.
                </p>
              ) : (
                session.options.map((option) => (
                  <article className="option-row" key={option.id}>
                    <div>
                      <strong>{option.name}</strong>
                      <small>
                        Added by {option.addedBy === participantId ? 'you' : 'the other person'}
                      </small>
                    </div>
                    <span className="option-tag">Ready to rate</span>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">⭐ Ratings</p>
                <h2>Score each option from 1 to 10.</h2>
                <p>Tap the number that matches your appetite. Higher numbers mean stronger interest.</p>
              </div>
              <span className="pill">{ratedCount}/{session.options.length} rated</span>
            </div>

            {session.options.length === 0 ? (
              <p className="empty-state">Add at least one food option before you start rating.</p>
            ) : (
              <div className="ratings-list">
                {session.options.map((option) => {
                  const currentRating = ratings[option.id]

                  return (
                    <article className="rating-card" key={option.id}>
                      <div className="rating-card__header">
                        <div>
                          <strong>{option.name}</strong>
                          <small>
                            {currentRating ? `Your rating: ${currentRating}/10` : 'Pick a score to lock it in'}
                          </small>
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
              >
                {renderActionLabel(
                  pendingAction,
                  'submit-ratings',
                  'Save my ratings',
                  'Saving ratings...',
                )}
              </button>
              <button
                className="secondary-button"
                disabled={busy || !session.isReadyForResults}
                onClick={() => loadResults(session.sessionId)}
              >
                {renderActionLabel(pendingAction, 'load-results', 'Show results', 'Loading results...')}
              </button>
            </div>
          </section>

          <section className="panel panel--results">
            <div className="panel-header">
              <div>
                <p className="section-kicker">🏆 Results</p>
                <h2>See the strongest mutual picks.</h2>
                <p>
                  Results appear once both people have rated every option in the pool.
                </p>
              </div>
              <span className={`pill${session.isReadyForResults ? ' pill--success' : ''}`}>
                {session.isReadyForResults ? 'Results ready' : 'Waiting for both people'}
              </span>
            </div>

            {resultsLoading ? (
              <div className="results-list results-list--loading" aria-live="polite" aria-busy="true">
                <div className="result-skeleton" />
                <div className="result-skeleton" />
                <div className="result-skeleton" />
              </div>
            ) : results.length === 0 ? (
              <p className="empty-state">
                🏆 No ranked results yet. Refresh the room if your partner just finished rating.
              </p>
            ) : (
              <>
                {topResult ? (
                  <article className="winner-card">
                    <div>
                      <p className="winner-card__label">🏆 Top match</p>
                      <h3>{topResult.name}</h3>
                      <p className="winner-card__copy">
                        This option scored highest across both people, balancing enthusiasm with low
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
          </section>
        </div>
      ) : null}
    </main>
  )
}
