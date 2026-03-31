# Software Architecture Document (SAD)

## Project

`BingeSync` is a utility web app that helps a small group decide where to eat. People create or join a room with a short code, add restaurant picks (with optional Google Places autocomplete), finish their private list, rate the combined pool together, and see a ranked result.

This document describes the **current** implementation and how it is intended to evolve.

## Architecture Goals

- Keep the product simple to run and reason about.
- Optimize for low friction and quick decisions.
- Avoid a database until persistence is a real requirement.
- Leave clear upgrade paths for durable storage, richer realtime, and larger groups.

## Stack

### Frontend

- `React` + `TypeScript`
- `Vite`
- `Tailwind CSS`

Client calls the backend with `fetch`; live session updates use the browser `EventSource` API (Server-Sent Events). Session identity (`sessionId`, `participantId`) is stored in `sessionStorage` so a refresh can rejoin the same room.

### Backend

- `FastAPI` + `Python`
- In-memory session store (`dict`s) guarded by a `threading.Lock`
- `httpx` for outbound calls to Google Places (New API)

All HTTP JSON routes are mounted under the `/api` prefix (see **API surface**).

### Hosting (typical)

- Frontend on `Vercel` (or any static host; `VITE_API_BASE_URL` points at the API).
- Backend on `Railway` (or similar).

### External services

- **Google Places API (New)** — autocomplete suggestions, place details when adding a pick, lazy rating enrichment for suggestion rows, and proxied place photos so the browser never sees the API key.

### Testing

- Backend: `pytest` under `backend/tests/` (e.g. ranking math, session settings).
- End-to-end tests are not wired in-repo yet; the core loop is covered manually and via API tests.

### Deferred

- LLM-assisted normalization
- Dedicated client state library (app uses React state)
- Voice input
- Authentication
- Analytics
- Database / ORM

## High-level system design

### Client responsibilities

- Landing: create room (optional title, max participants, max picks per person) or join by code.
- **Choose** phase (`waiting` / `collecting`): add/remove own options; autocomplete from Places; mark “done choosing” when the private list is ready.
- **Rate** phase: sliders `0–10` for every option in the combined pool; submit one batch per participant when complete.
- **Results**: show ranked list once everyone has rated everything.
- Subscribe to `GET /api/sessions/{id}/events` for push updates; still uses `GET` for bootstrap and mutations.

### Server responsibilities

- Issue `sessionId`, `joinCode`, and `participantId` on create/join.
- Enforce room capacity (`maxParticipants`, default 2, cap 10), join rules (closed during `rating` / `results`), and optional `maxPicksPerParticipant`.
- Store options, per-participant “selection done”, and ratings; derive `status` from that data.
- Merge picks into one pool for rating; **while more than one person is in the room during choose**, each client only sees their own options in API responses until the room moves to rating (privacy for parallel picking).
- Deduplicate by **Google Place ID** across the pool; allow duplicate display names per person via internal normalized-name disambiguation.
- Run ranking when all participants have rated all options.
- Broadcast session snapshots to SSE subscribers after mutations.

## Session lifecycle and status

Derived `status` values:

| Status        | Meaning |
|---------------|---------|
| `waiting`     | Room not full; still accepting joins. |
| `collecting`  | Room full (or host chose >2 max); still in choose phase. |
| `rating`      | At least two participants, at least one option, everyone marked selection done — combined pool visible; ratings accepted. |
| `results`     | Every participant has rated every option. |

Minimum participants to leave `waiting` is 2. Moving to `rating` requires everyone currently in the room to have marked selection done (and each must have at least one option before marking done).

## API surface

Base path: `/api`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness. |
| `POST` | `/sessions` | Create session; body may include `name`, `maxParticipants`, `title`, `maxPicksPerParticipant`. |
| `POST` | `/sessions/join` | Join by `joinCode` (+ optional `name`). |
| `GET` | `/sessions/{sessionRef}` | Session snapshot; `sessionRef` may be `sessionId` or `joinCode`. Query `participantId` for viewer-scoped option list in choose phase. |
| `GET` | `/sessions/{sessionId}/events` | SSE stream of session JSON; query `participantId` same as above. |
| `POST` | `/sessions/{sessionId}/options` | Add option (`participantId`, `name`, optional `placeId`); may fetch Places details. |
| `DELETE` | `/sessions/{sessionId}/options/{optionId}` | Remove own option (`participantId` query). |
| `POST` | `/sessions/{sessionId}/selection/done` | Toggle selection finished (`participantId`, `done`). |
| `POST` | `/sessions/{sessionId}/ratings` | Replace one participant’s ratings for all options (full grid required). |
| `GET` | `/sessions/{sessionId}/results` | Ranked results when ready; otherwise `ready: false` + reason. |
| `GET` | `/suggestions` | Places autocomplete (`q`); requires configured API key. |
| `POST` | `/suggestions/enrich` | Batch lazy-load ratings for suggestion `placeId`s. |
| `GET` | `/places/photo` | Proxy Places photo media (`name` = photo resource); key stays server-side. |

## Session and option models (API shape)

Session responses include roughly:

- `sessionId`, `joinCode`, `status`
- `participants[]` — `id`, `label`
- `options[]` — `id`, `name`, `addedBy`, optional Places fields (`address`, `googlePlaceId`, `rating`, `userRatingCount`, `priceLevel`, `phone`, `websiteUri`, `googleMapsUri`, `openNow`, `photoUrl`)
- `ratings` — map `participantId` → `optionId` → integer score
- `selectionDone` — map `participantId` → boolean
- `maxParticipants`, `isReadyForResults`, `usedGooglePlaceIds`, optional `title`, `maxPicksPerParticipant`

There is no separate `expiresAt` field in the current store; sessions live until process restart.

## Realtime strategy

The app uses **Server-Sent Events** (not WebSockets): the server pushes serialized `SessionResponse` JSON on change, with periodic keepalive comments. The client still uses HTTP for actions; SSE keeps multiple tabs and participants in sync without polling.

## Auth strategy

Anonymous participation: knowing `joinCode` (and receiving a `participantId` from create/join) is the access model. No accounts.

## Google Places usage

- **Autocomplete** (`places:autocomplete`) filters to food-related primary types; the backend uses a fixed **location bias** (Singapore-centered circle) in the current code — adjust for other regions if needed.
- **Place details** when adding an option with `placeId` populate name, address, ratings, hours, links, and first photo reference.
- **Photo proxy** serves images via `/api/places/photo` using the server key.
- If `GOOGLE_PLACES_API_KEY` is unset, suggestions return empty and details enrichment is skipped; free-text names still work.

## Ranking

Implemented scoring per option:

- `averageScore` — mean of all participants’ scores.
- `disagreementPenalty` — `(max - min) * 0.4`.
- `finalScore` — `averageScore - disagreementPenalty`.

Results are sorted by `finalScore` (then tie-breakers), with competition-style **ranks** (ties share rank).

Scores are integers **0–10** inclusive.

## State on the client

- React component state drives UI; no global store library.
- `flowPhaseFromStatus` maps API `status` to UI steps: `choose` | `rating` | `results`.

## Database

**None** in the current build — same tradeoffs as before: data lost on restart, single-instance memory only safe for one backend process.

**PostgreSQL** remains the natural next step for persistence, history, and horizontal scale.

## Deployment note

In-memory sessions plus SSE mean: restarts drop rooms; multiple instances without sticky sessions or shared state will not see the same rooms. Acceptable for demos; not for production scale without storage and routing changes.

## Future evolution

- Persistent storage and optional auth
- WebSockets or ably/pub-sub if bidirectional or richer sync is needed
- Configurable or user-chosen location for Places bias
- E2E tests for the full loop
- LLM or fuzzy matching on free-text-only entries

## Summary

The shipped architecture is: **React + Vite + Tailwind** frontend, **FastAPI** backend with an **in-memory** session store, **Google Places (New)** for suggestions and enrichment, **anonymous join-code** rooms for **2–10** people, **SSE** for live session sync, and **HTTP** for mutations and results — designed so a database and stronger hosting story can be added without rewriting the product flow.
