import type { Story, StoryDefault } from "@ladle/react";
import { useRef, useState, type FormEvent } from "react";
import type { PlaceSuggestion, SessionSearchBias } from "../api";
import { LandingPage } from "../ui/LandingPage";

function LandingPlayground() {
  const [userNameInput, setUserNameInput] = useState("Alex");
  const [joinCodeInput, setJoinCodeInput] = useState("ABC123");
  const [hostRoomTitle, setHostRoomTitle] = useState("Friday Night Feast");
  const [hostMaxPicksPerParticipant, setHostMaxPicksPerParticipant] = useState<
    number | null
  >(5);
  const [hostAreaInput, setHostAreaInput] = useState("");
  const [hostAreaSuggestions, setHostAreaSuggestions] = useState<PlaceSuggestion[]>(
    [],
  );
  const [hostAreaShowSuggestions, setHostAreaShowSuggestions] = useState(false);
  const [hostSearchBias, setHostSearchBias] = useState<SessionSearchBias | null>(
    null,
  );
  const hostAreaRef = useRef<HTMLDivElement>(null);

  return (
    <LandingPage
      busy={false}
      hostAreaInput={hostAreaInput}
      hostAreaRef={hostAreaRef}
      hostAreaShowSuggestions={hostAreaShowSuggestions}
      hostAreaSuggestions={hostAreaSuggestions}
      hostMaxPicksPerParticipant={hostMaxPicksPerParticipant}
      hostRoomTitle={hostRoomTitle}
      hostSearchBias={hostSearchBias}
      joinCodeInput={joinCodeInput}
      onClearHostSearchBias={() => {
        setHostSearchBias(null);
        setHostAreaInput("");
        setHostAreaSuggestions([]);
        setHostAreaShowSuggestions(false);
      }}
      onCreate={() => undefined}
      onHostAreaSuggestionPick={() => undefined}
      onInvalidateHostSearchBias={() => setHostSearchBias(null)}
      onJoinSubmit={(e: FormEvent<HTMLFormElement>) => e.preventDefault()}
      pendingAction={null}
      setHostAreaInput={setHostAreaInput}
      setHostAreaShowSuggestions={setHostAreaShowSuggestions}
      setHostMaxPicksPerParticipant={setHostMaxPicksPerParticipant}
      setHostRoomTitle={setHostRoomTitle}
      setJoinCodeInput={setJoinCodeInput}
      setUserNameInput={setUserNameInput}
      userNameInput={userNameInput}
    />
  );
}

export default {
  title: "Screens / Landing",
} satisfies StoryDefault;

export const Default: Story = () => <LandingPlayground />;
