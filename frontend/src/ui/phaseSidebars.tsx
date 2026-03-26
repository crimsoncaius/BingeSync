import type { SessionResponse } from '../api'
import { participantFinishedRating } from '../sessionHelpers'

export function ChoosePhaseSidebar({
  session,
  participantId,
}: {
  session: SessionResponse
  participantId: string
}) {
  const selectionDone = session.selectionDone ?? {}

  return (
    <>
      <h3 className="text-xs font-bold uppercase tracking-wider text-secondary-dim mb-4 px-4">Who&apos;s In</h3>
      <div className="space-y-3 px-4">
        {session.participants.map((entry) => {
          const done = selectionDone[entry.id]
          const isYou = entry.id === participantId
          return (
            <div className="flex items-center justify-between" key={entry.id}>
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${done ? 'bg-tertiary' : 'bg-primary-container'}`} />
                <span className="text-sm font-medium truncate">{isYou ? 'You' : entry.label}</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                  done
                    ? 'text-tertiary bg-tertiary-container'
                    : 'text-primary bg-on-primary'
                }`}
              >
                {done ? 'DONE' : 'ADDING'}
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}

export function RatePhaseSidebar({
  session,
  participantId,
}: {
  session: SessionResponse
  participantId: string
}) {
  return (
    <>
      <h3 className="text-xs font-bold uppercase tracking-wider text-secondary-dim mb-4 px-4">Group Progress</h3>
      <div className="space-y-3 px-4">
        {session.participants.map((entry) => {
          const done = participantFinishedRating(session, entry.id)
          const isYou = entry.id === participantId
          return (
            <div className="flex items-center justify-between" key={entry.id}>
              <span className="text-sm font-medium truncate">{isYou ? 'You' : entry.label}</span>
              {done ? (
                <span className="material-symbols-outlined text-tertiary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                  check_circle
                </span>
              ) : (
                <span className="text-[10px] font-bold text-outline uppercase">Rating…</span>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
