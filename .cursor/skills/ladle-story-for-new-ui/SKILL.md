---
name: ladle-story-for-new-ui
description: >-
  Adds or updates a Ladle story when a new React UI component is introduced under
  frontend/src/ui. Use when the user or task creates a new presentational component,
  screen, or chrome shell; when merging UI without stories; or when asked to wire
  components into Storybook/Ladle.
---

# Ladle story for new UI components

## When to apply

- A new file is added under `frontend/src/ui/` (or a new exported UI component is added there).
- A UI component’s props or behavior change enough that an existing story would be misleading.
- The user asks for component documentation, visual QA, or Ladle coverage.

Skip if the change is only hooks, API helpers, or non-visual modules.

## Conventions (this repo)

| Item | Location / rule |
|------|------------------|
| Story files | `frontend/src/stories/<name>.stories.tsx` |
| Story discovery | `frontend/.ladle/config.mjs` — pattern `src/**/*.stories.{tsx,jsx}` |
| Component import | `from "../ui/<Component>"` (adjust if the component lives elsewhere) |
| Dev server | From `frontend/`: `npm run ladle` |

## Title groups

Mirror existing stories so the Ladle sidebar stays consistent:

- Full screens / flows: `title: "Screens / …"` (e.g. `Screens / Loading`, `Screens / Landing`)
- Shared chrome / layout: `title: "Chrome / …"` (e.g. `Chrome / Room shell`)
- Smaller widgets: `title: "UI / …"` or a short domain name that matches nearby stories

## Steps

1. **Name the story file** after the primary component: `MyWidget.tsx` → `my-widget.stories.tsx` or `mywidget.stories.tsx` (match sibling files: this project uses `loading.stories.tsx`, `landing.stories.tsx`).
2. **Minimal story** — enough to render the component with valid props:

   ```tsx
   import type { Story, StoryDefault } from "@ladle/react";
   import { MyWidget } from "../ui/MyWidget";

   export default {
     title: "UI / My widget",
   } satisfies StoryDefault;

   export const Default: Story = () => <MyWidget {...minimalProps} />;
   ```

3. **Heavy prop surface** — add a small playground component with `useState` (see `frontend/src/stories/landing.stories.tsx`) or reuse mocks from `frontend/src/stories/fixtures.ts` when the UI needs `SessionResponse`, options, or participants.
4. **Verify** — run `npm run ladle` from `frontend` and confirm the new story appears and renders without console errors.

## Checklist

- [ ] `*.stories.tsx` lives under `frontend/src/stories/`
- [ ] `export default { title: "…" } satisfies StoryDefault`
- [ ] At least one `export const …: Story` renders the new component
- [ ] Props match real usage (theme, router, or API stubs provided if required)
- [ ] Optional: second story for loading / error / empty states when those matter

## Do not

- Add stories under `frontend/src/ui/` (Ladle is configured for `src/**/*.stories.{tsx,jsx}`; keep stories in `src/stories/` unless config changes).
- Leave stories that import removed props or renamed components — update or delete them in the same change as the component.
