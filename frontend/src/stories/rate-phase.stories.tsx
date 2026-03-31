import type { Story, StoryDefault } from "@ladle/react";
import { useState } from "react";
import { RatePhase } from "../ui/RatePhase";
import { PARTICIPANT_YOU, sessionRating } from "./fixtures";

function RatePlayground() {
  const session = sessionRating();
  const [ratings, setRatings] = useState<Record<string, number>>({
    "opt-pizza": 8,
    "opt-burger": 6,
    "opt-sushi": 5,
  });

  return (
    <RatePhase
      busy={false}
      hasRatedEverything
      onSubmitRatings={() => undefined}
      participantId={PARTICIPANT_YOU}
      pendingAction={null}
      ratings={ratings}
      session={session}
      setRating={(optionId, score) =>
        setRatings((prev) => ({ ...prev, [optionId]: score }))
      }
    />
  );
}

export default {
  title: "Flow / Rate phase",
} satisfies StoryDefault;

export const InProgress: Story = () => <RatePlayground />;

export const NotAllRated: Story = () => {
  const session = sessionRating();
  const [ratings, setRatings] = useState<Record<string, number>>({
    "opt-pizza": 7,
  });

  return (
    <RatePhase
      busy={false}
      hasRatedEverything={false}
      onSubmitRatings={() => undefined}
      participantId={PARTICIPANT_YOU}
      pendingAction={null}
      ratings={ratings}
      session={session}
      setRating={(optionId, score) =>
        setRatings((prev) => ({ ...prev, [optionId]: score }))
      }
    />
  );
};

export const EmptyOptions: Story = () => (
  <RatePhase
    busy={false}
    hasRatedEverything={false}
    onSubmitRatings={() => undefined}
    participantId={PARTICIPANT_YOU}
    pendingAction={null}
    ratings={{}}
    session={sessionRating({ options: [] })}
    setRating={() => undefined}
  />
);
