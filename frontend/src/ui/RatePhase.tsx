import type { SessionResponse } from '../api'
import { participantFinishedRating, ratingsMatchServer } from '../sessionHelpers'
import { PlaceOptionMeta } from '../PlaceOptionMeta'
import { foodImageForOption } from './foodImages'

type PendingAction = 'submit-ratings' | null

function renderActionLabel(
  pendingAction: PendingAction | string | null,
  expected: PendingAction,
  idle: string,
  busy: string,
) {
  return pendingAction === expected ? busy : idle
}

export interface RatePhaseProps {
  session: SessionResponse
  participantId: string
  ratings: Record<string, number>
  setRating: (optionId: string, score: number) => void
  onSubmitRatings: () => void
  pendingAction: PendingAction | string | null
  busy: boolean
  hasRatedEverything: boolean
}

export function RatePhase({
  session,
  participantId,
  ratings,
  setRating,
  onSubmitRatings,
  pendingAction,
  busy,
  hasRatedEverything,
}: RatePhaseProps) {
  const ratedCount = session.options.reduce((count, option) => {
    const score = ratings[option.id]
    return Number.isInteger(score) && score >= 0 && score <= 10 ? count + 1 : count
  }, 0)

  const savedOnServer = participantFinishedRating(session, participantId)
  const matchesSaved = ratingsMatchServer(session, participantId, ratings)
  const doneButtonDisabled =
    busy || !hasRatedEverything || (savedOnServer && matchesSaved)

  return (
    <main className="flex-1 md:ml-0 p-6 md:p-12 pb-32 max-w-4xl mx-auto w-full">
      <header className="mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold font-headline text-on-surface tracking-tight mb-4">
          Rate Your Cravings
        </h1>
        <p className="text-lg text-secondary max-w-xl">
          The group has spoken. Now, score each option from 1 to 10 based on how much you want it right
          now.
        </p>
        <p className="mt-3 text-sm text-on-surface-variant">
          {ratedCount}/{session.options.length} rated by you
        </p>
      </header>

      {session.options.length === 0 ? (
        <p className="text-on-surface-variant">No options to rate.</p>
      ) : (
        <div className="grid gap-8">
          {session.options.map((option, index) => {
            const imageUrl = foodImageForOption(option)
            const current = ratings[option.id] ?? 5
            const suggestedBy =
              option.addedBy === participantId
                ? 'You'
                : session.participants.find((p) => p.id === option.addedBy)?.label ?? 'Someone'

            return (
              <section
                className={`bg-surface-container-lowest rounded-xl p-6 shadow-card flex flex-col md:flex-row gap-6 items-center relative overflow-hidden ${
                  index > 0 ? 'border-t-4 border-secondary-container' : ''
                }`}
                key={option.id}
              >
                {index === 0 ? <div className="absolute top-0 left-0 w-1 h-full bg-primary" /> : null}
                <div className="w-full md:w-48 h-32 rounded-lg overflow-hidden shrink-0 bg-surface-container">
                  {imageUrl ? (
                    <img
                      alt=""
                      className="w-full h-full object-cover"
                      src={imageUrl}
                      onError={(e) => {
                        e.currentTarget.onerror = null
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : null}
                </div>
                <div className="flex-1 w-full min-w-0">
                  <div className="flex justify-between items-start mb-2 gap-3">
                    <div className="min-w-0">
                      <h3 className="text-2xl font-bold font-headline">{option.name}</h3>
                      <PlaceOptionMeta option={option} />
                    </div>
                    <span
                      className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        suggestedBy === 'You'
                          ? 'bg-primary-container text-on-primary-container'
                          : 'bg-secondary-container text-on-secondary-container'
                      }`}
                    >
                      {suggestedBy === 'You' ? 'Suggested by You' : `Suggested by ${suggestedBy}`}
                    </span>
                  </div>
                  <div className="mt-6">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-secondary uppercase">Preference Score</span>
                      <span className="text-xl font-black text-primary font-headline">{current}</span>
                    </div>
                    <input
                      className="w-full h-2 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary"
                      max={10}
                      min={0}
                      onChange={(e) => setRating(option.id, Number(e.target.value))}
                      type="range"
                      value={current}
                    />
                    <div className="flex justify-between mt-2 text-[10px] font-bold text-outline uppercase">
                      <span>Nah</span>
                      <span>Must Have</span>
                    </div>
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      )}

      <div className="mt-16 flex flex-col md:flex-row items-center justify-between gap-6 bg-surface-container-high p-8 rounded-2xl">
        <div>
          <h4 className="text-xl font-bold font-headline">Ready to lock in?</h4>
          <p className="text-on-surface-variant">
            You can change these until everyone submits their ratings.
          </p>
        </div>
        <button
          className="w-full md:w-auto px-10 py-4 bg-linear-to-br from-primary to-primary-container text-white rounded-xl font-bold text-lg shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
          disabled={doneButtonDisabled}
          onClick={onSubmitRatings}
          type="button"
        >
          {renderActionLabel(pendingAction, 'submit-ratings', "I'm done", 'Saving…')}
        </button>
      </div>
    </main>
  )
}
