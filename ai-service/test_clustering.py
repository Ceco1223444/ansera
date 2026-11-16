"""
Unit tests for the pure clustering math (clustering.py). Zero external
dependencies -- runs with plain stdlib:

    python test_clustering.py          # standalone runner, prints PASS/FAIL
    python -m pytest test_clustering.py # also works if pytest is installed

Covers: nearest-cluster grouping, the running-average centroid, the
summarization gate (5-member bar, the has_new_notes flag the caller computes
via a timestamp watermark, and the rule_locked override), and the pgvector
round-trip.
"""

from __future__ import annotations

from clustering import (
    cosine,
    format_vector,
    nearest_cluster_index,
    parse_vector,
    running_avg_centroid,
    should_summarize,
)

APPROX = 1e-9


# ---------------------------------------------------------------------------
# summarization gate
# ---------------------------------------------------------------------------
def test_should_summarize_initial_formation():
    assert should_summarize(member_count=5, has_new_notes=True, locked=False) is True
    assert should_summarize(member_count=4, has_new_notes=True, locked=False) is False  # under 5


def test_should_summarize_stale_vs_up_to_date():
    # caller found corrections newer than the watermark -> due again
    assert should_summarize(member_count=8, has_new_notes=True, locked=False) is True
    # caller found nothing past the watermark -> skip (no wasted call)
    assert should_summarize(member_count=8, has_new_notes=False, locked=False) is False


def test_should_summarize_respects_lock():
    # would otherwise be due (has new notes), but a human locked it
    assert should_summarize(member_count=9, has_new_notes=True, locked=True) is False


# ---------------------------------------------------------------------------
# nearest cluster
# ---------------------------------------------------------------------------
def test_nearest_cluster_index():
    centroids = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
    assert nearest_cluster_index([0.95, 0.05, 0.0], centroids) == 0
    assert nearest_cluster_index([0.0, 0.99, 0.02], centroids) == 1


def test_nearest_cluster_below_threshold_starts_new():
    centroids = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
    # orthogonal-ish to both -> cosine ~0 < 0.80 -> None (new cluster)
    assert nearest_cluster_index([0.0, 0.0, 1.0], centroids) is None


def test_nearest_cluster_ties_lowest_index():
    centroids = [[1.0, 0.0], [1.0, 0.0]]  # identical
    assert nearest_cluster_index([1.0, 0.0], centroids) == 0


def test_nearest_cluster_empty():
    assert nearest_cluster_index([1.0, 0.0], []) is None


# ---------------------------------------------------------------------------
# centroid math
# ---------------------------------------------------------------------------
def test_running_avg_matches_true_mean():
    v1, v2, v3 = [0.0, 0.0], [2.0, 4.0], [4.0, 5.0]
    c2 = running_avg_centroid(v1, 1, v2)            # after 2nd member
    assert c2 == [1.0, 2.0]
    c3 = running_avg_centroid(c2, 2, v3)            # after 3rd member
    truth = [(v1[i] + v2[i] + v3[i]) / 3 for i in range(2)]
    assert all(abs(a - b) < APPROX for a, b in zip(c3, truth))


# ---------------------------------------------------------------------------
# pgvector round-trip
# ---------------------------------------------------------------------------
def test_vector_round_trip():
    vec = [0.1, -0.2, 3.5e-4, 0.0]
    restored = parse_vector(format_vector(vec))
    assert all(abs(a - b) < APPROX for a, b in zip(vec, restored))
    assert parse_vector(None) is None
    assert parse_vector([1, 2, 3]) == [1.0, 2.0, 3.0]


def test_cosine_zero_vector_guard():
    assert cosine([0.0, 0.0], [1.0, 1.0]) == 0.0


# ---------------------------------------------------------------------------
# centroid drift -- the regression that moved CLUSTER_THRESHOLD 0.80 -> 0.84
# ---------------------------------------------------------------------------
def test_centroid_similarity_exceeds_pairwise():
    """Averaging correlated members amplifies their shared direction, so a note
    can score BELOW threshold against every individual member yet ABOVE it
    against their centroid. This is why calibrating the threshold on pairwise
    numbers (as the original 0.80 was) under-sets it. Observed live 2026-09-09:
    an unrelated note measured max 0.7950 pairwise but 0.8117 to the centroid.

    Built from a shared base vector plus per-member noise, which is the shape
    real embeddings have -- not hand-tuned numbers."""
    # Every member is the shared direction (dim 0) plus its own noise. The
    # noise mostly cancels in the mean, so the centroid is a CLEANER copy of
    # the shared direction than any single member is. The outsider carries the
    # shared direction plus noise in a dimension none of the members use.
    members = [
        [1.0, 0.30, 0.00, 0.00, 0.00],
        [1.0, -0.30, 0.00, 0.00, 0.00],
        [1.0, 0.00, 0.30, 0.00, 0.00],
        [1.0, 0.00, -0.30, 0.00, 0.00],
        [1.0, 0.00, 0.00, 0.30, 0.00],
    ]
    centroid = [sum(m[i] for m in members) / len(members) for i in range(len(members[0]))]
    outsider = [1.0, 0.00, 0.00, 0.00, 0.30]

    best_pairwise = max(cosine(outsider, m) for m in members)
    to_centroid = cosine(outsider, centroid)
    assert to_centroid > best_pairwise, (
        f"expected centroid similarity ({to_centroid:.4f}) to exceed the best "
        f"pairwise similarity ({best_pairwise:.4f})"
    )


def test_threshold_is_calibrated_for_centroids():
    """Guards the actual constant. The live measurement that motivated the
    change: an unrelated lesson reached 0.8117 against the centroid, while
    same-lesson pairs sat in 0.8641-0.9153. The threshold must exclude the
    first and admit the second."""
    from clustering import CLUSTER_THRESHOLD

    observed_unrelated_to_centroid = 0.8117
    observed_same_lesson_low = 0.8641
    assert CLUSTER_THRESHOLD > observed_unrelated_to_centroid, (
        "threshold would merge two unrelated lessons measured live on 2026-09-09"
    )
    assert CLUSTER_THRESHOLD < observed_same_lesson_low, (
        "threshold would split notes that genuinely teach the same lesson"
    )


# ---------------------------------------------------------------------------
# standalone runner (no pytest required)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys

    tests = [(n, o) for n, o in sorted(globals().items()) if n.startswith("test_") and callable(o)]
    failures = 0
    for name, fn in tests:
        try:
            fn()
            print(f"  PASS  {name}")
        except AssertionError as exc:
            failures += 1
            print(f"  FAIL  {name}: {exc}")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"  ERROR {name}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failures}/{len(tests)} passed")
    sys.exit(1 if failures else 0)
