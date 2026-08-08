import type { ReactNode } from "react";
import type { FlowStepKey } from "../sessionHelpers";
import { ThemeToggle } from "../theme";

export interface RoomChromeProps {
  joinCode: string;
  participantCount: number;
  /** Shown in the room sidebar / header when the host set an occasion title. */
  roomTitle?: string | null;
  /** Subline when the host set a map search bias (e.g. city). */
  searchAreaHint?: string | null;
  participantLabel: string;
  activePhase: FlowStepKey;
  onRefresh: () => void;
  onLeave: () => void;
  onCopyCode: () => void;
  copiedJoinCode: boolean;
  busy: boolean;
  error: string | null;
  children: ReactNode;
  /** Extra sidebar content (e.g. group progress) */
  sidebarFooter?: ReactNode;
}

function NavIcon({ name, filled }: { name: string; filled?: boolean }) {
  return (
    <span
      className="material-symbols-outlined"
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
    >
      {name}
    </span>
  );
}

function Avatar({ label }: { label: string }) {
  const initials = (label || "?").slice(0, 2).toUpperCase();
  return (
    <div
      className="w-10 h-10 rounded-full border-2 border-primary-container bg-secondary-container text-on-secondary-container flex items-center justify-center text-xs font-bold shadow-xs shrink-0"
      aria-hidden
    >
      {initials}
    </div>
  );
}

export function RoomChrome({
  joinCode,
  participantCount,
  roomTitle,
  searchAreaHint,
  participantLabel,
  activePhase,
  onRefresh,
  onLeave,
  onCopyCode,
  copiedJoinCode,
  busy,
  error,
  children,
  sidebarFooter,
}: RoomChromeProps) {
  const phaseOrder: FlowStepKey[] = ["choose", "rating", "results"];

  function sideNavClass(phase: FlowStepKey) {
    const isActive = activePhase === phase;
    if (isActive) {
      return "bg-primary-container text-white rounded-lg px-4 py-2 flex items-center gap-3 shadow-xs";
    }
    return "text-secondary px-4 py-2 hover:bg-secondary-container rounded-lg transition-all flex items-center gap-3";
  }

  function topLinkClass(phase: FlowStepKey) {
    const isActive = activePhase === phase;
    if (isActive) {
      return "text-primary font-bold border-b-2 border-primary transition-colors";
    }
    return "text-secondary hover:text-primary transition-colors font-medium";
  }

  function bottomNavClass(phase: FlowStepKey) {
    const isActive = activePhase === phase;
    if (isActive) {
      return "flex flex-col items-center justify-center bg-primary-container text-white rounded-xl p-2 scale-90 duration-200 min-w-[4.5rem]";
    }
    return "flex flex-col items-center justify-center text-secondary p-2 hover:bg-surface-container-low transition-all min-w-[4rem]";
  }

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen flex flex-col md:flex-row overflow-x-hidden">
      <aside className="hidden md:flex flex-col h-screen w-64 p-4 bg-surface-container-low shrink-0 sticky top-0">
        <div className="mb-8 px-4">
          <span className="text-lg font-black text-secondary font-headline">
            BingeSync
          </span>
          <div className="mt-4">
            <h2 className="font-headline font-bold text-on-surface">Room</h2>
            {roomTitle ? (
              <p
                className="text-xs font-semibold text-primary mt-0.5 truncate"
                title={roomTitle}
              >
                {roomTitle}
              </p>
            ) : null}
            {searchAreaHint ? (
              <p
                className="text-[10px] text-on-surface-variant mt-0.5 truncate"
                title={searchAreaHint}
              >
                Near {searchAreaHint}
              </p>
            ) : null}
            <p className="text-xs text-secondary-dim font-body mt-0.5">
              Code: {joinCode} ({participantCount}{" "}
              {participantCount === 1 ? "person" : "people"})
            </p>
          </div>
          <button
            className="mt-4 w-full py-2 px-4 bg-secondary text-on-secondary rounded-lg text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
            disabled={busy}
            onClick={onCopyCode}
            type="button"
          >
            {copiedJoinCode ? "Copied!" : "Copy Code"}
          </button>
        </div>
        <nav className="flex flex-col space-y-2" aria-label="Session phases">
          <div className={sideNavClass("choose")}>
            <NavIcon name="ads_click" filled={activePhase === "choose"} />
            <span
              className={`font-label text-sm ${activePhase === "choose" ? "font-bold" : "font-medium"}`}
            >
              Choose
            </span>
          </div>
          <div className={sideNavClass("rating")}>
            <NavIcon name="star" filled={activePhase === "rating"} />
            <span
              className={`font-label text-sm ${activePhase === "rating" ? "font-bold" : "font-medium"}`}
            >
              Rate
            </span>
          </div>
          <div className={sideNavClass("results")}>
            <NavIcon name="emoji_events" filled={activePhase === "results"} />
            <span
              className={`font-label text-sm ${activePhase === "results" ? "font-bold" : "font-medium"}`}
            >
              Results
            </span>
          </div>
        </nav>
        {sidebarFooter ? (
          <div className="mt-auto pt-6 border-t border-outline-variant/10">
            {sidebarFooter}
          </div>
        ) : null}
      </aside>

      <main className="flex-1 flex flex-col min-h-screen pb-24 md:pb-0">
        <header className="flex justify-between items-center w-full px-6 py-4 max-w-full bg-surface sticky top-0 z-40 border-b border-outline-variant/10">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <span className="text-xl font-bold tracking-tight text-primary font-headline shrink-0">
              BingeSync
            </span>
            {roomTitle ? (
              <span
                className="text-xs font-semibold text-primary truncate min-w-0 max-w-[6rem] sm:max-w-[10rem] md:max-w-[14rem]"
                title={roomTitle}
              >
                {roomTitle}
              </span>
            ) : null}
            <div className="hidden md:flex items-center gap-6 ml-4 shrink-0">
              {phaseOrder.map((p) => (
                <span key={p} className={topLinkClass(p)}>
                  {p === "choose"
                    ? "Choose"
                    : p === "rating"
                      ? "Rate"
                      : "Results"}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-0 md:gap-1 shrink-0">
            <ThemeToggle />
            <button
              className="text-secondary hover:text-primary transition-colors p-2 disabled:opacity-50"
              disabled={busy}
              onClick={onRefresh}
              title="Refresh"
              type="button"
            >
              <span className="material-symbols-outlined">refresh</span>
            </button>
            <button
              className="text-secondary hover:text-primary transition-colors p-2 disabled:opacity-50"
              disabled={busy}
              onClick={onLeave}
              title="Leave session"
              type="button"
            >
              <span className="material-symbols-outlined">logout</span>
            </button>
            <Avatar label={participantLabel} />
          </div>
        </header>

        {error ? (
          <div
            className="mx-4 md:mx-8 mt-4 rounded-xl border border-error/30 bg-error-container/15 px-4 py-3 text-sm text-error-dim"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <div className="flex-1 flex flex-col min-h-0">{children}</div>

        <nav
          aria-label="Session phases"
          className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-4 pt-2 bg-surface-container-lowest rounded-t-xl shadow-[0_-4px_20px_rgba(15,24,32,0.08)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)]"
        >
          <div className={bottomNavClass("choose")}>
            <NavIcon name="ads_click" filled={activePhase === "choose"} />
            <span className="text-[11px] font-medium font-body mt-1">
              Choose
            </span>
          </div>
          <div className={bottomNavClass("rating")}>
            <NavIcon name="star" filled={activePhase === "rating"} />
            <span className="text-[11px] font-medium font-body mt-1">Rate</span>
          </div>
          <div className={bottomNavClass("results")}>
            <NavIcon name="emoji_events" filled={activePhase === "results"} />
            <span className="text-[11px] font-medium font-body mt-1">
              Results
            </span>
          </div>
        </nav>
      </main>
    </div>
  );
}
