export function LoadingScreen() {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6">
      <div
        className="h-14 w-14 rounded-full border-4 border-primary-container/30 border-t-primary animate-spin"
        aria-hidden
      />
      <p className="mt-8 font-headline font-bold text-on-surface text-lg">Loading your session</p>
      <p className="mt-2 text-on-surface-variant text-center max-w-sm">
        Pulling your last room back into view.
      </p>
      <p className="sr-only" aria-live="polite">
        Loading
      </p>
    </div>
  )
}
