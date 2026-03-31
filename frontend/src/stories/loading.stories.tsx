import type { Story, StoryDefault } from "@ladle/react";
import { LoadingScreen } from "../ui/LoadingScreen";

export default {
  title: "Screens / Loading",
} satisfies StoryDefault;

export const Default: Story = () => <LoadingScreen />;
