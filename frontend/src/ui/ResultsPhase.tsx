import type { RankedResult, SessionResponse } from '../api'
import { foodImageForIndex, foodImageForOption } from './foodImages'

type PendingAction = 'load-results' | null

function renderActionLabel(
  pendingAction: PendingAction | string | null,
  expected: PendingAction,
  idle: string,
  busy: string,
) {
  return pendingAction === expected ? busy : idle
}

function alignmentLabel(results: RankedResult[]): { label: string; pct: number; blurb: string } {
  if (results.length < 2) {
    return {
      label: '—',
      pct: 0,
      blurb: 'Add more options and votes to see group alignment.',
    }
  }
  const gap = results[0].finalScore - results[1].finalScore
  const pct = Math.min(95, Math.round(60 + gap * 10))
  if (gap >= 1.5) {
    return {
      label: `High (${pct}%)`,
      pct,
      blurb: 'Your group agrees strongly on the top pick. Lower-ranked options had more split opinions.',
    }
  }
  if (gap >= 0.4) {
    return {
      label: `Moderate (${pct}%)`,
      pct,
      blurb: 'The top pick is ahead, but the race was closer — a few options were still in play.',
    }
  }
  return {
    label: `Mixed (${pct}%)`,
    pct,
    blurb: 'Scores are tight across the shortlist — preferences were spread across several places.',
  }
}

export interface ResultsPhaseProps {
  session: SessionResponse
  participantId: string
  results: RankedResult[]
  resultsLoading: boolean
  onRefreshResults: () => void
  onLeave: () => void
  pendingAction: PendingAction | string | null
  busy: boolean
}

export function ResultsPhase({
  session,
  participantId,
  results,
  resultsLoading,
  onRefreshResults,
  onLeave,
  pendingAction,
  busy,
}: ResultsPhaseProps) {
  const totalVotes = session.participants.length

  if (resultsLoading) {
    return (
      <div className="flex-1 max-w-6xl mx-auto w-full px-4 md:px-8 py-6 space-y-8 pb-28 md:pb-8">
        <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-8 text-center">
          <div className="inline-block h-10 w-10 rounded-full border-2 border-primary-container/30 border-t-primary animate-spin mb-4" />
          <p className="text-on-surface-variant">Loading ranked results…</p>
        </div>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="flex-1 max-w-6xl mx-auto w-full px-4 md:px-8 py-6 space-y-8 pb-28 md:pb-8">
        <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-8 text-center text-on-surface-variant">
          No ranked results yet. Try refreshing once everyone has submitted ratings.
        </div>
      </div>
    )
  }

  const top = results[0]
  const rest = results.slice(1)
  const align = alignmentLabel(results)
  const topOption = session.options.find((o) => o.id === top.optionId)

  const myVoteForWinner =
    session.ratings[participantId]?.[top.optionId] != null
      ? session.ratings[participantId][top.optionId]
      : null

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-4 md:px-8 py-6 space-y-8 pb-28 md:pb-8">
        <>
          <section className="relative overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
            <div className="flex flex-col lg:flex-row">
              <div className="lg:w-2/3 p-8 md:p-12 relative z-10 flex flex-col justify-center">
                <div className="inline-flex items-center gap-2 bg-primary-container/20 text-primary px-4 py-1 rounded-full mb-6 w-fit">
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                    military_tech
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider font-label">The People&apos;s Choice</span>
                </div>
                <h1 className="text-5xl md:text-7xl font-headline font-black text-on-surface leading-tight tracking-tighter">
                  {top.name}
                </h1>
                <p className="mt-4 text-lg text-on-surface-variant flex items-start gap-2 font-body">
                  <span className="material-symbols-outlined text-secondary shrink-0">location_on</span>
                  <span>
                    {session.options.find((o) => o.id === top.optionId)?.address ?? 'Address not on file — open Maps from the list below.'}
                  </span>
                </p>
                <div className="mt-10 flex flex-wrap gap-4">
                  {session.options.find((o) => o.id === top.optionId)?.googleMapsUri ? (
                    <a
                      className="orange-gradient-cta text-on-primary px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:scale-95 transition-transform flex items-center gap-2"
                      href={session.options.find((o) => o.id === top.optionId)!.googleMapsUri!}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <span className="material-symbols-outlined">map</span>
                      Open in Maps
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 px-6 py-3 text-on-surface-variant text-sm">
                      Add a place from search next time to unlock Maps links.
                    </span>
                  )}
                  {session.options.find((o) => o.id === top.optionId)?.websiteUri ? (
                    <a
                      className="bg-surface-container-high text-on-surface px-8 py-4 rounded-xl font-bold text-lg hover:bg-surface-variant transition-colors"
                      href={session.options.find((o) => o.id === top.optionId)!.websiteUri!}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      View Menu / Site
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="lg:w-1/3 min-h-[300px] relative">
                <img
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  src={foodImageForOption(topOption, 0)}
                  onError={(e) => {
                    e.currentTarget.onerror = null
                    e.currentTarget.src = foodImageForIndex(0)
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-surface-container-lowest via-transparent to-transparent lg:block hidden" />
                <div className="absolute bottom-6 right-6 glass-panel p-4 rounded-xl border border-outline-variant/20 shadow-xl">
                  <div className="text-center">
                    <span className="block text-4xl font-headline font-black text-primary">
                      {top.finalScore.toFixed(1)}
                    </span>
                    <span className="text-xs font-label text-secondary-dim uppercase tracking-widest font-bold">
                      Sync Score
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex justify-between items-end mb-2">
                <h2 className="text-2xl font-headline font-bold text-on-surface">Leaderboard</h2>
                <span className="text-sm font-label text-secondary-dim">
                  Based on {totalVotes} {totalVotes === 1 ? 'person' : 'people'} in the room
                </span>
              </div>
              {rest.map((row, i) => {
                const rank = i + 2
                return (
                  <div
                    className="group bg-surface-container-low p-5 rounded-xl flex items-center gap-6 hover:bg-surface-container-high transition-colors"
                    key={row.optionId}
                  >
                    <div className="w-12 h-12 flex items-center justify-center rounded-full bg-surface-container-highest text-secondary font-black text-xl shrink-0">
                      {rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-headline font-bold text-on-surface truncate">{row.name}</h3>
                      <div className="flex flex-wrap gap-4 mt-1">
                        <div className="flex items-center gap-1 text-xs font-label text-on-surface-variant">
                          <span className="text-primary font-bold">{row.averageScore.toFixed(1)}</span>
                          Average enthusiasm
                        </div>
                        <div className="flex items-center gap-1 text-xs font-label text-error">
                          <span className="font-bold">-{row.disagreementPenalty.toFixed(1)}</span>
                          Consensus penalty
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="block text-2xl font-headline font-bold text-secondary">
                        {row.finalScore.toFixed(1)}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-outline-variant tracking-tighter">
                        Final score
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <aside className="space-y-6">
              <div className="bg-secondary-container rounded-xl p-6 relative overflow-hidden">
                <div className="relative z-10">
                  <h3 className="font-headline font-bold text-on-secondary-container flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined">analytics</span>
                    Session insights
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-on-secondary-fixed-variant">Group alignment</span>
                      <span className="font-bold text-tertiary">{align.label}</span>
                    </div>
                    <div className="w-full bg-surface/30 h-2 rounded-full">
                      <div
                        className="bg-tertiary h-2 rounded-full transition-all"
                        style={{ width: `${align.pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-on-secondary-fixed-variant leading-relaxed opacity-80">{align.blurb}</p>
                  </div>
                </div>
                <div className="absolute -top-4 -right-4 w-24 h-24 bg-primary-container/10 rounded-full blur-2xl" />
              </div>

              <div className="flex flex-col gap-3">
                <button
                  className="w-full bg-surface-container-highest text-on-surface py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-surface-variant transition-colors group disabled:opacity-50"
                  disabled={busy || resultsLoading}
                  onClick={onRefreshResults}
                  type="button"
                >
                  <span className="material-symbols-outlined group-hover:rotate-180 transition-transform">
                    refresh
                  </span>
                  {renderActionLabel(pendingAction, 'load-results', 'Refresh results', 'Loading…')}
                </button>
                <button
                  className="w-full bg-transparent text-error py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-error-container/10 transition-colors disabled:opacity-50"
                  disabled={busy}
                  onClick={onLeave}
                  type="button"
                >
                  <span className="material-symbols-outlined">exit_to_app</span>
                  Leave session
                </button>
              </div>

              {myVoteForWinner != null ? (
                <div className="bg-surface-container-low rounded-xl p-4 border-l-4 border-secondary">
                  <span className="text-[10px] font-black uppercase text-secondary tracking-widest block mb-1">
                    Private note
                  </span>
                  <p className="text-sm font-body text-on-surface-variant italic">
                    You rated &ldquo;{top.name}&rdquo; {myVoteForWinner}/10.
                    {myVoteForWinner >= 8
                      ? " You're getting a pick you really wanted."
                      : ' Every vote helped shape the group score.'}
                  </p>
                </div>
              ) : null}
            </aside>
          </div>
        </>
    </div>
  )
}
