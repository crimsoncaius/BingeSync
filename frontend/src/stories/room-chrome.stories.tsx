import type { Story, StoryDefault } from "@ladle/react";
import { ResultsPhase } from "../ui/ResultsPhase";
import { RoomChrome } from "../ui/RoomChrome";
import {
  mockResultsSingleWinner,
  PARTICIPANT_YOU,
  sessionResults,
} from "./fixtures";

export default {
  title: "Chrome / Room shell",
} satisfies StoryDefault;

export const ResultsWithChrome: Story = () => (
  <RoomChrome
    activePhase="results"
    busy={false}
    copiedJoinCode={false}
    error={null}
    joinCode="BINGE1"
    maxParticipants={8}
    onCopyCode={() => undefined}
    onLeave={() => undefined}
    onRefresh={() => undefined}
    participantCount={3}
    participantLabel="Alex"
    roomTitle="Friday Night Feast"
  >
    <ResultsPhase
      busy={false}
      participantId={PARTICIPANT_YOU}
      pendingAction={null}
      results={mockResultsSingleWinner}
      resultsLoading={false}
      onRefreshResults={() => undefined}
      session={sessionResults()}
    />
  </RoomChrome>
);

export const ChoosePhaseChrome: Story = () => (
  <RoomChrome
    activePhase="choose"
    busy={false}
    copiedJoinCode={false}
    error={null}
    joinCode="BINGE1"
    maxParticipants={8}
    onCopyCode={() => undefined}
    onLeave={() => undefined}
    onRefresh={() => undefined}
    participantCount={2}
    participantLabel="Alex"
    roomTitle="Friday Night Feast"
  >
    <div className="p-8 md:p-12 max-w-2xl">
      <p className="text-on-surface-variant font-body">
        Placeholder main area — open the{" "}
        <strong className="text-on-surface">Choose phase</strong> story for the
        full picker UI.
      </p>
    </div>
  </RoomChrome>
);

export const ErrorBanner: Story = () => (
  <RoomChrome
    activePhase="rating"
    busy={false}
    copiedJoinCode={false}
    error="Could not reach the server. Check that the API is running."
    joinCode="BINGE1"
    maxParticipants={8}
    onCopyCode={() => undefined}
    onLeave={() => undefined}
    onRefresh={() => undefined}
    participantCount={2}
    participantLabel="Alex"
    roomTitle={null}
  >
    <div className="p-8 text-on-surface">Content below the error banner.</div>
  </RoomChrome>
);
