import type { SessionResponse } from './api'

export type FlowStepKey = 'choose' | 'rating' | 'results'

export function participantFinishedRating(session: SessionResponse, pid: string) {
  if (session.options.length === 0) {
    return false
  }

  const row = session.ratings[pid] ?? {}

  return session.options.every((option) => {
    const score = row[option.id]
    return Number.isInteger(score) && score >= 1 && score <= 10
  })
}

/** True when local slider values match what the server last saved for this participant. */
export function ratingsMatchServer(
  session: SessionResponse,
  pid: string,
  ratings: Record<string, number>,
) {
  const row = session.ratings[pid] ?? {}
  return session.options.every((option) => {
    const saved = row[option.id]
    const local = ratings[option.id]
    return (
      Number.isInteger(saved) &&
      saved >= 1 &&
      saved <= 10 &&
      local === saved
    )
  })
}

export function flowPhaseFromStatus(status: SessionResponse['status']): FlowStepKey {
  if (status === 'waiting' || status === 'collecting') {
    return 'choose'
  }
  if (status === 'rating') {
    return 'rating'
  }
  return 'results'
}
