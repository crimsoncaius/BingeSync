from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from typing import Any, Literal
from urllib.parse import quote
from uuid import uuid4

import httpx
from fastapi import APIRouter, Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field


def _load_env_files() -> None:
    """Load `.env` from repo root or backend (do not override existing OS env)."""
    for base in (
        Path(__file__).resolve().parent.parent.parent,
        Path(__file__).resolve().parent.parent,
    ):
        path = base / ".env"
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


_load_env_files()
GOOGLE_PLACES_API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")


SessionStatus = Literal["waiting", "collecting", "rating", "results"]
MIN_PARTICIPANTS = 2
MAX_PARTICIPANTS_CAP = 10
DEFAULT_MAX_PARTICIPANTS = MIN_PARTICIPANTS
JOIN_CODE_LENGTH = 6
SCORE_PENALTY_MULTIPLIER = 0.4


class ParticipantResponse(BaseModel):
    id: str
    label: str


class FoodOptionResponse(BaseModel):
    id: str
    name: str
    addedBy: str
    address: str | None = None
    googlePlaceId: str | None = None
    rating: float | None = None
    userRatingCount: int | None = None
    priceLevel: str | None = None
    phone: str | None = None
    websiteUri: str | None = None
    googleMapsUri: str | None = None
    openNow: bool | None = None
    photoUrl: str | None = None


class SessionResponse(BaseModel):
    sessionId: str
    joinCode: str
    status: SessionStatus
    participants: list[ParticipantResponse]
    options: list[FoodOptionResponse]
    ratings: dict[str, dict[str, int]]
    selectionDone: dict[str, bool]
    maxParticipants: int
    isReadyForResults: bool
    usedGooglePlaceIds: list[str]


class SessionCreateResponse(BaseModel):
    session: SessionResponse
    participantId: str


class CreateSessionRequest(BaseModel):
    name: str | None = Field(default=None, max_length=40)
    maxParticipants: int = Field(
        default=DEFAULT_MAX_PARTICIPANTS,
        ge=MIN_PARTICIPANTS,
        le=MAX_PARTICIPANTS_CAP,
    )


class JoinSessionRequest(BaseModel):
    joinCode: str = Field(min_length=JOIN_CODE_LENGTH, max_length=JOIN_CODE_LENGTH)
    name: str | None = Field(default=None, max_length=40)


class AddOptionRequest(BaseModel):
    participantId: str
    name: str = Field(min_length=2, max_length=80)
    placeId: str | None = Field(default=None, max_length=256)


class EnrichSuggestionsRequest(BaseModel):
    placeIds: list[str] = Field(default_factory=list, max_length=24)


class RatingEntry(BaseModel):
    optionId: str
    score: int = Field(ge=1, le=10)


class SubmitRatingsRequest(BaseModel):
    participantId: str
    ratings: list[RatingEntry]


class SelectionDoneRequest(BaseModel):
    participantId: str
    done: bool = True


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
    address: str | None = None
    google_place_id: str | None = None
    rating: float | None = None
    user_rating_count: int | None = None
    price_level_label: str | None = None
    phone: str | None = None
    website_uri: str | None = None
    google_maps_uri: str | None = None
    open_now: bool | None = None
    # First Places API photo resource name (places/.../photos/...).
    photo_media_name: str | None = None


@dataclass
class SessionRecord:
    session_id: str
    join_code: str
    created_at: datetime
    participants: list[Participant]
    options: list[FoodOption]
    ratings: dict[str, dict[str, int]]
    selection_done: dict[str, bool]
    max_participants: int = DEFAULT_MAX_PARTICIPANTS


SESSIONS: dict[str, SessionRecord] = {}
JOIN_CODES: dict[str, str] = {}
STORE_LOCK = Lock()

_sse_consumers: dict[str, set[tuple[asyncio.Queue[str], str | None]]] = {}
_event_loop: asyncio.AbstractEventLoop | None = None


def normalize_name(value: str) -> str:
    return " ".join(value.lower().split())


def normalize_google_place_id(place_id: str | None) -> str | None:
    """Canonical form for comparing Places API ids (e.g. ChIJ… vs places/ChIJ…)."""
    if place_id is None:
        return None
    raw = str(place_id).strip()
    if not raw:
        return None
    if raw.startswith("places/"):
        raw = raw[len("places/") :]
    return raw.strip() or None


def collect_used_google_place_ids(session: SessionRecord) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for option in session.options:
        key = normalize_google_place_id(option.google_place_id)
        if key and key not in seen:
            seen.add(key)
            ordered.append(key)
    return ordered


def unique_normalized_for_participant(
    session: SessionRecord,
    participant_id: str,
    base_normalized: str,
) -> str:
    """Ensure each participant can add multiple picks even when names normalize the same.

    Previously we deduped globally on normalized name, so a second 'Starbucks' (or the same
    dish as your partner) silently did not add a row — it looked like only one pick worked.
    """
    normalized_name = base_normalized
    while any(
        option.normalized_name == normalized_name and option.added_by == participant_id
        for option in session.options
    ):
        normalized_name = f"{base_normalized}::{create_identifier()}"

    return normalized_name


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
    """True when every current participant has rated every option (results step)."""
    if len(session.participants) < MIN_PARTICIPANTS or not session.options:
        return False

    option_ids = {option.id for option in session.options}

    for participant in session.participants:
        participant_ratings = session.ratings.get(participant.id, {})
        if option_ids - participant_ratings.keys():
            return False

    return True


def all_participants_finished_selection(session: SessionRecord) -> bool:
    if not session.participants:
        return False
    return all(session.selection_done.get(p.id, False) for p in session.participants)


def ready_for_rating_phase(session: SessionRecord) -> bool:
    """
    The group can move to rating when at least MIN_PARTICIPANTS people are present,
    there is at least one combined option, and everyone currently in the room has
    finished their private list (even if the room is not full).
    """
    if len(session.participants) < MIN_PARTICIPANTS:
        return False
    if not session.options:
        return False
    return all_participants_finished_selection(session)


def session_status(session: SessionRecord) -> SessionStatus:
    if has_full_ratings(session):
        return "results"
    if ready_for_rating_phase(session):
        return "rating"
    if len(session.participants) < session.max_participants:
        return "waiting"
    return "collecting"


def _photo_proxy_url(photo_media_name: str | None) -> str | None:
    if not photo_media_name or not str(photo_media_name).strip():
        return None
    return f"/api/places/photo?name={quote(str(photo_media_name).strip(), safe='')}"


def serialize_session(session: SessionRecord, viewer_participant_id: str | None = None) -> SessionResponse:
    status = session_status(session)
    participants = [
        ParticipantResponse(id=participant.id, label=participant.label)
        for participant in session.participants
    ]
    all_options = [
        FoodOptionResponse(
            id=option.id,
            name=option.name,
            addedBy=option.added_by,
            address=option.address,
            googlePlaceId=option.google_place_id,
            rating=option.rating,
            userRatingCount=option.user_rating_count,
            priceLevel=option.price_level_label,
            phone=option.phone,
            websiteUri=option.website_uri,
            googleMapsUri=option.google_maps_uri,
            openNow=option.open_now,
            photoUrl=_photo_proxy_url(option.photo_media_name),
        )
        for option in session.options
    ]

    # Private lists as soon as more than one person is in the room (waiting or collecting).
    # Solo host still sees their own options only via all_options (same set).
    if (
        viewer_participant_id
        and status in ("waiting", "collecting")
        and len(session.participants) > 1
    ):
        options = [option for option in all_options if option.addedBy == viewer_participant_id]
    else:
        options = all_options

    selection_done = {
        participant.id: session.selection_done.get(participant.id, False)
        for participant in session.participants
    }

    return SessionResponse(
        sessionId=session.session_id,
        joinCode=session.join_code,
        status=status,
        participants=participants,
        options=options,
        ratings=session.ratings,
        selectionDone=selection_done,
        maxParticipants=session.max_participants,
        isReadyForResults=has_full_ratings(session),
        usedGooglePlaceIds=collect_used_google_place_ids(session),
    )


def _broadcast(session: SessionRecord) -> None:
    consumers = _sse_consumers.get(session.session_id)
    if not consumers or _event_loop is None:
        return
    for q, viewer_id in list(consumers):
        payload = serialize_session(session, viewer_id).model_dump_json()
        _event_loop.call_soon_threadsafe(q.put_nowait, payload)


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


@app.on_event("startup")
async def _capture_event_loop() -> None:
    global _event_loop
    _event_loop = asyncio.get_running_loop()


@api.get("/health")
def healthcheck() -> dict[str, bool | str]:
    return {
        "status": "ok",
    }


@api.post("/sessions", response_model=SessionCreateResponse)
def create_session(
    payload: CreateSessionRequest = Body(default_factory=CreateSessionRequest),
) -> SessionCreateResponse:
    with STORE_LOCK:
        session_id = create_identifier()
        participant_id = create_identifier()
        join_code = create_join_code()
        participant_label = clean_display_name(payload.name, "User 1")

        session = SessionRecord(
            session_id=session_id,
            join_code=join_code,
            created_at=now_utc(),
            participants=[Participant(id=participant_id, label=participant_label)],
            options=[],
            ratings={participant_id: {}},
            selection_done={participant_id: False},
            max_participants=payload.maxParticipants,
        )
        SESSIONS[session_id] = session
        JOIN_CODES[join_code] = session_id

    return SessionCreateResponse(
        session=serialize_session(session, participant_id),
        participantId=participant_id,
    )


@api.post("/sessions/join", response_model=SessionCreateResponse)
def join_session(payload: JoinSessionRequest) -> SessionCreateResponse:
    join_code = payload.joinCode.strip().upper()

    with STORE_LOCK:
        session_id = JOIN_CODES.get(join_code)

        if session_id is None:
            raise HTTPException(status_code=404, detail="Join code not found")

        session = get_session_or_404(session_id)

        room_phase = session_status(session)
        if room_phase == "rating":
            raise HTTPException(
                status_code=400,
                detail="This room is already rating—joining is closed. Start a new session when this one wraps up.",
            )
        if room_phase == "results":
            raise HTTPException(
                status_code=400,
                detail="This session has finished—joining is closed.",
            )

        if len(session.participants) >= session.max_participants:
            raise HTTPException(status_code=400, detail="Session is full")

        participant_id = create_identifier()
        participant_label = clean_display_name(
            payload.name,
            f"User {len(session.participants) + 1}",
        )
        session.participants.append(Participant(id=participant_id, label=participant_label))
        session.ratings.setdefault(participant_id, {})
        # Everyone must get a private picking round. Clears any "done" set solo
        # (API allowed it while status was still waiting) so the room cannot jump to rating.
        for participant in session.participants:
            session.selection_done[participant.id] = False

    _broadcast(session)
    return SessionCreateResponse(
        session=serialize_session(session, participant_id),
        participantId=participant_id,
    )


@api.get("/sessions/{session_ref}", response_model=SessionResponse)
def get_session(
    session_ref: str,
    participantId: str | None = Query(default=None),
) -> SessionResponse:
    return serialize_session(resolve_session_or_404(session_ref), participantId)


PLACE_DETAILS_FIELD_MASK = (
    "id,displayName,formattedAddress,rating,userRatingCount,priceLevel,"
    "websiteUri,googleMapsUri,nationalPhoneNumber,regularOpeningHours,types,photos"
)

# Lighter mask for autocomplete enrichment (ratings only).
SUGGESTION_ENRICH_FIELD_MASK = "rating,userRatingCount"


def _format_price_level(value: str | int | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, int):
        by_num = {
            0: "Free",
            1: "$",
            2: "$$",
            3: "$$$",
            4: "$$$$",
        }
        return by_num.get(value)
    mapping = {
        "PRICE_LEVEL_FREE": "Free",
        "PRICE_LEVEL_INEXPENSIVE": "$",
        "PRICE_LEVEL_MODERATE": "$$",
        "PRICE_LEVEL_EXPENSIVE": "$$$",
        "PRICE_LEVEL_VERY_EXPENSIVE": "$$$$",
    }
    return mapping.get(value, str(value).replace("PRICE_LEVEL_", "").replace("_", " ").title())


def _place_id_path_segment(place_id: str) -> str:
    return quote(place_id.removeprefix("places/"), safe="")


def _google_places_photo_media_url(photo_resource_name: str) -> str:
    """Places Photo (New) expects path segments: /v1/places/{id}/photos/{ref}/media — not %2F-encoded slashes."""
    parts = [p for p in photo_resource_name.strip().split("/") if p]
    if not parts:
        raise ValueError("empty photo resource name")
    encoded = "/".join(quote(p, safe="") for p in parts)
    return f"https://places.googleapis.com/v1/{encoded}/media"


async def fetch_google_place_details(
    place_id: str,
    field_mask: str | None = None,
) -> dict[str, Any] | None:
    if not GOOGLE_PLACES_API_KEY or not place_id.strip():
        return None
    raw_id = place_id.strip()
    mask = field_mask if field_mask is not None else PLACE_DETAILS_FIELD_MASK
    url = f"https://places.googleapis.com/v1/places/{_place_id_path_segment(raw_id)}"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                url,
                headers={
                    "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
                    "X-Goog-FieldMask": mask,
                },
                timeout=8.0,
            )
        if resp.status_code != 200:
            return None
        return resp.json()
    except Exception:
        return None


async def _fetch_suggestion_enrichment(place_id: str) -> dict[str, object]:
    """Rating and review count for autocomplete rows."""
    details = await fetch_google_place_details(place_id, SUGGESTION_ENRICH_FIELD_MASK)
    if not details:
        return {}
    out: dict[str, object] = {}
    rating = details.get("rating")
    if rating is not None:
        try:
            out["rating"] = float(rating)
        except (TypeError, ValueError):
            pass
    urc = details.get("userRatingCount")
    if urc is not None:
        try:
            out["userRatingCount"] = int(urc)
        except (TypeError, ValueError):
            pass
    return out


@api.get("/places/photo")
async def place_photo_media(
    name: str = Query(
        ...,
        min_length=3,
        description="Photo resource name from Places API (places/.../photos/...).",
    ),
) -> Response:
    """Proxy Google Places photo media so the browser never needs the Places API key."""
    if not GOOGLE_PLACES_API_KEY:
        raise HTTPException(status_code=503, detail="Places API not configured")
    trimmed = name.strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Missing photo name")
    try:
        media_url = _google_places_photo_media_url(trimmed)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid photo name") from None
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                media_url,
                params={"maxHeightPx": 800, "maxWidthPx": 800},
                headers={"X-Goog-Api-Key": GOOGLE_PLACES_API_KEY},
                timeout=20.0,
                follow_redirects=True,
            )
    except Exception:
        raise HTTPException(status_code=502, detail="Photo fetch failed") from None
    if resp.status_code != 200:
        raise HTTPException(status_code=404, detail="Photo not available")
    media_type = resp.headers.get("content-type", "image/jpeg")
    return Response(content=resp.content, media_type=media_type)


def _details_to_option_fields(details: dict[str, Any]) -> dict[str, Any]:
    display_name = (details.get("displayName") or {}).get("text")
    rating = details.get("rating")
    if rating is not None:
        try:
            rating = float(rating)
        except (TypeError, ValueError):
            rating = None
    urc = details.get("userRatingCount")
    if urc is not None:
        try:
            urc = int(urc)
        except (TypeError, ValueError):
            urc = None
    hours = details.get("regularOpeningHours") or {}
    open_now = hours.get("openNow")
    if open_now is not None and not isinstance(open_now, bool):
        open_now = None
    photo_media_name: str | None = None
    photos = details.get("photos") or []
    if isinstance(photos, list) and photos:
        first = photos[0]
        if isinstance(first, dict):
            raw_name = first.get("name")
            if isinstance(raw_name, str) and raw_name.strip():
                photo_media_name = raw_name.strip()
    return {
        "name": display_name,
        "address": details.get("formattedAddress"),
        "google_place_id": details.get("id"),
        "rating": rating,
        "user_rating_count": urc,
        "price_level_label": _format_price_level(details.get("priceLevel")),
        "phone": details.get("nationalPhoneNumber"),
        "website_uri": details.get("websiteUri"),
        "google_maps_uri": details.get("googleMapsUri"),
        "open_now": open_now,
        "photo_media_name": photo_media_name,
    }


@api.post("/sessions/{session_id}/options", response_model=SessionResponse)
async def create_option(session_id: str, payload: AddOptionRequest) -> SessionResponse:
    session = get_session_or_404(session_id)
    require_participant(session, payload.participantId)

    if session_status(session) in ("rating", "results"):
        raise HTTPException(
            status_code=400,
            detail="Cannot add options after the rating round has started",
        )

    candidate_name = " ".join(payload.name.split())
    base_normalized = normalize_name(candidate_name)

    if not base_normalized:
        raise HTTPException(status_code=400, detail="Food option cannot be blank")

    place_id = (payload.placeId or "").strip() or None
    details_payload: dict[str, Any] | None = None
    if place_id:
        details_payload = await fetch_google_place_details(place_id)

    option_kwargs: dict[str, Any] = {}
    if details_payload:
        fields = _details_to_option_fields(details_payload)
        resolved_name = fields.get("name") or candidate_name
        candidate_name = " ".join(resolved_name.split())
        base_normalized = normalize_name(candidate_name)
        if not base_normalized:
            raise HTTPException(status_code=400, detail="Food option cannot be blank")
        option_kwargs = {
            "address": fields.get("address"),
            "google_place_id": fields.get("google_place_id") or place_id,
            "rating": fields.get("rating"),
            "user_rating_count": fields.get("user_rating_count"),
            "price_level_label": fields.get("price_level_label"),
            "phone": fields.get("phone"),
            "website_uri": fields.get("website_uri"),
            "google_maps_uri": fields.get("google_maps_uri"),
            "open_now": fields.get("open_now"),
            "photo_media_name": fields.get("photo_media_name"),
        }
    elif place_id:
        option_kwargs = {"google_place_id": place_id}

    incoming_place_key: str | None = None
    if option_kwargs.get("google_place_id"):
        incoming_place_key = normalize_google_place_id(str(option_kwargs["google_place_id"]))
    elif place_id:
        incoming_place_key = normalize_google_place_id(place_id)

    with STORE_LOCK:
        if incoming_place_key and any(
            normalize_google_place_id(option.google_place_id) == incoming_place_key
            for option in session.options
        ):
            raise HTTPException(
                status_code=400,
                detail="This place is already in the pool.",
            )

        normalized_name = unique_normalized_for_participant(
            session,
            payload.participantId,
            base_normalized,
        )

        session.options.append(
            FoodOption(
                id=create_identifier(),
                name=candidate_name,
                normalized_name=normalized_name,
                added_by=payload.participantId,
                **option_kwargs,
            )
        )

        session.selection_done[payload.participantId] = False

    _broadcast(session)
    return serialize_session(session, payload.participantId)


@api.delete("/sessions/{session_id}/options/{option_id}", response_model=SessionResponse)
def remove_option(
    session_id: str,
    option_id: str,
    participant_id: str = Query(..., alias="participantId"),
) -> SessionResponse:
    session = get_session_or_404(session_id)
    require_participant(session, participant_id)

    if session_status(session) in ("rating", "results"):
        raise HTTPException(
            status_code=400,
            detail="Cannot remove options after the rating round has started",
        )

    with STORE_LOCK:
        index: int | None = None
        for i, option in enumerate(session.options):
            if option.id == option_id:
                index = i
                break

        if index is None:
            raise HTTPException(status_code=404, detail="Option not found")

        target = session.options[index]
        if target.added_by != participant_id:
            raise HTTPException(status_code=403, detail="You can only remove options you added")

        session.options.pop(index)

        for ratings_row in session.ratings.values():
            ratings_row.pop(option_id, None)

        session.selection_done[participant_id] = False

    _broadcast(session)
    return serialize_session(session, participant_id)


@api.post("/sessions/{session_id}/selection/done", response_model=SessionResponse)
def mark_selection_done(session_id: str, payload: SelectionDoneRequest) -> SessionResponse:
    session = get_session_or_404(session_id)
    require_participant(session, payload.participantId)

    if session_status(session) in ("rating", "results"):
        raise HTTPException(
            status_code=400,
            detail="Selection is already locked for this session",
        )

    with STORE_LOCK:
        if payload.done:
            my_options = [option for option in session.options if option.added_by == payload.participantId]
            if not my_options:
                raise HTTPException(
                    status_code=400,
                    detail="Add at least one option before you finish choosing",
                )

        session.selection_done[payload.participantId] = payload.done

    _broadcast(session)
    return serialize_session(session, payload.participantId)


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

    _broadcast(session)
    return serialize_session(session, payload.participantId)


@api.get("/sessions/{session_id}/results", response_model=ResultsResponse)
def get_results(session_id: str) -> ResultsResponse:
    session = get_session_or_404(session_id)

    if not has_full_ratings(session):
        return ResultsResponse(
            ready=False,
            results=[],
            reason="All participants must rate every option before results are available.",
        )

    return ResultsResponse(ready=True, results=compute_results(session))


@api.get("/sessions/{session_id}/events")
async def session_events(
    session_id: str,
    participantId: str | None = Query(default=None),
) -> StreamingResponse:
    session = get_session_or_404(session_id)
    queue: asyncio.Queue[str] = asyncio.Queue()
    consumer_entry = (queue, participantId)
    _sse_consumers.setdefault(session_id, set()).add(consumer_entry)
    initial = serialize_session(session, participantId).model_dump_json()

    async def _generate():
        try:
            yield f"data: {initial}\n\n"
            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            consumers = _sse_consumers.get(session_id)
            if consumers:
                consumers.discard(consumer_entry)
                if not consumers:
                    del _sse_consumers[session_id]

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


FOOD_PLACE_TYPES = frozenset({
    "food",
    "restaurant",
    "cafe",
    "bakery",
    "bar",
    "meal_delivery",
    "meal_takeaway",
    "fast_food",
    "ice_cream_shop",
    "sandwich_shop",
    "pizza_restaurant",
    "coffee_shop",
    "breakfast_restaurant",
    "brunch_restaurant",
    "chinese_restaurant",
    "indian_restaurant",
    "italian_restaurant",
    "japanese_restaurant",
    "korean_restaurant",
    "mexican_restaurant",
    "seafood_restaurant",
    "thai_restaurant",
    "vietnamese_restaurant",
    "steak_house",
    "sushi_restaurant",
    "vegan_restaurant",
    "vegetarian_restaurant",
})


def _best_food_type(types: list[str]) -> str | None:
    """Return the most descriptive food-related type from a prediction's types list."""
    for t in types:
        if t in FOOD_PLACE_TYPES and t not in ("food", "establishment"):
            return t
    if "food" in types:
        return "food"
    return None


@api.get("/suggestions")
async def get_suggestions(q: str = ""):
    query = q.strip()
    if not query or not GOOGLE_PLACES_API_KEY:
        return []

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://places.googleapis.com/v1/places:autocomplete",
                headers={
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
                    "X-Goog-FieldMask": (
                        "suggestions.placePrediction.placeId,"
                        "suggestions.placePrediction.text,"
                        "suggestions.placePrediction.structuredFormat,"
                        "suggestions.placePrediction.types"
                    ),
                },
                json={
                    "input": query,
                    "languageCode": "en",
                    "includeQueryPredictions": False,
                    "includedPrimaryTypes": [
                        "restaurant",
                        "cafe",
                        "bakery",
                        "bar",
                        "meal_takeaway",
                    ],
                    "locationBias": {
                        "circle": {
                            "center": {"latitude": 1.3521, "longitude": 103.8198},
                            "radius": 20000.0,
                        }
                    },
                },
                timeout=5.0,
            )
            data = resp.json()

        if resp.status_code != 200:
            return []

        results: list[dict[str, object]] = []
        for item in data.get("suggestions", []):
            pp = item.get("placePrediction")
            if not pp:
                continue
            types = pp.get("types") or []
            structured = pp.get("structuredFormat") or {}
            main_text = (structured.get("mainText") or {}).get("text") or ""
            secondary_text = (structured.get("secondaryText") or {}).get("text") or ""
            if not main_text:
                main_text = (pp.get("text") or {}).get("text") or ""
            food_type = _best_food_type(types) or "restaurant"
            results.append({
                "placeId": pp.get("placeId") or "",
                "name": main_text,
                "address": secondary_text,
                "types": types,
                "foodType": food_type,
            })

        return results[:8]
    except Exception:
        return []


@api.post("/suggestions/enrich")
async def enrich_suggestions(payload: EnrichSuggestionsRequest) -> dict[str, dict[str, float | int]]:
    """Lazy-load Google ratings for autocomplete rows (after fast autocomplete)."""
    if not GOOGLE_PLACES_API_KEY:
        return {}

    seen: set[str] = set()
    unique: list[str] = []
    for raw in payload.placeIds:
        pid = (raw or "").strip()
        if not pid or pid in seen:
            continue
        seen.add(pid)
        unique.append(pid)
        if len(unique) >= 24:
            break

    if not unique:
        return {}

    enriched = await asyncio.gather(*[_fetch_suggestion_enrichment(pid) for pid in unique])
    out: dict[str, dict[str, float | int]] = {}
    for pid, extra in zip(unique, enriched):
        if not extra:
            continue
        row: dict[str, float | int] = {}
        rating = extra.get("rating")
        if rating is not None:
            try:
                row["rating"] = float(rating)
            except (TypeError, ValueError):
                pass
        urc = extra.get("userRatingCount")
        if urc is not None:
            try:
                row["userRatingCount"] = int(urc)
            except (TypeError, ValueError):
                pass
        if row:
            out[pid] = row
    return out


app.include_router(api)
