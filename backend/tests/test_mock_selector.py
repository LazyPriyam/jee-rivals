import math
import time
from collections import Counter
import pytest

from backend.app.database import get_connection
from backend.app.tools.mock_selector import (
    select_mock_and_room_questions,
    compute_exam_tier_targets,
    _pick_from_chapters_weighted,
    get_all_questions_cached,
    _normalize_subject,
    _get_verified_pool,
    _build_passage_groups,
    distribute_weighted_counts,
    normalize_chapter_name
)


@pytest.fixture(scope="module")
def db_cursor():
    conn = get_connection()
    cursor = conn.cursor()
    yield cursor
    conn.close()


def test_compute_exam_tier_targets():
    """Verify largest remainder math preserves 40/45/15 ratio and sums exactly to target_count."""
    # 75 Qs across 3 subjects
    r75 = compute_exam_tier_targets(75, ["Physics", "Chemistry", "Mathematics"], is_jee_advanced=False)
    totals75 = {"ANCHOR": 0, "FRONTIER": 0, "PEAK": 0}
    for s, td in r75.items():
        assert sum(td.values()) == 25, f"Subject {s} should have 25 questions"
        for k, v in td.items():
            totals75[k] += v
    assert totals75["ANCHOR"] == 30, f"Expected 30 Easy, got {totals75['ANCHOR']}"
    assert totals75["FRONTIER"] == 34, f"Expected 34 Medium, got {totals75['FRONTIER']}"
    assert totals75["PEAK"] == 11, f"Expected 11 Hard, got {totals75['PEAK']}"

    # 5 Qs
    r5 = compute_exam_tier_targets(5, ["Physics"], is_jee_advanced=False)
    assert r5["Physics"] == {"ANCHOR": 2, "FRONTIER": 2, "PEAK": 1}

    # 10 Qs
    r10 = compute_exam_tier_targets(10, ["Physics"], is_jee_advanced=False)
    assert r10["Physics"] == {"ANCHOR": 4, "FRONTIER": 5, "PEAK": 1}

    # 25 Qs
    r25 = compute_exam_tier_targets(25, ["Physics"], is_jee_advanced=False)
    assert r25["Physics"] == {"ANCHOR": 10, "FRONTIER": 11, "PEAK": 4}


def test_jee_main_75q_strict_distribution(db_cursor):
    """Verify that a full 75Q mock generates exactly 30 Easy (40%), 34 Medium (45.3%), 11 Hard (14.7%)."""
    qs = select_mock_and_room_questions(
        cursor=db_cursor,
        target_count=75,
        target_exam="MAIN",
        mode="MOCK_TEST"
    )
    assert len(qs) == 75, f"Expected 75 questions, got {len(qs)}"

    tiers = Counter((q.get("difficulty_tier") or "").upper() for q in qs)
    assert tiers["EASY"] == 30, f"Expected 30 Easy, got {tiers['EASY']}"
    assert tiers["MEDIUM"] == 34, f"Expected 34 Medium, got {tiers['MEDIUM']}"
    assert tiers["HARD"] == 11, f"Expected 11 Hard, got {tiers['HARD']}"

    # Verify per-subject section balance
    for s in ["Physics", "Chemistry", "Mathematics"]:
        sqs = [q for q in qs if q.get("subject") == s]
        assert len(sqs) == 25, f"Subject {s} must have exactly 25 questions"
        scqs = [q for q in sqs if q.get("question_type") == "SINGLE_CHOICE"]
        nvqs = [q for q in sqs if q.get("question_type") == "NUMERICAL"]
        assert len(scqs) == 20, f"Subject {s} Section A must have 20 SCQs"
        assert len(nvqs) == 5, f"Subject {s} Section B must have 5 NVQs"


def test_custom_small_test_distribution(db_cursor):
    """Verify that custom small tests proportionally allocate difficulty."""
    # 5 questions in 1 chapter
    qs5 = select_mock_and_room_questions(
        cursor=db_cursor,
        target_count=5,
        filter_chapters=["Electrostatics"],
        target_exam="MAIN",
        mode="MOCK_TEST"
    )
    assert len(qs5) == 5
    t5 = Counter((q.get("difficulty_tier") or "").upper() for q in qs5)
    assert t5["EASY"] == 2
    assert t5["MEDIUM"] == 2
    assert t5["HARD"] == 1

    # 10 questions in 2 chapters
    qs10 = select_mock_and_room_questions(
        cursor=db_cursor,
        target_count=10,
        filter_chapters=["Electrostatics", "Current Electricity"],
        target_exam="MAIN",
        mode="MOCK_TEST"
    )
    assert len(qs10) == 10
    t10 = Counter((q.get("difficulty_tier") or "").upper() for q in qs10)
    assert t10["EASY"] == 4
    assert t10["MEDIUM"] == 5
    assert t10["HARD"] == 1


def test_recycling_least_seen_distant_past(db_cursor):
    """
    Verify that when all questions of a tier are seen, the selector pulls least-seen
    questions from the most distant past without compromising tier percentages.
    """
    all_cached = get_all_questions_cached(cursor=db_cursor)
    passage_groups = _build_passage_groups(all_cached)
    p_raw = [q for q in all_cached if _normalize_subject(q.get("subject")) == "Physics"]
    p_pool = _get_verified_pool(p_raw)

    sim_seen_counts = {}
    sim_seen_last_ts = {}
    now = time.time()

    # Simulate all Easy questions seen (some seen 1 time, some 2, some 3)
    # with oldest timestamps for count == 1
    for idx, q in enumerate(p_pool):
        if (q.get("difficulty_tier") or "").upper() == "EASY":
            sim_seen_counts[q["id"]] = 1 + (idx % 3)
            sim_seen_last_ts[q["id"]] = now - (1_000_000 - idx * 500)

    avail_ch = {normalize_chapter_name(q.get("chapter") or ""): 1.0 for q in p_pool}
    ch_quotas = distribute_weighted_counts(25, avail_ch)

    picked = _pick_from_chapters_weighted(
        candidates=p_pool,
        quota=25,
        ch_quotas=ch_quotas,
        weights_map=avail_ch,
        seen_ids=set(),
        seen_passages=set(),
        passage_groups=passage_groups,
        prefer_advanced=False,
        seen_counts=sim_seen_counts,
        seen_last_ts=sim_seen_last_ts,
        target_exam="MAIN",
        tier_counts={"ANCHOR": 0, "FRONTIER": 0, "PEAK": 0},
        tier_targets={"ANCHOR": 10, "FRONTIER": 11, "PEAK": 4},
        is_authentic_mock=True
    )

    assert len(picked) == 25
    tiers = Counter((q.get("difficulty_tier") or "").upper() for q in picked)
    assert tiers["EASY"] == 10, f"Expected 10 Easy, got {tiers['EASY']}"
    assert tiers["MEDIUM"] == 11, f"Expected 11 Medium, got {tiers['MEDIUM']}"
    assert tiers["HARD"] == 4, f"Expected 4 Hard, got {tiers['HARD']}"

    # Verify that all 10 recycled Easy questions were from count == 1 (least seen)
    easy_seen_counts = [sim_seen_counts[q["id"]] for q in picked if q.get("difficulty_tier") == "EASY"]
    assert all(c == 1 for c in easy_seen_counts), f"Expected all seen_count == 1, got {easy_seen_counts}"
