import { useMemo, type FormEvent, type RefObject } from 'react'
import type { FoodOption, PlaceSuggestion, SessionResponse } from '../api'
import { normalizeGooglePlaceId } from '../placeId'
import { PlaceOptionMeta } from '../PlaceOptionMeta'

function formatReviewCount(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  }
  return String(n)
}

type PendingAction =
  | 'add-option'
  | 'remove-option'
  | 'mark-selection-done'
  | null

function renderActionLabel(
  pendingAction: PendingAction | string | null,
  expected: PendingAction,
  idle: string,
  busy: string,
) {
  return pendingAction === expected ? busy : idle
}

export interface ChoosePhaseProps {
  session: SessionResponse
  participantId: string
  optionInput: string
  setOptionInput: (v: string) => void
  suggestions: PlaceSuggestion[]
  showSuggestions: boolean
  setShowSuggestions: (v: boolean) => void
  autocompleteRef: RefObject<HTMLDivElement | null>
  optionListRef: RefObject<HTMLDivElement | null>
  onAddSubmit: (e: FormEvent<HTMLFormElement>) => void
  onRemoveOption: (id: string) => void
  onSuggestionPick: (s: PlaceSuggestion) => void
  onMarkSelectionDone: (done: boolean) => void
  pendingAction: PendingAction | string | null
  busy: boolean
  /** Canonical place IDs already in the session (from server). */
  usedGooglePlaceIds: string[]
}

export function ChoosePhase({
  session,
  participantId,
  optionInput,
  setOptionInput,
  suggestions,
  showSuggestions,
  setShowSuggestions,
  autocompleteRef,
  optionListRef,
  onAddSubmit,
  onRemoveOption,
  onSuggestionPick,
  onMarkSelectionDone,
  pendingAction,
  busy,
  usedGooglePlaceIds,
}: ChoosePhaseProps) {
  const usedPlaceIdSet = useMemo(() => new Set(usedGooglePlaceIds), [usedGooglePlaceIds])

  const participantCount = session.participants.length
  const selectionDone = session.selectionDone ?? {}
  const canShowDoneFlow = (session.status === 'collecting' || (session.status === 'waiting' && participantCount > 1))

  function renderOptionRow(option: FoodOption) {
    const isMine = option.addedBy === participantId
    const canRemove = isMine && (session.status === 'waiting' || session.status === 'collecting')

    return (
      <div
        className="flex items-center justify-between p-4 bg-surface-container-low rounded-lg group"
        key={option.id}
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span className="material-symbols-outlined text-secondary shrink-0">fastfood</span>
          <div className="min-w-0">
            <span className="font-semibold text-sm block">{option.name}</span>
            <PlaceOptionMeta option={option} />
          </div>
        </div>
        {canRemove ? (
          <button
            className="p-1 text-outline hover:text-error transition-colors shrink-0"
            disabled={busy}
            onClick={() => onRemoveOption(option.id)}
            type="button"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="grow p-4 md:p-8 lg:p-12 max-w-5xl mx-auto w-full pb-32 md:pb-12">
      <section className="mb-12">
        <header className="mb-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-on-surface mb-2 font-headline">
            What are you craving?
          </h1>
          <p className="text-secondary max-w-lg">
            Add your favorite spots to the pool. We&apos;ll vote on them in the next phase.
          </p>
        </header>

        {session.status === 'waiting' ? (
          <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {session.participants.map((entry) => (
              <div
                className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-4 py-3"
                key={entry.id}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-secondary-dim">Joined</p>
                <p className="font-headline font-bold text-on-surface">{entry.id === participantId ? 'You' : entry.label}</p>
              </div>
            ))}
            {session.participants.length < session.maxParticipants ? (
              <div className="rounded-xl border border-dashed border-primary-container/40 bg-primary-container/5 px-4 py-3 flex flex-col justify-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Open spot</p>
                <p className="font-headline font-bold text-on-surface">
                  {session.maxParticipants - session.participants.length === 1
                    ? '1 spot left'
                    : `${session.maxParticipants - session.participants.length} spots left`}
                </p>
                <p className="text-xs text-on-surface-variant mt-1">Share code {session.joinCode}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl p-6 shadow-xs relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary-container rounded-l-xl" />
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 font-headline">
              <span className="material-symbols-outlined text-primary">add_circle</span>
              Add Your Ideas
            </h3>
            <form className="relative mb-6" onSubmit={onAddSubmit}>
              <div className="flex gap-2">
                <div className="relative grow" ref={autocompleteRef}>
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline pointer-events-none">
                    search
                  </span>
                  <input
                    className="w-full pl-10 pr-4 py-3 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary-container transition-all text-on-surface"
                    onChange={(e) => setOptionInput(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setShowSuggestions(false)
                    }}
                    placeholder="Search for a restaurant..."
                    value={optionInput}
                  />
                  {showSuggestions && suggestions.length > 0 ? (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 bg-surface-container-low rounded-xl overflow-hidden border border-outline-variant/10 shadow-lg">
                      <div className="px-4 py-2 border-b border-outline-variant/10">
                        <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">
                          Suggested nearby
                        </span>
                      </div>
                      <div className="divide-y divide-outline-variant/10 max-h-64 overflow-y-auto no-scrollbar">
                        {suggestions.map((s, index) => {
                          const placeKey = normalizeGooglePlaceId(s.placeId)
                          const alreadyInPool =
                            placeKey != null && usedPlaceIdSet.has(placeKey)
                          return (
                          <button
                            className={`w-full text-left p-3 flex items-center justify-between transition-colors group ${
                              alreadyInPool
                                ? 'cursor-not-allowed bg-surface-container/60 opacity-80'
                                : 'hover:bg-surface-container cursor-pointer disabled:opacity-50'
                            }`}
                            disabled={busy || alreadyInPool}
                            key={s.placeId ? s.placeId : `q-${s.name}-${index}`}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              if (!busy && !alreadyInPool) onSuggestionPick(s)
                            }}
                            type="button"
                          >
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <p className="font-bold text-sm truncate">{s.name}</p>
                                  {alreadyInPool ? (
                                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-secondary bg-secondary-container/50 px-1.5 py-0.5 rounded-sm">
                                      In pool
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                  {s.rating != null ? (
                                    <span className="inline-flex items-center gap-0.5 text-[11px] text-on-surface font-semibold shrink-0">
                                      <span
                                        className="material-symbols-outlined text-[12px] text-amber-500"
                                        style={{ fontVariationSettings: "'FILL' 1" }}
                                      >
                                        star
                                      </span>
                                      {s.rating.toFixed(1)}
                                      {s.userRatingCount != null ? (
                                        <span className="text-on-surface-variant font-normal">
                                          ({formatReviewCount(s.userRatingCount)})
                                        </span>
                                      ) : null}
                                    </span>
                                  ) : null}
                                  <span className="text-[11px] text-secondary truncate">
                                    {s.foodType.replace(/_/g, ' ')}
                                    {s.address ? ` · ${s.address}` : ''}
                                  </span>
                                </div>
                            </div>
                            {alreadyInPool ? (
                              <span className="material-symbols-outlined text-secondary shrink-0 text-lg">
                                block
                              </span>
                            ) : (
                              <span className="material-symbols-outlined text-primary-container opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                add_circle
                              </span>
                            )}
                          </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
                <button
                  className="bg-linear-to-br from-primary to-primary-container text-white px-6 py-3 rounded-lg font-bold hover:scale-105 transition-transform disabled:opacity-50 shrink-0"
                  disabled={busy || optionInput.trim().length < 2}
                  type="submit"
                >
                  {renderActionLabel(pendingAction, 'add-option', 'Add', 'Adding…')}
                </button>
              </div>
            </form>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="bg-surface-container-lowest rounded-xl p-6 shadow-xs grow border-t-4 border-secondary">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold flex items-center gap-2 font-headline">
                  <span className="material-symbols-outlined text-secondary">visibility_off</span>
                  My Private List
                </h3>
                <span className="bg-secondary-container text-on-secondary-container text-[10px] font-bold px-2 py-1 rounded-sm">
                  {session.options.length} {session.options.length === 1 ? 'ITEM' : 'ITEMS'}
                </span>
              </div>
              <div className="space-y-3" ref={optionListRef}>
                {session.options.length === 0 ? (
                  <p className="text-sm text-on-surface-variant italic">No options yet. Add at least one place.</p>
                ) : (
                  session.options.map((option) => renderOptionRow(option))
                )}
              </div>
              <div className="mt-6 flex items-start gap-3 p-3 bg-secondary-container/30 rounded-lg">
                <span className="material-symbols-outlined text-secondary text-lg shrink-0">info</span>
                <p className="text-[11px] leading-relaxed text-on-secondary-container font-medium">
                  Only you can see these until everyone&apos;s done. Your choices are private for now.
                </p>
              </div>
            </div>

            {canShowDoneFlow ? (
              <button
                className="w-full py-4 bg-linear-to-r from-primary to-primary-container text-white rounded-xl font-extrabold text-lg shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed disabled:shadow-none"
                disabled={
                  busy || session.options.length === 0 || selectionDone[participantId]
                }
                onClick={() => onMarkSelectionDone(true)}
                type="button"
              >
                {renderActionLabel(pendingAction, 'mark-selection-done', "I'm done", 'Saving…')}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mt-12 relative h-48 rounded-2xl overflow-hidden bg-surface-container-highest">
        <img
          alt=""
          className="w-full h-full object-cover mix-blend-overlay opacity-40"
          src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&q=80"
        />
        <div className="absolute inset-0 bg-linear-to-t from-surface-container-highest to-transparent" />
        <div className="absolute bottom-6 left-6">
          <h4 className="text-xl font-bold text-on-surface font-headline">Curating the perfect bite</h4>
          <p className="text-sm text-secondary">
            {participantCount} {participantCount === 1 ? 'person is' : 'people are'} in this room.
          </p>
        </div>
      </div>

      <div className="md:hidden fixed bottom-24 right-6 z-40">
        <button
          className="w-14 h-14 bg-secondary text-white rounded-full shadow-xl flex items-center justify-center relative"
          type="button"
        >
          <span className="material-symbols-outlined">group</span>
          <span className="absolute -top-1 -right-1 bg-primary text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full">
            {participantCount}
          </span>
        </button>
      </div>
    </div>
  )
}
