import type { FoodOption, RankedResult, SessionResponse } from "../api";
import { foodImageForOption } from "./foodImages";

type PendingAction = "load-results" | null;

function renderActionLabel(
  pendingAction: PendingAction | string | null,
  expected: PendingAction,
  idle: string,
  busy: string,
) {
  return pendingAction === expected ? busy : idle;
}

/** Ratings are 0–10; largest possible gap between highest and lowest vote. */
const RATING_SPREAD_MAX = 10;

function ratingsForOption(
  session: SessionResponse,
  optionId: string,
): number[] {
  const out: number[] = [];
  for (const p of session.participants) {
    const v = session.ratings[p.id]?.[optionId];
    if (v != null) out.push(v);
  }
  return out;
}

/**
 * Group alignment from how similar everyone's ratings of the top pick(s) are
 * (max − min per option, averaged when tied; normalized). Needs ≥2 people and scores.
 */
function groupAlignmentForLeaders(
  session: SessionResponse,
  leaders: RankedResult[],
): {
  label: string;
  pct: number;
  blurb: string;
} {
  const tie = leaders.length > 1;
  const subject = tie ? "the tied top picks" : "the winner";
  const subjectShort = tie ? "these picks" : "this pick";

  if (session.participants.length < 2) {
    return {
      label: "—",
      pct: 0,
      blurb: `Add another person to the room to see how aligned scores are on ${subject}.`,
    };
  }

  if (leaders.length === 0) {
    return { label: "—", pct: 0, blurb: "" };
  }

  const spreads: number[] = [];
  for (const leader of leaders) {
    const scores = ratingsForOption(session, leader.optionId);
    if (scores.length < 2) {
      return {
        label: "—",
        pct: 0,
        blurb: `Group alignment needs ratings on ${subject} from everyone in the room.`,
      };
    }
    spreads.push(Math.max(...scores) - Math.min(...scores));
  }

  const spread =
    spreads.reduce((sum, s) => sum + s, 0) / Math.max(1, spreads.length);
  const agreement = 1 - spread / RATING_SPREAD_MAX;
  const pct = Math.min(95, Math.max(5, Math.round(agreement * 100)));

  if (spread <= 2) {
    return {
      label: `High (${pct}%)`,
      pct,
      blurb: tie
        ? `Everyone rated ${subjectShort} within a few points on average — strong agreement on the tie.`
        : "Everyone rated the winner within a few points — strong agreement on this pick.",
    };
  }
  if (spread <= 5) {
    return {
      label: `Moderate (${pct}%)`,
      pct,
      blurb: tie
        ? `Ratings varied across the tied places, but the group still landed on the same top score.`
        : "Ratings on the winner varied, but the group still converged on it first overall.",
    };
  }
  return {
    label: `Mixed (${pct}%)`,
    pct,
    blurb: tie
      ? "Opinions were quite split across the tied top picks, even though they share the lead."
      : "Opinions on the winner were quite split, even though it came out on top.",
  };
}

function syncPercentFromAverage(averageScore: number): number {
  return Math.round(Math.min(100, Math.max(0, (averageScore / 10) * 100)));
}

function truncateMeta(s: string | null | undefined, max = 48): string {
  const t = (s ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function metaSubtitle(opt: FoodOption | undefined): string {
  if (!opt) return "On your shortlist";
  const parts: string[] = [];
  if (opt.priceLevel) parts.push(opt.priceLevel);
  const addr = truncateMeta(opt.address, 36);
  if (addr) parts.push(addr);
  return parts.length ? parts.join(" · ") : "On your shortlist";
}

function ParticipantStack({ session }: { session: SessionResponse }) {
  const maxShown = 5;
  const list = session.participants;
  const shown = list.slice(0, maxShown);
  const extra = list.length - shown.length;

  return (
    <div className="flex -space-x-3" aria-label="People in this room">
      {shown.map((p) => {
        const initials = (p.label || "?").slice(0, 2).toUpperCase();
        return (
          <div
            key={p.id}
            className="w-12 h-12 rounded-full border-4 border-surface-container-low bg-secondary-container flex items-center justify-center text-on-secondary-container font-bold text-xs shrink-0"
            title={p.label}
          >
            {initials}
          </div>
        );
      })}
      {extra > 0 ? (
        <div className="w-12 h-12 rounded-full border-4 border-surface-container-low bg-secondary-container flex items-center justify-center text-on-secondary-container font-bold text-xs shrink-0">
          +{extra}
        </div>
      ) : null}
    </div>
  );
}

export interface ResultsPhaseProps {
  session: SessionResponse;
  participantId: string;
  results: RankedResult[];
  resultsLoading: boolean;
  onRefreshResults: () => void;
  pendingAction: PendingAction | string | null;
  busy: boolean;
}

export function ResultsPhase({
  session,
  participantId,
  results,
  resultsLoading,
  onRefreshResults,
  pendingAction,
  busy,
}: ResultsPhaseProps) {
  const totalVotes = session.participants.length;

  if (resultsLoading) {
    return (
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 md:px-12 py-8 pb-28 md:pb-16">
        <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-8 text-center">
          <div className="inline-block h-10 w-10 rounded-full border-2 border-primary-container/30 border-t-primary animate-spin mb-4" />
          <p className="text-on-surface-variant font-body">
            Loading ranked results…
          </p>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 md:px-12 py-8 pb-28 md:pb-16">
        <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-8 text-center text-on-surface-variant font-body">
          No ranked results yet. Try refreshing once everyone has submitted
          ratings.
        </div>
      </div>
    );
  }

  const leaders = results.filter((r) => r.rank === 1);
  const rest = results.filter((r) => r.rank > 1);
  const align = groupAlignmentForLeaders(session, leaders);
  const tieForFirst = leaders.length > 1;
  const sharedTopScore = leaders[0]?.finalScore ?? 0;

  const myVotesOnLeaders = leaders
    .map((l) => ({
      leader: l,
      score: session.ratings[participantId]?.[l.optionId],
    }))
    .filter((x) => x.score != null) as {
    leader: RankedResult;
    score: number;
  }[];

  function optionFor(id: string) {
    return session.options.find((o) => o.id === id);
  }

  const gridCols =
    leaders.length === 1
      ? "grid-cols-1 max-w-2xl mx-auto"
      : "grid-cols-1 md:grid-cols-2";

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full px-4 md:px-12 py-8 pb-28 md:pb-16 space-y-12 font-body">
      <section>
        {tieForFirst ? (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-tertiary-container/50 text-tertiary font-bold text-xs tracking-wider uppercase mb-4">
            <span
              className="material-symbols-outlined text-sm"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              emoji_events
            </span>
            Shared first place
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-container/20 text-primary font-bold text-xs tracking-wider uppercase mb-4">
            <span
              className="material-symbols-outlined text-sm"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              military_tech
            </span>
            Top pick
          </div>
        )}

        <h1 className="text-4xl md:text-5xl font-extrabold font-headline text-on-surface tracking-tight mb-4">
          {tieForFirst
            ? "It's a dead heat!"
            : leaders[0]
              ? leaders[0].name
              : "Results"}
        </h1>
        <p className="text-lg md:text-xl text-on-surface-variant max-w-2xl leading-relaxed">
          {tieForFirst
            ? "These places tied with the same final score — pick whichever you're craving. No extra round needed."
            : "Here's where the group landed. Open maps or the site when you're ready to go."}
        </p>
      </section>

      <section className={`grid ${gridCols} gap-8`}>
        {leaders.map((leader) => {
          const opt = optionFor(leader.optionId);
          const imgSrc = foodImageForOption(opt);
          const syncPct = syncPercentFromAverage(leader.averageScore);
          return (
            <div
              key={leader.optionId}
              className="group relative flex flex-col bg-surface-container-lowest rounded-xl overflow-hidden shadow-card transition-all hover:-translate-y-1"
            >
              <div className="h-64 relative overflow-hidden bg-surface-container">
                {imgSrc ? (
                  <img
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    src={imgSrc}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : null}
                <div className="absolute top-4 left-4 flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-primary text-on-primary rounded-full text-xs font-bold shadow-lg">
                    {syncPct}% sync
                  </span>
                  {opt?.rating != null ? (
                    <span className="px-3 py-1 bg-surface-container-lowest/90 backdrop-blur-md text-secondary rounded-full text-xs font-bold">
                      ★ {opt.rating.toFixed(1)}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="p-6 flex flex-col flex-1">
                <div className="flex justify-between items-start mb-2 gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-secondary tracking-widest uppercase mb-1 truncate">
                      {metaSubtitle(opt)}
                    </p>
                    <h2 className="text-2xl font-extrabold font-headline text-on-surface truncate">
                      {leader.name}
                    </h2>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-primary font-bold text-lg leading-none">
                      #1
                    </span>
                    <span className="text-[10px] text-on-surface-variant uppercase font-medium">
                      Ranked
                    </span>
                  </div>
                </div>
                <p className="text-sm text-on-surface-variant line-clamp-2">
                  {truncateMeta(opt?.address) ||
                    "Add places from search next time for full addresses and links."}
                </p>
                <div className="mt-auto pt-6 flex flex-col gap-3">
                  {opt?.googleMapsUri ? (
                    <a
                      className="w-full primary-gradient text-on-primary py-4 px-6 rounded-xl font-bold text-lg flex items-center justify-center gap-2 group-hover:shadow-lg transition-all"
                      href={opt.googleMapsUri}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Open in Maps
                      <span className="material-symbols-outlined">map</span>
                    </a>
                  ) : (
                    <span className="w-full text-center py-3 px-4 rounded-xl border border-outline-variant/30 text-on-surface-variant text-sm">
                      No Maps link for this entry
                    </span>
                  )}
                  {opt?.websiteUri ? (
                    <a
                      className="w-full bg-surface-container-high text-on-surface py-3 px-6 rounded-xl font-bold text-center hover:bg-surface-variant transition-colors"
                      href={opt.websiteUri}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Menu / website
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section>
        <div className="bg-surface-container-low rounded-2xl p-8 flex flex-col lg:flex-row gap-8 items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-8 w-full lg:w-auto">
            <div className="text-center sm:text-left">
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">
                Final score
              </p>
              <p className="text-3xl font-extrabold font-headline text-on-surface">
                {sharedTopScore.toFixed(1)}
                <span className="text-lg text-on-surface-variant font-semibold">
                  /10
                </span>
              </p>
            </div>
            <div className="hidden sm:block w-px h-12 bg-outline-variant/30 self-center" />
            <div className="text-center sm:text-left">
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">
                Group alignment
              </p>
              <p className="text-3xl font-extrabold font-headline text-tertiary">
                {align.label === "—" ? "—" : align.label.split("(")[0]?.trim()}
              </p>
              {align.pct > 0 ? (
                <p className="text-sm text-on-surface-variant mt-1">
                  {align.pct}% agreement band
                </p>
              ) : null}
            </div>
          </div>
          <ParticipantStack session={session} />
        </div>
        {align.blurb ? (
          <p className="mt-4 text-sm text-on-surface-variant leading-relaxed max-w-3xl">
            {align.blurb}
          </p>
        ) : null}
      </section>

      {rest.length > 0 ? (
        <section>
          <h3 className="text-xl font-extrabold font-headline text-on-surface mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary">
              list_alt
            </span>
            Runners up
          </h3>
          <div className="flex flex-col gap-3">
            {rest.map((row) => {
              const opt = optionFor(row.optionId);
              const thumb = foodImageForOption(opt);
              const pct = syncPercentFromAverage(row.averageScore);
              return (
                <div
                  key={row.optionId}
                  className="flex items-center justify-between gap-4 p-4 bg-surface-container-lowest rounded-xl hover:bg-surface-container transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-surface-container">
                      {thumb ? (
                        <img
                          alt=""
                          className="w-full h-full object-cover"
                          src={thumb}
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold font-headline text-on-surface truncate">
                        {row.name}
                      </h4>
                      <p className="text-xs text-on-surface-variant font-medium truncate">
                        #{row.rank} · {metaSubtitle(opt)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold text-secondary">
                      {pct}% sync
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : results.length > 1 && leaders.length === results.length ? (
        <p className="text-on-surface-variant text-sm text-center py-2">
          Every option tied at the top — enjoy the flexibility.
        </p>
      ) : null}

      <div className="pt-2">
        <button
          className="w-full sm:w-auto min-w-[12rem] bg-surface-container-highest text-on-surface py-4 px-8 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-surface-variant transition-colors disabled:opacity-50 mx-auto sm:mx-0"
          disabled={busy || resultsLoading}
          onClick={onRefreshResults}
          type="button"
        >
          <span className="material-symbols-outlined">refresh</span>
          {renderActionLabel(
            pendingAction,
            "load-results",
            "Refresh results",
            "Loading…",
          )}
        </button>
      </div>

      {myVotesOnLeaders.length > 0 ? (
        <div className="bg-surface-container-low rounded-xl p-4 border-l-4 border-secondary">
          <span className="text-[10px] font-black uppercase text-secondary tracking-widest block mb-1">
            Private note
          </span>
          <div className="text-sm text-on-surface-variant italic space-y-2">
            {myVotesOnLeaders.map(({ leader, score }) => (
              <p key={leader.optionId}>
                You rated &ldquo;{leader.name}&rdquo; {score}/10.
              </p>
            ))}
            <p>
              {myVotesOnLeaders.some(({ score }) => score >= 8)
                ? "You're in the mix for a pick you really wanted."
                : "Every vote helped shape the group score."}
            </p>
          </div>
        </div>
      ) : null}

      <p className="text-center text-xs text-on-surface-variant">
        Based on {totalVotes} {totalVotes === 1 ? "person" : "people"} in the
        room
      </p>
    </div>
  );
}
