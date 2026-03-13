import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  addOption,
  createSession,
  fetchResults,
  fetchSession,
  joinSession,
  submitRatings,
  type RankedResult,
  type SessionResponse,
} from './api'

const STORAGE_KEY = 'bingesync-session'

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
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [optionInput, setOptionInput] = useState('')
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [results, setResults] = useState<RankedResult[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(true)

  useEffect(() => {
    const stored = readStoredSession()

    if (!stored) {
      setBootstrapping(false)
      return
    }

    setParticipantId(stored.participantId)

    void refreshSession(stored.sessionId, stored.participantId).finally(() => {
      setBootstrapping(false)
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
    if (!session?.isReadyForResults) {
      setResults([])
      return
    }

    void loadResults(session.sessionId)
  }, [session?.isReadyForResults, session?.sessionId])

  const participant = useMemo(
    () => session?.participants.find((entry) => entry.id === participantId) ?? null,
    [participantId, session?.participants],
  )

  const hasRatedEverything =
    session !== null &&
    session.options.length > 0 &&
    session.options.every((option) => {
      const score = ratings[option.id]
      return Number.isInteger(score) && score >= 1 && score <= 10
    })

  async function refreshSession(
    sessionId: string,
    storedParticipantId: string = participantId,
  ) {
    try {
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
    }
  }

  async function handleCreateSession() {
    try {
      setBusy(true)
      setError('')
      const response = await createSession()
      setSession(response.session)
      setParticipantId(response.participantId)
      persistSession({
        sessionId: response.session.sessionId,
        participantId: response.participantId,
      })
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create session')
    } finally {
      setBusy(false)
    }
  }

  async function handleJoinSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setBusy(true)
      setError('')
      const response = await joinSession(joinCodeInput.trim().toUpperCase())
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
      setBusy(false)
    }
  }

  async function handleAddOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!session || !participantId) {
      return
    }

    try {
      setBusy(true)
      setError('')
      const nextSession = await addOption(session.sessionId, participantId, optionInput.trim())
      setSession(nextSession)
      setOptionInput('')
    } catch (optionError) {
      setError(optionError instanceof Error ? optionError.message : 'Could not add option')
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmitRatings() {
    if (!session || !participantId || !hasRatedEverything) {
      return
    }

    try {
      setBusy(true)
      setError('')
      const nextSession = await submitRatings(session.sessionId, participantId, ratings)
      setSession(nextSession)
    } catch (ratingsError) {
      setError(ratingsError instanceof Error ? ratingsError.message : 'Could not save ratings')
    } finally {
      setBusy(false)
    }
  }

  async function loadResults(sessionId: string) {
    try {
      setError('')
      const payload = await fetchResults(sessionId)
      setResults(payload.results)
    } catch (resultsError) {
      setError(resultsError instanceof Error ? resultsError.message : 'Could not load results')
    }
  }

  function handleLeaveSession() {
    persistSession(null)
    setSession(null)
    setParticipantId('')
    setJoinCodeInput('')
    setOptionInput('')
    setRatings({})
    setResults([])
    setError('')
  }

  function setRating(optionId: string, rawValue: string) {
    const parsed = Number(rawValue)

    setRatings((currentRatings) => ({
      ...currentRatings,
      [optionId]: Number.isFinite(parsed) ? Math.max(1, Math.min(10, parsed)) : 1,
    }))
  }

  if (bootstrapping) {
    return <main className="shell">Restoring your last session...</main>
  }

  return (
    <main className="shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">BingeSync MVP</p>
          <h1>Pick food faster with one shared rating flow.</h1>
          <p className="lede">
            Create a session, share a join code, add food ideas, then let the app rank the safest
            mutual picks.
          </p>
        </div>

        {session ? (
          <div className="session-meta">
            <div className="stat">
              <span className="stat-label">Join code</span>
              <strong>{session.joinCode}</strong>
            </div>
            <div className="stat">
              <span className="stat-label">You are</span>
              <strong>{participant?.label ?? 'Participant'}</strong>
            </div>
            <div className="stat">
              <span className="stat-label">Status</span>
              <strong>{session.status}</strong>
            </div>
          </div>
        ) : (
          <div className="entry-actions">
            <button className="primary-button" disabled={busy} onClick={handleCreateSession}>
              Create session
            </button>

            <form className="join-form" onSubmit={handleJoinSession}>
              <label htmlFor="joinCode">Join with code</label>
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
                  Join
                </button>
              </div>
            </form>
          </div>
        )}
      </section>

      {error ? <p className="error-banner">{error}</p> : null}

      {session ? (
        <>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Session</h2>
                <p>
                  Share code <strong>{session.joinCode}</strong> with one other person, then refresh
                  whenever they join or finish a step.
                </p>
              </div>
              <div className="panel-actions">
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => refreshSession(session.sessionId)}
                >
                  Refresh
                </button>
                <button className="ghost-button" disabled={busy} onClick={handleLeaveSession}>
                  Leave
                </button>
              </div>
            </div>

            <div className="participant-grid">
              {session.participants.map((entry) => (
                <div className="participant-card" key={entry.id}>
                  <span className="participant-label">{entry.label}</span>
                  <strong>{entry.id === participantId ? 'You' : 'Joined'}</strong>
                </div>
              ))}
              {session.participants.length < session.maxParticipants ? (
                <div className="participant-card participant-card--empty">
                  <span className="participant-label">Waiting</span>
                  <strong>1 more person</strong>
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Add food options</h2>
                <p>Keep it simple for v1: dishes, takeout categories, or restaurant names.</p>
              </div>
              <span className="pill">{session.options.length} options</span>
            </div>

            <form className="option-form" onSubmit={handleAddOption}>
              <input
                onChange={(event) => setOptionInput(event.target.value)}
                placeholder="Sushi, tacos, ramen..."
                value={optionInput}
              />
              <button className="primary-button" disabled={busy || optionInput.trim().length < 2}>
                Add option
              </button>
            </form>

            <div className="option-list">
              {session.options.length === 0 ? (
                <p className="muted">No options yet. Add a few ideas to unlock ratings.</p>
              ) : (
                session.options.map((option) => (
                  <div className="option-row" key={option.id}>
                    <span>{option.name}</span>
                    <small>Added by {option.addedBy === participantId ? 'you' : 'the other person'}</small>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Rate the combined pool</h2>
                <p>Score every option from 1 to 10. Higher numbers mean you are more up for it.</p>
              </div>
              <span className="pill">
                {hasRatedEverything ? 'Ready to submit' : 'Ratings incomplete'}
              </span>
            </div>

            {session.options.length === 0 ? (
              <p className="muted">Add at least one option before rating.</p>
            ) : (
              <div className="ratings-list">
                {session.options.map((option) => (
                  <label className="rating-row" htmlFor={option.id} key={option.id}>
                    <span>{option.name}</span>
                    <input
                      id={option.id}
                      max={10}
                      min={1}
                      onChange={(event) => setRating(option.id, event.target.value)}
                      type="number"
                      value={ratings[option.id] ?? ''}
                    />
                  </label>
                ))}
              </div>
            )}

            <div className="panel-actions">
              <button
                className="primary-button"
                disabled={busy || !hasRatedEverything}
                onClick={handleSubmitRatings}
              >
                Save my ratings
              </button>
              <button
                className="secondary-button"
                disabled={busy || !session.isReadyForResults}
                onClick={() => loadResults(session.sessionId)}
              >
                Show results
              </button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Mutual picks</h2>
                <p>
                  Results unlock after both joined participants have rated every option in the shared
                  list.
                </p>
              </div>
              <span className="pill">
                {session.isReadyForResults ? 'Results ready' : 'Waiting for both people'}
              </span>
            </div>

            {results.length === 0 ? (
              <p className="muted">No ranked results yet. Refresh if the second person just finished rating.</p>
            ) : (
              <div className="results-list">
                {results.map((result, index) => (
                  <article className="result-card" key={result.optionId}>
                    <div>
                      <p className="result-rank">#{index + 1}</p>
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
                        <dt>Variance penalty</dt>
                        <dd>{result.disagreementPenalty.toFixed(1)}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  )
}
