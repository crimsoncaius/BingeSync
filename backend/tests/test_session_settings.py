"""Tests for room creation settings: title and picks-per-person cap."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient


def _assert_validation_error(response: Any) -> None:
    assert response.status_code == 422
    body = response.json()
    assert "detail" in body


def test_create_session_default_settings(client: TestClient) -> None:
    response = client.post("/api/sessions", json={"maxParticipants": 2})
    assert response.status_code == 200
    session = response.json()["session"]
    assert session.get("title") is None
    assert session.get("maxPicksPerParticipant") is None
    assert session.get("searchBias") is None


def test_create_session_stores_search_bias(client: TestClient) -> None:
    response = client.post(
        "/api/sessions",
        json={
            "maxParticipants": 2,
            "searchBiasLatitude": 40.7128,
            "searchBiasLongitude": -74.006,
            "searchBiasLabel": "New York",
        },
    )
    assert response.status_code == 200
    bias = response.json()["session"]["searchBias"]
    assert bias is not None
    assert bias["latitude"] == 40.7128
    assert bias["longitude"] == -74.006
    assert bias["label"] == "New York"


def test_create_session_rejects_search_bias_latitude_only(client: TestClient) -> None:
    response = client.post(
        "/api/sessions",
        json={"maxParticipants": 2, "searchBiasLatitude": 1.0},
    )
    assert response.status_code == 400


def test_join_inherits_search_bias(client: TestClient) -> None:
    created = client.post(
        "/api/sessions",
        json={
            "maxParticipants": 2,
            "searchBiasLatitude": 51.5,
            "searchBiasLongitude": -0.12,
            "searchBiasLabel": "London",
        },
    ).json()
    code = created["session"]["joinCode"]
    joined = client.post(
        "/api/sessions/join",
        json={"joinCode": code, "name": "Alex"},
    )
    assert joined.status_code == 200
    bias = joined.json()["session"]["searchBias"]
    assert bias["latitude"] == 51.5
    assert bias["label"] == "London"


def test_create_session_stores_and_trims_title(client: TestClient) -> None:
    response = client.post(
        "/api/sessions",
        json={"maxParticipants": 2, "title": "  Friday dinner  "},
    )
    assert response.status_code == 200
    assert response.json()["session"]["title"] == "Friday dinner"


def test_create_session_empty_title_becomes_null(client: TestClient) -> None:
    response = client.post(
        "/api/sessions",
        json={"maxParticipants": 2, "title": "   "},
    )
    assert response.status_code == 200
    assert response.json()["session"]["title"] is None


def test_create_session_max_picks(client: TestClient) -> None:
    response = client.post(
        "/api/sessions",
        json={"maxParticipants": 3, "maxPicksPerParticipant": 7},
    )
    assert response.status_code == 200
    session = response.json()["session"]
    assert session["maxPicksPerParticipant"] == 7


def test_create_session_rejects_max_picks_below_one(client: TestClient) -> None:
    response = client.post(
        "/api/sessions",
        json={"maxParticipants": 2, "maxPicksPerParticipant": 0},
    )
    _assert_validation_error(response)


def test_create_session_rejects_max_picks_above_cap(client: TestClient) -> None:
    response = client.post(
        "/api/sessions",
        json={"maxParticipants": 2, "maxPicksPerParticipant": 26},
    )
    _assert_validation_error(response)


def test_join_inherits_room_settings(client: TestClient) -> None:
    created = client.post(
        "/api/sessions",
        json={
            "maxParticipants": 2,
            "title": "Team lunch",
            "maxPicksPerParticipant": 3,
        },
    ).json()
    code = created["session"]["joinCode"]

    joined = client.post(
        "/api/sessions/join",
        json={"joinCode": code, "name": "Alex"},
    )
    assert joined.status_code == 200
    session = joined.json()["session"]
    assert session["title"] == "Team lunch"
    assert session["maxPicksPerParticipant"] == 3


def test_pick_limit_blocks_extra_options(client: TestClient) -> None:
    created = client.post(
        "/api/sessions",
        json={"maxParticipants": 2, "maxPicksPerParticipant": 2},
    ).json()
    sid = created["session"]["sessionId"]
    pid = created["participantId"]

    for i in range(2):
        r = client.post(
            f"/api/sessions/{sid}/options",
            json={"participantId": pid, "name": f"Place {i} aa"},
        )
        assert r.status_code == 200, r.text

    overflow = client.post(
        f"/api/sessions/{sid}/options",
        json={"participantId": pid, "name": "Too many bb"},
    )
    assert overflow.status_code == 400
    assert "at most" in overflow.json()["detail"].lower()


def test_pick_limit_not_enforced_when_unset(client: TestClient) -> None:
    created = client.post("/api/sessions", json={"maxParticipants": 2}).json()
    sid = created["session"]["sessionId"]
    pid = created["participantId"]

    for i in range(6):
        r = client.post(
            f"/api/sessions/{sid}/options",
            json={"participantId": pid, "name": f"Spot {i} cc"},
        )
        assert r.status_code == 200, r.text


def test_two_of_four_can_enter_rating_when_both_done(client: TestClient) -> None:
    host = client.post("/api/sessions", json={"maxParticipants": 4}).json()
    code = host["session"]["joinCode"]
    sid = host["session"]["sessionId"]
    host_pid = host["participantId"]

    guest = client.post(
        "/api/sessions/join",
        json={"joinCode": code, "name": "Guest"},
    ).json()
    guest_pid = guest["participantId"]

    for pid, name in (
        (host_pid, "Host pick dd"),
        (guest_pid, "Guest pick ee"),
    ):
        assert client.post(
            f"/api/sessions/{sid}/options",
            json={"participantId": pid, "name": name},
        ).status_code == 200

    assert client.post(
        f"/api/sessions/{sid}/selection/done",
        json={"participantId": host_pid, "done": True},
    ).status_code == 200
    assert client.post(
        f"/api/sessions/{sid}/selection/done",
        json={"participantId": guest_pid, "done": True},
    ).status_code == 200

    state = client.get(
        f"/api/sessions/{sid}",
        params={"participantId": host_pid},
    ).json()
    assert state["status"] == "rating"
    assert len(state["participants"]) == 2


def test_two_person_room_enters_rating_when_both_done(client: TestClient) -> None:
    host = client.post("/api/sessions", json={"maxParticipants": 2}).json()
    code = host["session"]["joinCode"]
    sid = host["session"]["sessionId"]
    host_pid = host["participantId"]

    guest = client.post(
        "/api/sessions/join",
        json={"joinCode": code, "name": "Buddy"},
    ).json()
    guest_pid = guest["participantId"]

    client.post(
        f"/api/sessions/{sid}/options",
        json={"participantId": host_pid, "name": "A ii"},
    )
    client.post(
        f"/api/sessions/{sid}/options",
        json={"participantId": guest_pid, "name": "B jj"},
    )
    client.post(
        f"/api/sessions/{sid}/selection/done",
        json={"participantId": host_pid, "done": True},
    )
    client.post(
        f"/api/sessions/{sid}/selection/done",
        json={"participantId": guest_pid, "done": True},
    )

    state = client.get(
        f"/api/sessions/{sid}",
        params={"participantId": host_pid},
    ).json()
    assert state["status"] == "rating"
