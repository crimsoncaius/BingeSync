# Software Architecture Document (SAD)

## Project
`BingeSync` is a fast utility web app that helps two people decide what food to eat by creating a shared session, adding food options, rating the combined pool, and returning a ranked result.

This document defines the recommended MVP architecture based on the current product plan and stack choices.

## Architecture Goals
- Keep the MVP simple and fast to build.
- Optimize for low friction and quick decision-making.
- Avoid unnecessary infrastructure in version 1.
- Leave clear upgrade paths for realtime updates, persistence, and group support later.

## Recommended Stack

### Frontend
- `React`
- `Vite`
- `Tailwind CSS`

### Backend
- `FastAPI` with `Python`

### Hosting
- Frontend on `Vercel`
- Backend on `Railway`

### External Services
- `Google Places API` for location or food/place enrichment

### Testing
- Unit tests
- End-to-end tests

### Deferred for Later
- LLM usage
- State management library
- Voice input
- Authentication
- Analytics
- Realtime infrastructure
- Database and ORM

## Why This Stack

### React + Vite
`React + Vite` is a strong fit for the MVP because it provides a fast local development experience, a simple project structure, and low overhead. It is ideal for building a focused web app without introducing unnecessary framework complexity early.

### Tailwind CSS
`Tailwind CSS` is the recommended styling choice because it allows rapid UI iteration, keeps the component workflow fast, and works well for a utility-first product where speed matters more than heavy design-system investment.

### FastAPI
`FastAPI` is the recommended backend because it is lightweight, fast, and well suited to a small API that manages sessions, join codes, option submission, ratings, and ranking results. It also provides strong request modeling and validation patterns and can be deployed cleanly on `Railway`.

## Database Recommendation
For the current MVP, **no database is required** if the goal is to validate the product flow quickly.

### MVP Approach
Use an in-memory store on the backend for:
- sessions
- join codes
- food options
- user ratings
- ranked results

### Tradeoff
This is the fastest way to build, but it has clear limitations:
- data is lost when the server restarts
- sessions do not persist long term
- horizontal scaling is not safe
- multiple backend instances can cause inconsistency

### Best Long-Term Database
If persistence becomes necessary, the best next step is `PostgreSQL`.

`PostgreSQL` is the best long-term recommendation because it is reliable, flexible, easy to host on `Railway`, and a strong fit for:
- sessions
- users
- ratings
- historical results
- future group support

For now, the architecture should be written so a database can be added later without major rewrites.

## High-Level System Design

### Client Responsibilities
The frontend is responsible for:
- creating or joining a session
- collecting food entries
- showing the combined pool
- collecting ratings from each user
- displaying ranked results

### Server Responsibilities
The backend is responsible for:
- creating sessions
- generating join codes
- accepting food option submissions
- merging or normalizing duplicate entries
- storing ratings during the active session
- running the ranking algorithm
- returning the final ranked list
- optionally enriching entries with `Google Places API`

## Core MVP Flow
1. User A creates a session.
2. The backend generates a short join code.
3. User B joins the session with the code.
4. Both users submit food options.
5. The backend builds one combined pool.
6. Each user rates each option from `1-10`.
7. The backend computes a ranked list.
8. The frontend shows the top result and backup choices.

## API Design Direction
The API should stay small and task-oriented.

Suggested endpoints:
- `POST /sessions`
- `POST /sessions/join`
- `POST /sessions/:sessionId/options`
- `GET /sessions/:sessionId/options`
- `POST /sessions/:sessionId/ratings`
- `GET /sessions/:sessionId/results`

These routes are enough for the MVP and leave room for future expansion.

## Session Model
The MVP only supports two users per session.

Recommended session object shape:
- `sessionId`
- `joinCode`
- `status`
- `participants`
- `options`
- `ratings`
- `results`
- `createdAt`
- `expiresAt`

Even though the MVP supports only two users, the internal model should avoid hardcoding assumptions that make future group support difficult.

## Realtime Strategy
Realtime updates are **not required** for the MVP.

Recommended approach:
- use standard HTTP requests
- refresh data after key actions
- optionally use lightweight polling only if needed

This keeps the architecture simple and avoids early `WebSocket` complexity.

## Auth Strategy
Authentication is **not required** for the MVP.

Recommended approach:
- anonymous session participation
- simple join-code access
- no account creation

This keeps the entry barrier low and supports the fast-utility product goal.

## Google Places API Usage
`Google Places API` should be used as an optional enrichment layer rather than a hard dependency for all entries.

Possible uses:
- normalize restaurant names
- enrich place details
- improve duplicate matching
- support future location-aware suggestions

For the MVP, manual user input should still work even if API enrichment fails.

## Ranking Strategy
The ranking algorithm should reward mutual interest and penalize disagreement.

A practical MVP scoring approach:
- start with the average of both ratings
- subtract a disagreement penalty based on the rating gap

Example concept:
- two `7` ratings should rank well
- a `10` and a `4` should rank lower than a steady mutual option

This fits the product goal better than simple average alone.

## LLM Position
LLM usage is currently deferred.

If introduced later, it should likely be used for:
- fuzzy normalization of food entries
- resolving ambiguous user input
- improving matching between similar options

It should not be required for the core MVP flow.

## State Management Recommendation
This decision can wait.

Recommended MVP approach:
- use standard React state and component state first
- introduce a state library only if session flow becomes hard to manage

If a state library is needed later, `Zustand` would be a strong lightweight option.

## Testing Strategy

### Unit Tests
Use unit tests for:
- ranking logic
- duplicate merging logic
- session validation
- join-code generation

### End-to-End Tests
Use end-to-end tests for:
- creating a session
- joining with a code
- adding food options
- rating the combined pool
- viewing ranked results

This gives confidence in the core product loop without over-investing in infrastructure.

## Deployment Model

### Frontend
Deploy the `React + Vite` frontend to `Vercel`.

### Backend
Deploy the `FastAPI` service to `Railway`.

### Important Constraint
If the backend uses only in-memory storage, deployed sessions may be unstable across restarts or multiple instances.

That is acceptable for an early prototype, but not for a durable production MVP.

## Future Evolution
Planned upgrades after MVP may include:
- persistent database storage with `PostgreSQL`
- realtime updates with `WebSockets`
- group sessions
- voice input
- LLM-assisted matching
- restaurant availability and richer place metadata
- authentication and saved session history

## Final Recommendation
The best MVP architecture is:
- `React + Vite` frontend
- `Tailwind CSS` for styling
- `FastAPI` backend on `Railway`
- no database for the first prototype
- `Google Places API` as optional enrichment
- anonymous join-code sessions
- no realtime, no auth, no voice input in version 1

This is the fastest path to a usable prototype while keeping the system easy to upgrade later.
