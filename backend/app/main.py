from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from threading import Lock
from typing import AsyncIterator, Literal
from uuid import uuid4

import httpx
from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.responses import StreamingResponse

from app.settings import settings


SessionStatus = Literal["waiting", "collecting", "rating", "results"]
MAX_PARTICIPANTS = 2
JOIN_CODE_LENGTH = 6
SCORE_PENALTY_MULTIPLIER = 0.4


class ParticipantResponse(BaseModel):
    id: str
    label: str


class FoodOptionResponse(BaseModel):
    id: str
    name: str
    addedBy: str


class SessionResponse(BaseModel):
    sessionId: str
    joinCode: str
    status: SessionStatus
    participants: list[ParticipantResponse]
    options: list[FoodOptionResponse]
    ratings: dict[str, dict[str, int]]
    maxParticipants: int
    isReadyForResults: bool


class SessionCreateResponse(BaseModel):
    session: SessionResponse
    participantId: str


class CreateSessionRequest(BaseModel):
    name: str | None = Field(default=None, max_length=40)


class JoinSessionRequest(BaseModel):
    joinCode: str = Field(min_length=JOIN_CODE_LENGTH, max_length=JOIN_CODE_LENGTH)
    name: str | None = Field(default=None, max_length=40)


class AddOptionRequest(BaseModel):
    participantId: str
    name: str = Field(min_length=2, max_length=80)


class PlaceSearchResponseItem(BaseModel):
    id: str
    name: str
    formattedAddress: str | None = None
    rating: float | None = None
    googleMapsUri: str | None = None


class RatingEntry(BaseModel):
    optionId: str
    score: int = Field(ge=1, le=10)


class SubmitRatingsRequest(BaseModel):
    participantId: str
    ratings: list[RatingEntry]


class SuggestionStreamRequest(BaseModel):
    participantId: str
    vibe: str | None = Field(default=None, max_length=140)
    count: int = Field(default=6, ge=3, le=10)


class RankedResult(BaseModel):
    optionId: str
    name: str
    averageScore: float
    disagreementPenalty: float
    finalScore: float


class ResultsResponse(BaseModel):
    ready: bool
    results: list[RankedResult]
    reason: str | None = None


@dataclass
class Participant:
    id: str
    label: str


@dataclass
class FoodOption:
    id: str
    name: str
    normalized_name: str
    added_by: str


@dataclass
class SessionRecord:
    session_id: str
    join_code: str
    created_at: datetime
    participants: list[Participant]
    options: list[FoodOption]
    ratings: dict[str, dict[str, int]]
    max_participants: int = MAX_PARTICIPANTS


SESSIONS: dict[str, SessionRecord] = {}
JOIN_CODES: dict[str, str] = {}
STORE_LOCK = Lock()


def normalize_name(value: str) -> str:
    return " ".join(value.lower().split())


def clean_display_name(value: str | None, fallback: str) -> str:
    if value is None:
        return fallback

    cleaned = " ".join(value.split())
    return cleaned[:40] if cleaned else fallback


def now_utc() -> datetime:
    return datetime.now(UTC)


def create_identifier() -> str:
    return uuid4().hex[:12]


def create_join_code() -> str:
    while True:
        candidate = uuid4().hex[:JOIN_CODE_LENGTH].upper()
        if candidate not in JOIN_CODES:
            return candidate


def get_session_or_404(session_id: str) -> SessionRecord:
    session = SESSIONS.get(session_id)

    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    return session


def resolve_session_or_404(session_ref: str) -> SessionRecord:
    normalized_ref = session_ref.strip()

    session = SESSIONS.get(normalized_ref)
    if session is not None:
        return session

    join_code = normalized_ref.upper()
    session_id = JOIN_CODES.get(join_code)
    if session_id is None:
        raise HTTPException(status_code=404, detail="Session not found")

    return get_session_or_404(session_id)


def require_participant(session: SessionRecord, participant_id: str) -> None:
    if not any(participant.id == participant_id for participant in session.participants):
        raise HTTPException(status_code=403, detail="Participant is not part of this session")


def has_full_ratings(session: SessionRecord) -> bool:
    if len(session.participants) != session.max_participants or not session.options:
        return False

    option_ids = {option.id for option in session.options}

    for participant in session.participants:
        participant_ratings = session.ratings.get(participant.id, {})
        if option_ids - participant_ratings.keys():
            return False

    return True


def session_status(session: SessionRecord) -> SessionStatus:
    if has_full_ratings(session):
        return "results"
    if len(session.participants) < session.max_participants:
        return "waiting"
    if not session.options:
        return "collecting"
    return "rating"


def serialize_session(session: SessionRecord) -> SessionResponse:
    return SessionResponse(
        sessionId=session.session_id,
        joinCode=session.join_code,
        status=session_status(session),
        participants=[
            ParticipantResponse(id=participant.id, label=participant.label)
            for participant in session.participants
        ],
        options=[
            FoodOptionResponse(id=option.id, name=option.name, addedBy=option.added_by)
            for option in session.options
        ],
        ratings=session.ratings,
        maxParticipants=session.max_participants,
        isReadyForResults=has_full_ratings(session),
    )


def compute_results(session: SessionRecord) -> list[RankedResult]:
    if not has_full_ratings(session):
        return []

    ranked_results: list[RankedResult] = []

    for option in session.options:
        scores = [session.ratings[participant.id][option.id] for participant in session.participants]
        average_score = sum(scores) / len(scores)
        disagreement_penalty = (max(scores) - min(scores)) * SCORE_PENALTY_MULTIPLIER
        final_score = average_score - disagreement_penalty

        ranked_results.append(
            RankedResult(
                optionId=option.id,
                name=option.name,
                averageScore=round(average_score, 2),
                disagreementPenalty=round(disagreement_penalty, 2),
                finalScore=round(final_score, 2),
            )
        )

    return sorted(
        ranked_results,
        key=lambda result: (result.finalScore, result.averageScore, -result.disagreementPenalty),
        reverse=True,
    )


def sse_message(event: str, payload: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


def build_suggestion_messages(session: SessionRecord, payload: SuggestionStreamRequest) -> list[dict[str, str]]:
    participant = next(
        (entry for entry in session.participants if entry.id == payload.participantId),
        None,
    )
    participant_label = participant.label if participant else "Current user"
    current_options = ", ".join(option.name for option in session.options) or "No current options yet"
    other_preferences = []

    for entry in session.participants:
        if entry.id == payload.participantId:
            continue

        ratings = session.ratings.get(entry.id, {})
        liked_options = [
            option.name
            for option in session.options
            if ratings.get(option.id, 0) >= 7
        ]
        if liked_options:
            other_preferences.append(f"{entry.label} currently likes: {', '.join(liked_options)}")

    vibe_note = payload.vibe.strip() if payload.vibe else "No extra vibe provided"
    collaborator_context = "\n".join(other_preferences) if other_preferences else "No ratings from the other person yet"

    return [
        {
            "role": "system",
            "content": (
                "You are helping two people decide where to eat. "
                "Suggest concise food place ideas that feel like real restaurant or takeout options. "
                "Return exactly one suggestion per line in the format "
                "'Place idea - short reason'. Do not use markdown bullets or numbering."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Create {payload.count} food place ideas for a shared decision session.\n"
                f"Current user: {participant_label}\n"
                f"Current session options: {current_options}\n"
                f"Known collaborator context: {collaborator_context}\n"
                f"Requested vibe or constraint: {vibe_note}\n"
                "Keep each line short, distinct, and easy to add back into the app."
            ),
        },
    ]


async def stream_openrouter_suggestions(
    session: SessionRecord, payload: SuggestionStreamRequest
) -> AsyncIterator[str]:
    if not settings.openrouter_configured:
        yield sse_message("error", {"message": "OpenRouter is not configured on the backend."})
        return

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.app_base_url,
        "X-Title": "BingeSync",
    }
    request_payload = {
        "model": settings.openrouter_model,
        "stream": True,
        "temperature": 0.8,
        "messages": build_suggestion_messages(session, payload),
    }

    yield sse_message(
        "status",
        {"message": f"Streaming place ideas with {settings.openrouter_model}..."},
    )

    try:
        timeout = httpx.Timeout(60.0, connect=10.0, read=60.0, write=30.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream(
                "POST",
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=request_payload,
            ) as response:
                response.raise_for_status()

                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue

                    data = line[6:]
                    if data == "[DONE]":
                        break

                    try:
                        payload_data = json.loads(data)
                    except json.JSONDecodeError:
                        continue

                    choice = (payload_data.get("choices") or [{}])[0]
                    delta = choice.get("delta") or {}
                    content = delta.get("content")

                    if isinstance(content, str) and content:
                        yield sse_message("chunk", {"text": content})

    except httpx.HTTPStatusError as error:
        message = "OpenRouter request failed."
        if error.response is not None:
            try:
                response_payload = error.response.json()
                message = response_payload.get("error", {}).get("message", message)
            except ValueError:
                message = error.response.text or message
        yield sse_message("error", {"message": message})
        return
    except httpx.HTTPError:
        yield sse_message("error", {"message": "Could not reach OpenRouter."})
        return

    yield sse_message("done", {"message": "Suggestion stream completed."})


async def search_google_places(query: str) -> list[PlaceSearchResponseItem]:
    if not settings.google_places_configured:
        raise HTTPException(
            status_code=503,
            detail="Google Places is not configured on the backend.",
        )

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_places_api_key or "",
        "X-Goog-FieldMask": ",".join(
            [
                "places.id",
                "places.displayName",
                "places.formattedAddress",
                "places.rating",
                "places.googleMapsUri",
            ]
        ),
    }
    request_payload = {
        "textQuery": query,
        "maxResultCount": 6,
        "includedType": "restaurant",
    }

    try:
        timeout = httpx.Timeout(20.0, connect=10.0, read=20.0, write=20.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                "https://places.googleapis.com/v1/places:searchText",
                headers=headers,
                json=request_payload,
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as error:
        message = "Google Places request failed."
        if error.response is not None:
            try:
                payload = error.response.json()
                message = payload.get("error", {}).get("message", message)
            except ValueError:
                message = error.response.text or message
        raise HTTPException(status_code=502, detail=message) from error
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="Could not reach Google Places.") from error

    payload = response.json()
    results: list[PlaceSearchResponseItem] = []

    for place in payload.get("places", []):
        display_name = place.get("displayName", {}).get("text")
        place_id = place.get("id")

        if not display_name or not place_id:
            continue

        results.append(
            PlaceSearchResponseItem(
                id=place_id,
                name=display_name,
                formattedAddress=place.get("formattedAddress"),
                rating=place.get("rating"),
                googleMapsUri=place.get("googleMapsUri"),
            )
        )

    return results


app = FastAPI(title="BingeSync API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
api = APIRouter(prefix="/api")


@api.get("/health")
def healthcheck() -> dict[str, bool | str]:
    return {
        "status": "ok",
        "openrouterConfigured": settings.openrouter_configured,
        "googlePlacesConfigured": settings.google_places_configured,
    }


@api.post("/sessions", response_model=SessionCreateResponse)
def create_session(payload: CreateSessionRequest | None = None) -> SessionCreateResponse:
    with STORE_LOCK:
        session_id = create_identifier()
        participant_id = create_identifier()
        join_code = create_join_code()
        participant_label = clean_display_name(payload.name if payload else None, "User 1")

        session = SessionRecord(
            session_id=session_id,
            join_code=join_code,
            created_at=now_utc(),
            participants=[Participant(id=participant_id, label=participant_label)],
            options=[],
            ratings={participant_id: {}},
        )
        SESSIONS[session_id] = session
        JOIN_CODES[join_code] = session_id

    return SessionCreateResponse(session=serialize_session(session), participantId=participant_id)


@api.post("/sessions/join", response_model=SessionCreateResponse)
def join_session(payload: JoinSessionRequest) -> SessionCreateResponse:
    join_code = payload.joinCode.strip().upper()

    with STORE_LOCK:
        session_id = JOIN_CODES.get(join_code)

        if session_id is None:
            raise HTTPException(status_code=404, detail="Join code not found")

        session = get_session_or_404(session_id)

        if len(session.participants) >= session.max_participants:
            raise HTTPException(status_code=400, detail="Session already has two participants")

        participant_id = create_identifier()
        participant_label = clean_display_name(
            payload.name,
            f"User {len(session.participants) + 1}",
        )
        session.participants.append(Participant(id=participant_id, label=participant_label))
        session.ratings.setdefault(participant_id, {})

    return SessionCreateResponse(session=serialize_session(session), participantId=participant_id)


@api.get("/sessions/{session_ref}", response_model=SessionResponse)
def get_session(session_ref: str) -> SessionResponse:
    return serialize_session(resolve_session_or_404(session_ref))


@api.get("/places/search", response_model=list[PlaceSearchResponseItem])
async def place_search(
    query: str = Query(min_length=2, max_length=120)
) -> list[PlaceSearchResponseItem]:
    cleaned_query = " ".join(query.split())

    if len(cleaned_query) < 2:
        raise HTTPException(status_code=400, detail="Search query is too short.")

    return await search_google_places(cleaned_query)


@api.post("/sessions/{session_id}/options", response_model=SessionResponse)
def create_option(session_id: str, payload: AddOptionRequest) -> SessionResponse:
    session = get_session_or_404(session_id)
    require_participant(session, payload.participantId)

    candidate_name = " ".join(payload.name.split())
    normalized_name = normalize_name(candidate_name)

    if not normalized_name:
        raise HTTPException(status_code=400, detail="Food option cannot be blank")

    with STORE_LOCK:
        existing_option = next(
            (option for option in session.options if option.normalized_name == normalized_name),
            None,
        )

        if existing_option is None:
            session.options.append(
                FoodOption(
                    id=create_identifier(),
                    name=candidate_name,
                    normalized_name=normalized_name,
                    added_by=payload.participantId,
                )
            )

    return serialize_session(session)


@api.post("/sessions/{session_id}/ratings", response_model=SessionResponse)
def save_ratings(session_id: str, payload: SubmitRatingsRequest) -> SessionResponse:
    session = get_session_or_404(session_id)
    require_participant(session, payload.participantId)

    option_ids = {option.id for option in session.options}

    if not option_ids:
        raise HTTPException(status_code=400, detail="Add at least one option before rating")

    submitted_ids = {entry.optionId for entry in payload.ratings}
    missing_ids = option_ids - submitted_ids

    if missing_ids:
        raise HTTPException(status_code=400, detail="All options must be rated before submission")

    if submitted_ids - option_ids:
        raise HTTPException(status_code=400, detail="Ratings contain an unknown option")

    with STORE_LOCK:
        session.ratings[payload.participantId] = {
            entry.optionId: entry.score for entry in payload.ratings
        }

    return serialize_session(session)


@api.get("/sessions/{session_id}/results", response_model=ResultsResponse)
def get_results(session_id: str) -> ResultsResponse:
    session = get_session_or_404(session_id)

    if not has_full_ratings(session):
        return ResultsResponse(
            ready=False,
            results=[],
            reason="Both participants must rate every option before results are available.",
        )

    return ResultsResponse(ready=True, results=compute_results(session))


@api.post("/sessions/{session_id}/place-suggestions/stream")
async def stream_place_suggestions(
    session_id: str, payload: SuggestionStreamRequest
) -> StreamingResponse:
    session = get_session_or_404(session_id)
    require_participant(session, payload.participantId)

    return StreamingResponse(
        stream_openrouter_suggestions(session, payload),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


app.include_router(api)
