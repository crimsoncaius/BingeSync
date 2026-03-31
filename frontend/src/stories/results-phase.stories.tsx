import type { Story, StoryDefault } from "@ladle/react";
import { ResultsPhase } from "../ui/ResultsPhase";
import {
  mockResultsEveryoneTied,
  mockResultsSingleWinner,
  mockResultsTie,
  PARTICIPANT_YOU,
  sessionResults,
} from "./fixtures";

export default {
  title: "Flow / Results phase",
} satisfies StoryDefault;

export const SingleWinner: Story = () => (
  <ResultsPhase
    busy={false}
    participantId={PARTICIPANT_YOU}
    pendingAction={null}
    results={mockResultsSingleWinner}
    resultsLoading={false}
    onRefreshResults={() => undefined}
    session={sessionResults()}
  />
);

export const TieForFirst: Story = () => (
  <ResultsPhase
    busy={false}
    participantId={PARTICIPANT_YOU}
    pendingAction={null}
    results={mockResultsTie}
    resultsLoading={false}
    onRefreshResults={() => undefined}
    session={sessionResults()}
  />
);

export const FullRoomTie: Story = () => (
  <ResultsPhase
    busy={false}
    participantId={PARTICIPANT_YOU}
    pendingAction={null}
    results={mockResultsEveryoneTied}
    resultsLoading={false}
    onRefreshResults={() => undefined}
    session={sessionResults({
      participants: [
        { id: PARTICIPANT_YOU, label: "Alex" },
        { id: "p2", label: "Jordan" },
        { id: "p3", label: "Sam" },
        { id: "p4", label: "Riley" },
        { id: "p5", label: "Casey" },
        { id: "p6", label: "Morgan" },
        { id: "p7", label: "Quinn" },
      ],
    })}
  />
);

export const Loading: Story = () => (
  <ResultsPhase
    busy
    participantId={PARTICIPANT_YOU}
    pendingAction="load-results"
    results={[]}
    resultsLoading
    onRefreshResults={() => undefined}
    session={sessionResults()}
  />
);

export const SoloParticipant: Story = () => (
  <ResultsPhase
    busy={false}
    participantId={PARTICIPANT_YOU}
    pendingAction={null}
    results={mockResultsSingleWinner}
    resultsLoading={false}
    onRefreshResults={() => undefined}
    session={sessionResults({
      participants: [{ id: PARTICIPANT_YOU, label: "Alex" }],
      ratings: {
        [PARTICIPANT_YOU]: {
          "opt-pizza": 9,
          "opt-burger": 7,
          "opt-sushi": 8,
        },
      },
    })}
  />
);
