import type { Story, StoryDefault } from "@ladle/react";
import type { ReactNode } from "react";
import { ChoosePhaseSidebar, RatePhaseSidebar } from "../ui/phaseSidebars";
import {
  PARTICIPANT_OTHER,
  PARTICIPANT_YOU,
  sessionCollecting,
  sessionRating,
} from "./fixtures";

export default {
  title: "Chrome / Phase sidebars",
} satisfies StoryDefault;

const sidebarWrap = (child: ReactNode) => (
  <div className="w-64 min-h-[320px] p-4 bg-[#eaf2f9] dark:bg-slate-800">
    {child}
  </div>
);

export const ChooseWhoIsIn: Story = () =>
  sidebarWrap(
    <ChoosePhaseSidebar
      participantId={PARTICIPANT_YOU}
      session={sessionCollecting()}
    />,
  );

export const ChooseSomeDone: Story = () =>
  sidebarWrap(
    <ChoosePhaseSidebar
      participantId={PARTICIPANT_YOU}
      session={sessionCollecting({
        selectionDone: { [PARTICIPANT_YOU]: true, [PARTICIPANT_OTHER]: false },
      })}
    />,
  );

export const RateProgress: Story = () =>
  sidebarWrap(
    <RatePhaseSidebar
      participantId={PARTICIPANT_YOU}
      session={sessionRating()}
    />,
  );
