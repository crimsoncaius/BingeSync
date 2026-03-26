import type { FormEvent } from 'react'

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

const HOST_MIN = 2
const HOST_MAX = 10

function renderActionLabel(
  pendingAction: PendingAction,
  expectedAction: Exclude<PendingAction, 'restore' | null>,
  idleLabel: string,
  busyLabel: string,
) {
  return pendingAction === expectedAction ? busyLabel : idleLabel
}

export interface LandingPageProps {
  userNameInput: string
  setUserNameInput: (v: string) => void
  joinCodeInput: string
  setJoinCodeInput: (v: string) => void
  hostMaxParticipants: number
  setHostMaxParticipants: (n: number) => void
  onCreate: () => void
  onJoinSubmit: (e: FormEvent<HTMLFormElement>) => void
  pendingAction: PendingAction
  busy: boolean
}

export function LandingPage({
  userNameInput,
  setUserNameInput,
  joinCodeInput,
  setJoinCodeInput,
  hostMaxParticipants,
  setHostMaxParticipants,
  onCreate,
  onJoinSubmit,
  pendingAction,
  busy,
}: LandingPageProps) {
  const year = new Date().getFullYear()

  function bumpHost(delta: number) {
    setHostMaxParticipants(Math.min(HOST_MAX, Math.max(HOST_MIN, hostMaxParticipants + delta)))
  }

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col selection:bg-primary-container selection:text-on-primary-container">
      <nav className="bg-[#f1f7fd] dark:bg-slate-900 flex justify-between items-center w-full px-6 py-4 max-w-full sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-[#b22200] dark:text-[#ff785a] font-headline">
            BingeSync
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <span className="text-[#b22200] font-bold border-b-2 border-[#b22200]">Home</span>
          <span className="text-[#515c73] dark:text-slate-400">How it Works</span>
          <span className="text-[#515c73] dark:text-slate-400">About</span>
        </div>
        <div className="w-16 md:w-0" aria-hidden />
      </nav>

      <main className="flex-grow container mx-auto px-4 py-12 md:py-24 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6 space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-secondary-container rounded-full text-secondary text-sm font-semibold">
              <span className="material-symbols-outlined text-sm">restaurant</span>
              <span>No more food fighting</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-on-surface leading-[1.1] font-headline">
              Decide What to Eat <span className="text-primary">Without the Argument.</span>
            </h1>
            <p className="text-lg md:text-xl text-on-surface-variant max-w-lg leading-relaxed">
              Fast, private picking, anonymous rating, and one clear winner. Sync your appetites
              effortlessly with BingeSync.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 pt-4">
              <div className="flex flex-col items-start gap-1">
                <span className="material-symbols-outlined text-tertiary">speed</span>
                <span className="text-sm font-bold text-on-surface">Ultra Fast</span>
                <span className="text-xs text-on-surface-variant">Setup in seconds</span>
              </div>
              <div className="flex flex-col items-start gap-1">
                <span className="material-symbols-outlined text-tertiary">lock</span>
                <span className="text-sm font-bold text-on-surface">Private</span>
                <span className="text-xs text-on-surface-variant">Anonymous rating</span>
              </div>
              <div className="flex flex-col items-start gap-1">
                <span className="material-symbols-outlined text-tertiary">trophy</span>
                <span className="text-sm font-bold text-on-surface">Winner Found</span>
                <span className="text-xs text-on-surface-variant">Algorithmic sync</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
            <div className="bg-surface-container-lowest p-8 rounded-xl shadow-[0_12px_32px_rgba(41,48,52,0.06)] relative overflow-hidden group sm:col-span-2 lg:col-span-1">
              <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-primary-container/10 rounded-full group-hover:scale-110 transition-transform duration-500" />
              <div className="relative z-10 space-y-6">
                <div className="w-12 h-12 bg-primary-container flex items-center justify-center rounded-lg text-white">
                  <span className="material-symbols-outlined">add_box</span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold font-headline mb-2">Create a Room</h3>
                  <p className="text-on-surface-variant text-sm">
                    Host a session and invite your group to sync up.
                  </p>
                </div>
                <label className="block">
                  <span className="text-xs font-bold text-secondary uppercase tracking-widest">
                    Your name (optional)
                  </span>
                  <input
                    className="mt-2 w-full bg-surface-container-low border-0 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-primary-container"
                    disabled={busy}
                    maxLength={40}
                    onChange={(e) => setUserNameInput(e.target.value)}
                    placeholder="You"
                    value={userNameInput}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-secondary uppercase tracking-widest">
                    Group capacity
                  </span>
                  <div className="mt-2 flex items-center justify-between bg-surface-container-low p-3 rounded-lg">
                    <button
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-highest transition-colors disabled:opacity-50"
                      disabled={busy || hostMaxParticipants <= HOST_MIN}
                      onClick={() => bumpHost(-1)}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-secondary">remove</span>
                    </button>
                    <span className="text-lg font-bold">
                      {hostMaxParticipants} {hostMaxParticipants === 1 ? 'Person' : 'People'}
                    </span>
                    <button
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-highest transition-colors disabled:opacity-50"
                      disabled={busy || hostMaxParticipants >= HOST_MAX}
                      onClick={() => bumpHost(1)}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-secondary">add</span>
                    </button>
                  </div>
                </label>
                <button
                  className="w-full btn-gradient text-white font-bold py-4 rounded-lg shadow-lg hover:brightness-110 transition-all flex items-center justify-center gap-2 group disabled:opacity-60"
                  disabled={busy}
                  onClick={onCreate}
                  type="button"
                >
                  {renderActionLabel(pendingAction, 'create', 'Start Room', 'Starting…')}
                  <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">
                    arrow_forward
                  </span>
                </button>
              </div>
            </div>

            <form
              className="bg-surface-container-lowest p-8 rounded-xl shadow-[0_12px_32px_rgba(41,48,52,0.06)] relative mt-0 sm:mt-12 border-t-4 border-secondary sm:col-span-2 lg:col-span-1 lg:mt-12"
              onSubmit={onJoinSubmit}
            >
              <div className="space-y-6">
                <div className="w-12 h-12 bg-secondary flex items-center justify-center rounded-lg text-white">
                  <span className="material-symbols-outlined">group_add</span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold font-headline mb-2">Join a Room</h3>
                  <p className="text-on-surface-variant text-sm">Enter the code shared by your friend.</p>
                </div>
                <label className="block">
                  <span className="text-xs font-bold text-secondary uppercase tracking-widest">
                    Your name (optional)
                  </span>
                  <input
                    className="mt-2 w-full bg-surface-container-low border-0 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-secondary"
                    disabled={busy}
                    maxLength={40}
                    onChange={(e) => setUserNameInput(e.target.value)}
                    placeholder="You"
                    value={userNameInput}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-secondary uppercase tracking-widest">
                    Access code
                  </span>
                  <input
                    className="mt-2 w-full bg-surface-container-low border-0 text-center font-bold text-xl h-12 rounded-lg tracking-[0.35em] uppercase focus:ring-2 focus:ring-secondary"
                    disabled={busy}
                    inputMode="text"
                    maxLength={6}
                    minLength={6}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    placeholder="••••••"
                    value={joinCodeInput}
                  />
                </label>
                <button
                  className="w-full bg-secondary text-white font-bold py-4 rounded-lg shadow-lg hover:bg-secondary-dim transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  disabled={busy || joinCodeInput.length < 6}
                  type="submit"
                >
                  {renderActionLabel(pendingAction, 'join', 'Join Now', 'Joining…')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>

      <div className="relative h-24 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-surface-container-low transform -skew-y-2 translate-y-12" />
      </div>

      <footer className="bg-surface-container-low pt-12 pb-24 md:pb-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-4 bg-surface-container-lowest px-6 py-3 rounded-full shadow-sm max-w-full">
              <span className="material-symbols-outlined text-primary shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
                history
              </span>
              <p className="text-sm text-on-surface-variant font-medium">
                Session restoration: <span className="text-on-surface font-bold">Active.</span> We&apos;ll
                remember where you left off.
              </p>
            </div>
            <div className="flex gap-8 md:gap-12 text-sm font-bold text-secondary flex-wrap justify-center">
              <span className="hover:text-primary cursor-default">Privacy Policy</span>
              <span className="hover:text-primary cursor-default">Terms of Service</span>
              <span className="hover:text-primary cursor-default">Contact</span>
            </div>
          </div>
          <div className="mt-12 text-center text-on-surface-variant text-xs opacity-50">
            © {year} BingeSync. All rights reserved. Crafted for indecisive eaters everywhere.
          </div>
        </div>
      </footer>

      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary-container/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[10%] right-[5%] w-[30%] h-[30%] bg-secondary-container/10 rounded-full blur-[100px]" />
      </div>

      <nav
        aria-hidden
        className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-4 pt-2 bg-[#ffffff] dark:bg-slate-950 shadow-[0_-4px_20px_rgba(41,48,52,0.06)] rounded-t-xl"
      >
        <div className="flex flex-col items-center justify-center bg-[#ff785a] text-white rounded-xl p-2 active:scale-90 duration-200">
          <span className="material-symbols-outlined">ads_click</span>
          <span className="text-[11px] font-medium font-body mt-1">Choose</span>
        </div>
        <div className="flex flex-col items-center justify-center text-[#515c73] dark:text-slate-400 p-2 hover:bg-[#f1f7fd]">
          <span className="material-symbols-outlined">star</span>
          <span className="text-[11px] font-medium font-body mt-1">Rate</span>
        </div>
        <div className="flex flex-col items-center justify-center text-[#515c73] dark:text-slate-400 p-2 hover:bg-[#f1f7fd]">
          <span className="material-symbols-outlined">emoji_events</span>
          <span className="text-[11px] font-medium font-body mt-1">Results</span>
        </div>
      </nav>
    </div>
  )
}
