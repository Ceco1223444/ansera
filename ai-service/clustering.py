"""
Pure vector math for the learned-patterns bucket system. NO I/O, NO env, NO
network -- every function here is a deterministic function of its inputs, so
clustering and the summarization gate can be unit-tested without Supabase,
OpenAI, or Docker (see test_clustering.py).

Vectors are plain list[float] (OpenAI text-embedding-ada-002 -> 1536 dims). The
REST layer in preferences.py converts to/from pgvector's "[...]" text form via
format_vector / parse_vector.

Design (2026-07-23): a bucket is corrections that teach the same lesson (note-
embedding cosine >= CLUSTER_THRESHOLD). Corrections are tracked into buckets
continuously (pure math, no tokens); once a day, every bucket with >=5 members
whose summary is out of date gets ONE rule-write covering its full current
membership -- not one call per new correction. Every bucket is injected in
full at reply time (Stage 3, not yet wired) -- there's no top-N similarity
filtering the way per-ticket correction retrieval uses, since a standing rule
is meant to apply everywhere by definition. That's also why the grouping
threshold here is deliberately lower than match_reply_corrections' per-ticket
matching: fewer, broader buckets keep the "inject everything" text a
reasonable size.

Earlier versions of this module tracked support/oppose votes and a universal-
vs-topic-specific split. Both are gone -- in practice a client doesn't
contradict their own past corrections, so if a bucket's notes ever do conflict
and the AI's combined summary comes out wrong, that's what the app's editable
Learned Patterns table is for (a human fixes it directly), not more automated
machinery.
"""

from __future__ import annotations

import json
import math

Vector = list[float]

# EVERY bucket gets injected in full (no top-N filtering), so buckets need to
# stay few and broad -- but not so broad that unrelated lessons merge.
#
# IMPORTANT, and the reason this value changed on 2026-09-09: this threshold is
# compared against a cluster's CENTROID, not against individual member notes
# (see nearest_cluster_index). The original 0.80 was calibrated from PAIRWISE
# measurements (same-lesson notes 0.856+, different lessons topping out at
# 0.787) and that is the wrong yardstick -- ada-002 embeddings share a large
# common component, so averaging members amplifies the shared direction and
# centroid similarity runs consistently HIGHER than any pairwise similarity.
# A note can therefore sit below threshold against every single member and
# still join the bucket.
#
# Measured live on 2026-09-09 with 5 "include the order number" notes plus one
# unrelated "never promise a delivery date" note:
#     unrelated note vs each member (pairwise) : max 0.7950   <- below 0.80
#     unrelated note vs the 5-member centroid  :     0.8117   <- above 0.80
#     same-lesson pairs, for contrast          : 0.8641 - 0.9153
# At 0.80 the unrelated note joined and the AI wrote one run-on rule covering
# two different lessons. 0.84 sits above the observed centroid figure and well
# below the same-lesson band.
#
# Still a knob, not a law -- re-tune with report_clusters() as real data grows,
# but measure against centroids, not pairs.
CLUSTER_THRESHOLD = 0.84
RULE_THRESHOLD = 5


# ---------------------------------------------------------------------------
# pgvector <-> python
# ---------------------------------------------------------------------------
def parse_vector(raw: str | list[float] | None) -> Vector | None:
    """PostgREST returns a vector column as its text form, e.g. "[0.1,0.2]".
    Accepts that string, an already-parsed list, or None."""
    if raw is None:
        return None
    if isinstance(raw, list):
        return [float(x) for x in raw]
    return [float(x) for x in json.loads(raw)]


def format_vector(vec: Vector) -> str:
    """Serialize to the "[...]" text pgvector accepts on insert/update -- the
    same shape the live Log Correction node builds by hand."""
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


# ---------------------------------------------------------------------------
# vector primitives
# ---------------------------------------------------------------------------
def dot(a: Vector, b: Vector) -> float:
    return sum(x * y for x, y in zip(a, b))


def norm(a: Vector) -> float:
    return math.sqrt(dot(a, a))


def cosine(a: Vector, b: Vector) -> float:
    na, nb = norm(a), norm(b)
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot(a, b) / (na * nb)


def running_avg_centroid(old_centroid: Vector, old_count: int, new_vec: Vector) -> Vector:
    """Centroid after adding one member, treating old_centroid as the mean of
    `old_count` members. member_count increments to n and centroid becomes
    (old*(n-1) + new)/n -- i.e. old_count = n-1 here."""
    n = old_count + 1
    return [(o * old_count + x) / n for o, x in zip(old_centroid, new_vec)]


# ---------------------------------------------------------------------------
# nearest cluster
# ---------------------------------------------------------------------------
def nearest_cluster_index(
    note_embedding: Vector,
    centroids: list[Vector],
    threshold: float = CLUSTER_THRESHOLD,
) -> int | None:
    """Index of the centroid with the highest cosine to note_embedding, but only
    if that best cosine is >= threshold; otherwise None (-> start a new cluster).
    Ties resolve to the lowest index (deterministic ordering)."""
    best_i: int | None = None
    best_sim: float | None = None
    for i, c in enumerate(centroids):
        s = cosine(note_embedding, c)
        if s >= threshold and (best_sim is None or s > best_sim):
            best_i, best_sim = i, s
    return best_i


# ---------------------------------------------------------------------------
# summarization gate
# ---------------------------------------------------------------------------
def should_summarize(
    member_count: int,
    has_new_notes: bool,
    locked: bool,
    threshold: int = RULE_THRESHOLD,
) -> bool:
    """A bucket gets a (re)written summary once per refresh when it has
    reached the member threshold (5) AND has at least one correction not yet
    folded into the current rule -- unless a human has hard-locked it, in
    which case it's left alone entirely until they unlock it. `has_new_notes`
    is computed by the caller via a timestamp comparison (corrections created
    after the bucket's rule_written_at watermark), not a position count --
    immune to earlier rows being deleted. One call covers every note not yet
    folded in, regardless of how many arrived since the last summary -- never
    one call per correction."""
    if locked or member_count < threshold:
        return False
    return has_new_notes
