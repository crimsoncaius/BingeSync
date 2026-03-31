"""Tests for result ranking and ties (competition rank on finalScore)."""

from __future__ import annotations

from datetime import UTC, datetime

from app.main import FoodOption, Participant, SessionRecord, compute_results


def _session_with_ratings(
    ratings: dict[str, dict[str, int]],
) -> SessionRecord:
    return SessionRecord(
        session_id="s1",
        join_code="ABC123",
        created_at=datetime.now(UTC),
        participants=[
            Participant(id="p1", label="a"),
            Participant(id="p2", label="b"),
        ],
        options=[
            FoodOption(id="o1", name="One", normalized_name="one", added_by="p1"),
            FoodOption(id="o2", name="Two", normalized_name="two", added_by="p1"),
            FoodOption(id="o3", name="Three", normalized_name="three", added_by="p1"),
        ],
        ratings=ratings,
        selection_done={"p1": True, "p2": True},
    )


def test_compute_results_tie_for_first_shares_rank_one() -> None:
    s = _session_with_ratings(
        {
            "p1": {"o1": 8, "o2": 8, "o3": 5},
            "p2": {"o1": 8, "o2": 8, "o3": 5},
        }
    )
    out = compute_results(s)
    by_id = {r.optionId: r for r in out}
    assert by_id["o1"].rank == 1
    assert by_id["o2"].rank == 1
    assert by_id["o3"].rank == 3
    assert by_id["o1"].finalScore == by_id["o2"].finalScore


def test_compute_results_competition_rank_skips_after_tie() -> None:
    s = _session_with_ratings(
        {
            "p1": {"o1": 10, "o2": 9, "o3": 9},
            "p2": {"o1": 10, "o2": 9, "o3": 9},
        }
    )
    out = compute_results(s)
    ranks = [r.rank for r in out]
    assert ranks == [1, 2, 2]
