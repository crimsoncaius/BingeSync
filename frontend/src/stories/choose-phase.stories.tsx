import type { Story, StoryDefault } from "@ladle/react";
import { useRef, useState, type FormEvent } from "react";
import { ChoosePhase } from "../ui/ChoosePhase";
import {
  mockOptions,
  mockSuggestions,
  PARTICIPANT_YOU,
  sessionCollecting,
} from "./fixtures";

function ChoosePlayground() {
  const sessionBase = sessionCollecting();
  const [optionInput, setOptionInput] = useState("taco");
  const [showSuggestions, setShowSuggestions] = useState(true);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const optionListRef = useRef<HTMLDivElement>(null);

  const [options, setOptions] = useState(sessionBase.options);
  const session = { ...sessionBase, options };

  return (
    <ChoosePhase
      autocompleteRef={autocompleteRef}
      busy={false}
      onAddSubmit={(e: FormEvent<HTMLFormElement>) => e.preventDefault()}
      onMarkSelectionDone={() => undefined}
      onRemoveOption={(id) =>
        setOptions((prev) => prev.filter((o) => o.id !== id))
      }
      onSuggestionPick={() => undefined}
      optionInput={optionInput}
      optionListRef={optionListRef}
      participantId={PARTICIPANT_YOU}
      pendingAction={null}
      session={session}
      setOptionInput={setOptionInput}
      setShowSuggestions={setShowSuggestions}
      showSuggestions={showSuggestions}
      suggestions={mockSuggestions}
      usedGooglePlaceIds={session.usedGooglePlaceIds ?? []}
    />
  );
}

export default {
  title: "Flow / Choose phase",
} satisfies StoryDefault;

export const WithSuggestions: Story = () => <ChoosePlayground />;

export const WaitingRoom: Story = () => (
  <ChoosePhase
    autocompleteRef={{ current: null }}
    busy={false}
    onAddSubmit={(e) => e.preventDefault()}
    onMarkSelectionDone={() => undefined}
    onRemoveOption={() => undefined}
    onSuggestionPick={() => undefined}
    optionInput=""
    optionListRef={{ current: null }}
    participantId={PARTICIPANT_YOU}
    pendingAction={null}
    session={sessionCollecting({
      status: "waiting",
      options: [],
      participants: [{ id: PARTICIPANT_YOU, label: "Alex" }],
      selectionDone: {},
      usedGooglePlaceIds: [],
    })}
    setOptionInput={() => undefined}
    setShowSuggestions={() => undefined}
    showSuggestions={false}
    suggestions={[]}
    usedGooglePlaceIds={[]}
  />
);

export const AtPickLimit: Story = () => (
  <ChoosePhase
    autocompleteRef={{ current: null }}
    busy={false}
    onAddSubmit={(e) => e.preventDefault()}
    onMarkSelectionDone={() => undefined}
    onRemoveOption={() => undefined}
    onSuggestionPick={() => undefined}
    optionInput=""
    optionListRef={{ current: null }}
    participantId={PARTICIPANT_YOU}
    pendingAction={null}
    session={sessionCollecting({
      options: mockOptions.map((o) => ({ ...o, addedBy: PARTICIPANT_YOU })),
      maxPicksPerParticipant: 3,
    })}
    setOptionInput={() => undefined}
    setShowSuggestions={() => undefined}
    showSuggestions={false}
    suggestions={[]}
    usedGooglePlaceIds={[]}
  />
);
