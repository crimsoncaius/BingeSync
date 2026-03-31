import {
  useRef,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { PlaceSuggestion, SessionSearchBias } from "../api";
import { ThemeToggle } from "../theme";

const JOIN_CODE_LEN = 6;

type PendingAction =
  | "restore"
  | "create"
  | "join"
  | "refresh"
  | "add-option"
  | "remove-option"
  | "mark-selection-done"
  | "submit-ratings"
  | "load-results"
  | null;

const HOST_MIN = 2;
const HOST_MAX = 10;

function renderActionLabel(
  pendingAction: PendingAction,
  expectedAction: Exclude<PendingAction, "restore" | null>,
  idleLabel: string,
  busyLabel: string,
) {
  return pendingAction === expectedAction ? busyLabel : idleLabel;
}

export interface LandingPageProps {
  userNameInput: string;
  setUserNameInput: (v: string) => void;
  joinCodeInput: string;
  setJoinCodeInput: (v: string) => void;
  hostMaxParticipants: number;
  setHostMaxParticipants: (n: number) => void;
  hostRoomTitle: string;
  setHostRoomTitle: (v: string) => void;
  hostMaxPicksPerParticipant: number | null;
  setHostMaxPicksPerParticipant: (v: number | null) => void;
  hostAreaInput: string;
  setHostAreaInput: (v: string) => void;
  hostAreaSuggestions: PlaceSuggestion[];
  hostAreaShowSuggestions: boolean;
  setHostAreaShowSuggestions: (v: boolean) => void;
  hostAreaRef: RefObject<HTMLDivElement | null>;
  hostSearchBias: SessionSearchBias | null;
  onClearHostSearchBias: () => void;
  onInvalidateHostSearchBias: () => void;
  onHostAreaSuggestionPick: (s: PlaceSuggestion) => void;
  onCreate: () => void;
  onJoinSubmit: (e: FormEvent<HTMLFormElement>) => void;
  pendingAction: PendingAction;
  busy: boolean;
}

export function LandingPage({
  userNameInput,
  setUserNameInput,
  joinCodeInput,
  setJoinCodeInput,
  hostMaxParticipants,
  setHostMaxParticipants,
  hostRoomTitle,
  setHostRoomTitle,
  hostMaxPicksPerParticipant,
  setHostMaxPicksPerParticipant,
  hostAreaInput,
  setHostAreaInput,
  hostAreaSuggestions,
  hostAreaShowSuggestions,
  setHostAreaShowSuggestions,
  hostAreaRef,
  hostSearchBias,
  onClearHostSearchBias,
  onInvalidateHostSearchBias,
  onHostAreaSuggestionPick,
  onCreate,
  onJoinSubmit,
  pendingAction,
  busy,
}: LandingPageProps) {
  const year = new Date().getFullYear();
  const joinCodeRefs = useRef<(HTMLInputElement | null)[]>([]);

  function bumpHost(delta: number) {
    setHostMaxParticipants(
      Math.min(HOST_MAX, Math.max(HOST_MIN, hostMaxParticipants + delta)),
    );
  }

  function joinCharAt(index: number): string {
    return joinCodeInput[index] ?? "";
  }

  function setJoinCodeFromSlots(next: string) {
    setJoinCodeInput(
      next
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, JOIN_CODE_LEN),
    );
  }

  function handleJoinSlotChange(index: number, raw: string) {
    const last = raw
      .slice(-1)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const prefix = joinCodeInput.slice(0, index);
    const suffix = joinCodeInput.slice(index + 1);
    if (last) {
      setJoinCodeFromSlots(prefix + last + suffix);
      if (index < JOIN_CODE_LEN - 1) {
        joinCodeRefs.current[index + 1]?.focus();
      }
      return;
    }
    setJoinCodeFromSlots(prefix + suffix);
  }

  function handleJoinSlotKeyDown(
    index: number,
    e: KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === "Backspace" && joinCharAt(index) === "") {
      e.preventDefault();
      if (index > 0) {
        const next =
          joinCodeInput.slice(0, index - 1) + joinCodeInput.slice(index);
        setJoinCodeFromSlots(next);
        joinCodeRefs.current[index - 1]?.focus();
      }
      return;
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      joinCodeRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < JOIN_CODE_LEN - 1) {
      e.preventDefault();
      joinCodeRefs.current[index + 1]?.focus();
    }
  }

  function handleJoinCodePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData
      .getData("text")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, JOIN_CODE_LEN);
    setJoinCodeFromSlots(text);
    const focusIndex = Math.min(text.length, JOIN_CODE_LEN - 1);
    joinCodeRefs.current[focusIndex]?.focus();
  }

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col selection:bg-primary-container selection:text-on-primary-container">
      <nav className="bg-surface flex justify-between items-center w-full px-6 py-4 max-w-full sticky top-0 z-50 border-b border-outline-variant/10">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-primary font-headline">
            BingeSync
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <span className="text-primary font-bold border-b-2 border-primary">
            Home
          </span>
          <span className="text-secondary hover:text-primary transition-colors cursor-default">
            How it Works
          </span>
          <span className="text-secondary hover:text-primary transition-colors cursor-default">
            About
          </span>
        </div>
        <div className="flex items-center gap-0 md:gap-1">
          <ThemeToggle />
          <button
            className="text-secondary scale-95 duration-150 p-2 rounded-lg hover:bg-surface-container-low transition-colors"
            disabled={busy}
            onClick={() => window.location.reload()}
            title="Reload"
            type="button"
          >
            <span className="material-symbols-outlined">refresh</span>
          </button>
        </div>
      </nav>

      <main className="grow container mx-auto px-4 py-12 md:py-24 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-5 space-y-8 lg:sticky lg:top-32">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-secondary-container rounded-full text-secondary text-sm font-semibold">
              <span className="material-symbols-outlined text-sm">
                restaurant
              </span>
              <span>No more food fighting</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-on-surface leading-[1.1] font-headline">
              Decide What to Eat{" "}
              <span className="text-primary">Without the Argument.</span>
            </h1>
            <p className="text-lg md:text-xl text-on-surface-variant max-w-lg leading-relaxed">
              Fast, private picking, anonymous rating, and one clear winner.
              Sync your appetites effortlessly with BingeSync.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 pt-4">
              <div className="flex flex-col items-start gap-1">
                <span className="material-symbols-outlined text-tertiary">
                  speed
                </span>
                <span className="text-sm font-bold text-on-surface">
                  Ultra Fast
                </span>
                <span className="text-xs text-on-surface-variant">
                  Setup in seconds
                </span>
              </div>
              <div className="flex flex-col items-start gap-1">
                <span className="material-symbols-outlined text-tertiary">
                  lock
                </span>
                <span className="text-sm font-bold text-on-surface">
                  Private
                </span>
                <span className="text-xs text-on-surface-variant">
                  Anonymous rating
                </span>
              </div>
              <div className="flex flex-col items-start gap-1">
                <span className="material-symbols-outlined text-tertiary">
                  trophy
                </span>
                <span className="text-sm font-bold text-on-surface">
                  Winner Found
                </span>
                <span className="text-xs text-on-surface-variant">
                  Algorithmic sync
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
            <div className="bg-surface-container-lowest p-8 rounded-xl shadow-card relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-primary-container/10 rounded-full group-hover:scale-110 transition-transform duration-500" />
              <div className="relative z-10 space-y-6">
                <div className="w-12 h-12 bg-primary-container flex items-center justify-center rounded-lg text-white">
                  <span className="material-symbols-outlined">add_box</span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold font-headline mb-2">
                    Create a Room
                  </h3>
                  <p className="text-on-surface-variant text-sm">
                    Host a session and invite your group to sync up.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-secondary uppercase tracking-widest">
                      Your Name
                    </label>
                    <input
                      className="w-full bg-surface-container-low border-0 px-4 py-3 rounded-lg focus:ring-2 focus:ring-primary-container text-sm font-medium"
                      disabled={busy}
                      maxLength={40}
                      onChange={(e) => setUserNameInput(e.target.value)}
                      placeholder="Alex"
                      type="text"
                      value={userNameInput}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-secondary uppercase tracking-widest">
                      Room Title
                    </label>
                    <input
                      className="w-full bg-surface-container-low border-0 px-4 py-3 rounded-lg focus:ring-2 focus:ring-primary-container text-sm font-medium"
                      disabled={busy}
                      maxLength={80}
                      onChange={(e) => setHostRoomTitle(e.target.value)}
                      placeholder="e.g., Friday Pizza Night"
                      type="text"
                      value={hostRoomTitle}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-secondary uppercase tracking-widest">
                      Search near{" "}
                      <span className="font-normal opacity-70">(optional)</span>
                    </label>
                    <div className="relative" ref={hostAreaRef}>
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline pointer-events-none text-lg">
                        location_on
                      </span>
                      <input
                        className={`w-full pl-10 py-3 bg-surface-container-low border-0 rounded-lg focus:ring-2 focus:ring-primary-container text-sm font-medium ${
                          hostSearchBias ? "pr-16" : "pr-4"
                        }`}
                        disabled={busy}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v.trim()) {
                            onClearHostSearchBias();
                            return;
                          }
                          if (hostSearchBias) {
                            onInvalidateHostSearchBias();
                          }
                          setHostAreaInput(v);
                        }}
                        onFocus={() =>
                          hostAreaSuggestions.length > 0 &&
                          setHostAreaShowSuggestions(true)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Escape")
                            setHostAreaShowSuggestions(false);
                        }}
                        placeholder="Place or area in Singapore"
                        type="text"
                        value={hostAreaInput}
                      />
                      {hostSearchBias ? (
                        <button
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-secondary hover:text-primary px-2 py-1 rounded-md hover:bg-surface-container-high/80"
                          disabled={busy}
                          onClick={() => onClearHostSearchBias()}
                          type="button"
                        >
                          Clear
                        </button>
                      ) : null}
                      {hostAreaShowSuggestions &&
                      hostAreaSuggestions.length > 0 ? (
                        <div className="absolute left-0 right-0 top-full z-50 mt-1 bg-surface-container-low rounded-xl overflow-hidden border border-outline-variant/10 shadow-lg">
                          <div className="px-4 py-2 border-b border-outline-variant/10">
                            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">
                              Areas
                            </span>
                          </div>
                          <div className="divide-y divide-outline-variant/10 max-h-56 overflow-y-auto no-scrollbar">
                            {hostAreaSuggestions.map((s, index) => (
                              <button
                                className="w-full text-left p-3 flex items-center justify-between transition-colors group hover:bg-surface-container cursor-pointer disabled:opacity-50"
                                disabled={busy || !s.placeId}
                                key={
                                  s.placeId
                                    ? s.placeId
                                    : `area-${s.name}-${index}`
                                }
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  if (!busy && s.placeId)
                                    onHostAreaSuggestionPick(s);
                                }}
                                type="button"
                              >
                                <div className="min-w-0">
                                  <p className="font-bold text-sm truncate">
                                    {s.name}
                                  </p>
                                  <p className="text-[11px] text-secondary truncate mt-0.5">
                                    {s.foodType.replace(/_/g, " ")}
                                    {s.address ? ` · ${s.address}` : ""}
                                  </p>
                                </div>
                                <span className="material-symbols-outlined text-primary-container opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  check_circle
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-snug">
                      Restaurant suggestions while picking will favor this area.
                      Leave blank for the default region.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-secondary uppercase tracking-widest">
                      Max Picks per person
                    </span>
                    <div className="grid grid-cols-3 gap-2 bg-surface-container-low p-1 rounded-lg">
                      {([3, 5, 10] as const).map((n) => {
                        const active = hostMaxPicksPerParticipant === n;
                        return (
                          <button
                            key={n}
                            className={[
                              "py-2 text-xs font-bold rounded-md transition-colors",
                              active
                                ? "bg-surface-container-high shadow-xs text-primary"
                                : "text-on-surface-variant hover:bg-surface-container-high/70",
                            ].join(" ")}
                            disabled={busy}
                            onClick={() => setHostMaxPicksPerParticipant(n)}
                            type="button"
                          >
                            {n}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      className={[
                        "text-xs font-semibold w-full text-left",
                        hostMaxPicksPerParticipant === null
                          ? "text-primary"
                          : "text-on-surface-variant hover:text-primary",
                      ].join(" ")}
                      disabled={busy}
                      onClick={() => setHostMaxPicksPerParticipant(null)}
                      type="button"
                    >
                      No limit
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-secondary uppercase tracking-widest">
                      Group Capacity
                    </span>
                    <div className="flex items-center justify-between bg-surface-container-low p-3 rounded-lg">
                      <button
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-highest transition-colors disabled:opacity-50"
                        disabled={busy || hostMaxParticipants <= HOST_MIN}
                        onClick={() => bumpHost(-1)}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-secondary">
                          remove
                        </span>
                      </button>
                      <span className="text-lg font-bold">
                        {hostMaxParticipants}{" "}
                        {hostMaxParticipants === 1 ? "Person" : "People"}
                      </span>
                      <button
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-highest transition-colors disabled:opacity-50"
                        disabled={busy || hostMaxParticipants >= HOST_MAX}
                        onClick={() => bumpHost(1)}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-secondary">
                          add
                        </span>
                      </button>
                    </div>
                  </div>
                  <button
                    className="w-full btn-gradient text-white font-bold py-4 rounded-lg shadow-lg hover:brightness-110 transition-all flex items-center justify-center gap-2 group disabled:opacity-60"
                    disabled={busy}
                    onClick={onCreate}
                    type="button"
                  >
                    {renderActionLabel(
                      pendingAction,
                      "create",
                      "Start Room",
                      "Starting…",
                    )}
                    <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">
                      arrow_forward
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <form
              className="bg-surface-container-lowest p-8 rounded-xl shadow-card relative mt-0 sm:mt-12 border-t-4 border-secondary"
              onSubmit={onJoinSubmit}
            >
              <div className="space-y-6">
                <div className="w-12 h-12 bg-secondary flex items-center justify-center rounded-lg text-on-secondary">
                  <span className="material-symbols-outlined">group_add</span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold font-headline mb-2">
                    Join a Room
                  </h3>
                  <p className="text-on-surface-variant text-sm">
                    Enter the code shared by your friend.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-secondary uppercase tracking-widest">
                      Your Name
                    </label>
                    <input
                      className="w-full bg-surface-container-low border-0 px-4 py-3 rounded-lg focus:ring-2 focus:ring-secondary text-sm font-medium"
                      disabled={busy}
                      maxLength={40}
                      onChange={(e) => setUserNameInput(e.target.value)}
                      placeholder="Alex"
                      type="text"
                      value={userNameInput}
                    />
                  </div>
                  <label className="block">
                    <span className="text-xs font-bold text-secondary uppercase tracking-widest">
                      Access Code
                    </span>
                    <div className="mt-2 flex gap-2">
                      {Array.from({ length: JOIN_CODE_LEN }, (_, i) => (
                        <input
                          key={i}
                          ref={(el) => {
                            joinCodeRefs.current[i] = el;
                          }}
                          aria-label={`Code character ${i + 1} of ${JOIN_CODE_LEN}`}
                          className="w-full bg-surface-container-low border-0 text-center font-bold text-xl h-12 rounded-lg focus:ring-2 focus:ring-secondary uppercase min-w-0"
                          disabled={busy}
                          inputMode="text"
                          maxLength={1}
                          onChange={(e) =>
                            handleJoinSlotChange(i, e.target.value)
                          }
                          onKeyDown={(e) => handleJoinSlotKeyDown(i, e)}
                          onPaste={handleJoinCodePaste}
                          value={joinCharAt(i)}
                        />
                      ))}
                    </div>
                  </label>
                  <button
                    className="w-full bg-secondary text-on-secondary font-bold py-4 rounded-lg shadow-lg hover:bg-secondary-dim transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                    disabled={busy || joinCodeInput.length < JOIN_CODE_LEN}
                    type="submit"
                  >
                    {renderActionLabel(
                      pendingAction,
                      "join",
                      "Join Now",
                      "Joining…",
                    )}
                  </button>
                </div>
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
            <div className="flex items-center gap-4 bg-surface-container-lowest px-6 py-3 rounded-full shadow-xs max-w-full">
              <span
                className="material-symbols-outlined text-primary shrink-0"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                history
              </span>
              <p className="text-sm text-on-surface-variant font-medium">
                Session Restoration:{" "}
                <span className="text-on-surface font-bold">Active.</span>{" "}
                We&apos;ll remember where you left off.
              </p>
            </div>
            <div className="flex gap-8 md:gap-12 text-sm font-bold text-secondary flex-wrap justify-center">
              <span className="hover:text-primary cursor-default">
                Privacy Policy
              </span>
              <span className="hover:text-primary cursor-default">
                Terms of Service
              </span>
              <span className="hover:text-primary cursor-default">Contact</span>
            </div>
          </div>
          <div className="mt-12 text-center text-on-surface-variant text-xs opacity-50">
            © {year} BingeSync. All rights reserved. Crafted for indecisive
            eaters everywhere.
          </div>
        </div>
      </footer>

      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary-container/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[10%] right-[5%] w-[30%] h-[30%] bg-secondary-container/10 rounded-full blur-[100px]" />
      </div>

      <nav
        aria-hidden
        className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-4 pt-2 bg-surface-container-lowest rounded-t-xl shadow-[0_-4px_20px_rgba(15,24,32,0.08)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)]"
      >
        <div className="flex flex-col items-center justify-center bg-primary-container text-white rounded-xl p-2 active:scale-90 duration-200">
          <span className="material-symbols-outlined">ads_click</span>
          <span className="text-[11px] font-medium font-body mt-1">Choose</span>
        </div>
        <div className="flex flex-col items-center justify-center text-secondary p-2 hover:bg-surface-container-low">
          <span className="material-symbols-outlined">star</span>
          <span className="text-[11px] font-medium font-body mt-1">Rate</span>
        </div>
        <div className="flex flex-col items-center justify-center text-secondary p-2 hover:bg-surface-container-low">
          <span className="material-symbols-outlined">emoji_events</span>
          <span className="text-[11px] font-medium font-body mt-1">
            Results
          </span>
        </div>
      </nav>
    </div>
  );
}
