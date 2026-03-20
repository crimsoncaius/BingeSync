from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from threading import Lock
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


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


class RatingEntry(BaseModel):
    optionId: str
    score: int = Field(ge=1, le=10)


class SubmitRatingsRequest(BaseModel):
    participantId: str
    ratings: list[RatingEntry]


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


app.include_router(api)
