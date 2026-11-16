"""
Incremental "refresh preferences" pass -- clusters corrections by the lesson
they teach and keeps each bucket's standing-rule summary current.

This module owns the I/O and orchestration; the deterministic vector math lives
in clustering.py (pure, unit-tested). Runs in two phases every time it's
called (once a day, via main.py's background scheduler, or on demand):

  Phase 1 -- clustering (always runs, pure math, no tokens): every new
  correction is assigned to the nearest existing bucket by NOTE embedding
  (>= 0.80 cosine), or starts a new one. Just counting; no LLM involved.

  Phase 2 -- summarizing (gated by the per-client `preferences_ai_enabled`
  toggle): every bucket that has reached 5 members AND whose summary is out of
  date gets exactly ONE LLM call -- never one call per correction, so a bucket
  that receives several new corrections in the same run (or grew while the
  toggle was off) still costs one call, not several. A bucket with no rule yet
  gets one WRITTEN from all its notes; a bucket that already has a rule gets it
  UPDATED (see _update_rule) -- fed only the notes added since the last
  summary, instructed to preserve the existing wording (whether AI-written or
  hand-edited by a human in the app) and only add or correct what's new. A
  human can additionally hard-lock a bucket (rule_locked) to stop this phase
  from touching it at all, even to merge.

Design note (simplified 2026-07-23, revised 2026-07-24): earlier versions of
this module tracked support/oppose votes, a universal-vs-topic-specific split,
a similarity-matched top-N retrieval, and re-summarized by fully regenerating a
bucket's rule from scratch every time. All four are gone. In practice a client
doesn't contradict their own past corrections, so if a bucket's notes ever do
conflict and the AI's combined summary comes out wrong, that's what the app's
editable Learned Patterns table is for (a human fixes it directly) -- and now
that fix survives future updates instead of being silently overwritten by the
next full regenerate. Every bucket's rule is meant to apply everywhere by
definition, so at reply time (Stage 3, not yet wired) ALL of them are injected
in one text via get_standing_rules -- no similarity filtering the way per-
ticket correction retrieval uses. That's also why the grouping threshold in
clustering.py is deliberately lower than per-ticket matching: fewer, broader
buckets keep that "inject everything" text a reasonable size.

Shadow-safe: writes only to correction_clusters and reply_corrections.cluster_id.
It does NOT touch what the live reply path reads until Stage 3. Kept as a NEW
module alongside the still-live consolidation.py so the existing nightly path
keeps working unchanged during shadow; consolidation.py + learned_patterns are
retired in Stage 4.

Direct Supabase REST access with the service-role key, raw httpx, no SDK -- the
same style consolidation.py established. Embeddings use OpenAI
text-embedding-ada-002 (1536 dims), matching the vector columns and n8n's
existing embedder.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

from claude_client import GenerationFailedError, call_openrouter_chat
from clustering import (
    RULE_THRESHOLD,
    Vector,
    format_vector,
    nearest_cluster_index,
    parse_vector,
    running_avg_centroid,
    should_summarize,
)

logger = logging.getLogger("ai_service.preferences")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
REQUEST_TIMEOUT_SECONDS = 30.0
PAGE_SIZE = 1000

DAILY_REFRESH_SCHEDULE_NAME = "daily_refresh"

OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"
EMBEDDING_MODEL = "text-embedding-ada-002"  # 1536 dims -- must match the vector() columns

WRITE_RULE_PROMPT = """Below are correction notes from a human reviewer editing AI-drafted replies for the same support inbox. Every note in this group teaches the same underlying lesson, though later notes may sharpen or add a nuance the earlier ones didn't have.

Write ONE complete standing instruction that captures what a future reply should do because of this lesson - general enough to apply across different kinds of tickets, never tied to one ticket's specifics or a count of how many times it happened. If the notes together cover more than one part of the same lesson (e.g. a main rule plus an exception, or what to do and when), fold all of it into that one instruction. If a later note refines or adds to what an earlier one said, the instruction should reflect the fullest, most current version - not just the earliest.

Aim for one to two sentences: complete enough to be unambiguous on its own, short enough to stay a quick standing rule rather than an essay.

Output only the instruction itself, nothing else.

{numbered_notes}"""

UPDATE_RULE_PROMPT = """You maintain one standing instruction for a support inbox. Here is the CURRENT instruction, delimited by ---- (the ---- lines are not part of the text) - it may have been written by you before, or edited by a human reviewer by hand, so treat its exact wording as intentional unless the new notes below contradict it:
----
{current_rule}
----

Here are NEW correction notes that just came in, teaching the same underlying lesson as the current instruction:
{numbered_new_notes}

Update the instruction using these rules:
- If a new note ADDS something not already covered (a new case, a clarification, extra scope), keep every word of the current instruction and add the new part alongside it - phrased generally, the same way the rest of the instruction is (never a ticket-specific detail like a customer's name, order number, or one-off situation lifted straight from the note).
- If a new note just RESTATES something the current instruction already says - even in different words - do NOT add it again. Never let the same point appear twice in the final instruction.
- Only CHANGE existing wording if a new note directly CONTRADICTS what the current instruction already says - in that case, replace just the contradicted part; leave everything else untouched.
- If none of the new notes add or contradict anything, output the current instruction completely unchanged.

Output only the updated instruction, nothing else - no explanation of what changed."""


@dataclass
class Cluster:
    id: int
    centroid: Vector                      # running avg of member note embeddings (the "lesson")
    member_count: int
    rule: str | None
    rule_written_at: str | None            # ISO timestamp: everything up to here is already reflected in `rule`
    rule_locked: bool                      # true once a human hard-freezes it via the app
    status: str


@dataclass
class RefreshResult:
    client_email: str
    corrections_processed: int = 0
    new_clusters: int = 0
    reactivated: int = 0
    rules_written: int = 0
    llm_calls: int = 0
    embeddings_backfilled: int = 0


# ---------------------------------------------------------------------------
# Supabase REST helpers
# ---------------------------------------------------------------------------
def _headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }


async def _get_all(http: httpx.AsyncClient, path: str, params: dict) -> list[dict]:
    """GET every row for a query, paging with Range headers so a large history
    is never silently truncated by PostgREST's default row cap."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    out: list[dict] = []
    start = 0
    while True:
        headers = {**_headers(), "Range-Unit": "items", "Range": f"{start}-{start + PAGE_SIZE - 1}"}
        resp = await http.get(url, params=params, headers=headers)
        resp.raise_for_status()
        batch = resp.json()
        out.extend(batch)
        if len(batch) < PAGE_SIZE:
            return out
        start += PAGE_SIZE


async def _fetch_ai_enabled(http, client_email) -> bool:
    """The per-client switch for whether the refresh spends LLM tokens
    (rule-writing). Clustering itself never checks this. Defaults true if the
    client row is somehow missing (fail open, matches the column's DB default)."""
    resp = await http.get(
        f"{SUPABASE_URL}/rest/v1/clients",
        params={"email": f"eq.{client_email}", "select": "preferences_ai_enabled"},
        headers=_headers(),
    )
    resp.raise_for_status()
    rows = resp.json()
    return bool(rows[0]["preferences_ai_enabled"]) if rows else True


async def _fetch_all_client_emails(http) -> list[str]:
    rows = await _get_all(http, "clients", {"select": "email"})
    return [r["email"] for r in rows]


async def _fetch_missing_note_embeddings(http, client_email) -> list[dict]:
    return await _get_all(
        http,
        "reply_corrections",
        {
            "client_email": f"eq.{client_email}",
            "note_embedding": "is.null",
            "correction_note": "not.is.null",
            "select": "id,correction_note",
            "order": "created_at.asc",
        },
    )


async def _fetch_clusters(http, client_email) -> list[Cluster]:
    rows = await _get_all(
        http,
        "correction_clusters",
        {"client_email": f"eq.{client_email}", "select": "*", "order": "id.asc"},
    )
    return [
        Cluster(
            id=r["id"],
            centroid=parse_vector(r["centroid"]),
            member_count=r["member_count"],
            rule=r["rule"],
            rule_written_at=r["rule_written_at"],
            rule_locked=r["rule_locked"],
            status=r["status"],
        )
        for r in rows
    ]


async def _fetch_unprocessed(http, client_email) -> list[dict]:
    return await _get_all(
        http,
        "reply_corrections",
        {
            "client_email": f"eq.{client_email}",
            "cluster_id": "is.null",
            "note_embedding": "not.is.null",
            "select": "id,correction_note,note_embedding",
            "order": "created_at.asc",
        },
    )


async def _fetch_member_notes(http, cluster_id, since: str | None = None) -> list[dict]:
    """Notes for this bucket, oldest first, as {correction_note, created_at}
    rows. With `since`, only rows strictly newer than that timestamp -- the
    "not yet folded into the current rule" set, found by comparing an actual
    point in time rather than counting list positions (which a deletion
    elsewhere would throw off). Without `since` (a bucket's first summary),
    every note in the bucket."""
    params = {
        "cluster_id": f"eq.{cluster_id}",
        "correction_note": "not.is.null",
        "select": "correction_note,created_at",
        "order": "created_at.asc",
    }
    if since:
        params["created_at"] = f"gt.{since}"
    rows = await _get_all(http, "reply_corrections", params)
    return [r for r in rows if r.get("correction_note")]


async def _insert_cluster(http, client_email, centroid: Vector) -> int:
    url = f"{SUPABASE_URL}/rest/v1/correction_clusters"
    headers = {**_headers(), "Content-Type": "application/json", "Prefer": "return=representation"}
    payload = {
        "client_email": client_email,
        "centroid": format_vector(centroid),
        "member_count": 1,
        "status": "active",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    resp = await http.post(url, headers=headers, json=payload)
    resp.raise_for_status()
    return resp.json()[0]["id"]


async def _update_cluster(http, c: Cluster) -> None:
    url = f"{SUPABASE_URL}/rest/v1/correction_clusters"
    headers = {**_headers(), "Content-Type": "application/json", "Prefer": "return=minimal"}
    payload = {
        "centroid": format_vector(c.centroid),
        "member_count": c.member_count,
        "rule": c.rule,
        "rule_written_at": c.rule_written_at,
        "rule_locked": c.rule_locked,
        "status": c.status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    resp = await http.patch(url, params={"id": f"eq.{c.id}"}, headers=headers, json=payload)
    resp.raise_for_status()


async def _patch_note_embedding(http, correction_id, vec: Vector) -> None:
    url = f"{SUPABASE_URL}/rest/v1/reply_corrections"
    headers = {**_headers(), "Content-Type": "application/json", "Prefer": "return=minimal"}
    resp = await http.patch(
        url,
        params={"id": f"eq.{correction_id}"},
        headers=headers,
        json={"note_embedding": format_vector(vec)},
    )
    resp.raise_for_status()


async def _assign_correction(http, correction_id, cluster_id) -> None:
    url = f"{SUPABASE_URL}/rest/v1/reply_corrections"
    headers = {**_headers(), "Content-Type": "application/json", "Prefer": "return=minimal"}
    resp = await http.patch(
        url,
        params={"id": f"eq.{correction_id}"},
        headers=headers,
        json={"cluster_id": cluster_id},
    )
    resp.raise_for_status()


# ---------------------------------------------------------------------------
# OpenAI embeddings
# ---------------------------------------------------------------------------
async def _embed_text(http, text: str) -> Vector:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set; needed to embed correction notes")
    resp = await http.post(
        OPENAI_EMBEDDINGS_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"model": EMBEDDING_MODEL, "input": text},
    )
    resp.raise_for_status()
    return [float(x) for x in resp.json()["data"][0]["embedding"]]


# ---------------------------------------------------------------------------
# the two LLM calls: write a bucket's FIRST summary, or merge new notes into
# an EXISTING one (preserving it -- see _update_rule)
# ---------------------------------------------------------------------------
async def _write_rule(notes: list[str]) -> str:
    numbered = "\n".join(f"{i}. {n}" for i, n in enumerate(notes, start=1))
    prompt = WRITE_RULE_PROMPT.format(numbered_notes=numbered)
    result = await call_openrouter_chat([{"role": "user", "content": prompt}])
    return result.reply_text.strip()


async def _update_rule(current_rule: str, new_notes: list[str]) -> str:
    """Update an EXISTING rule by merging in new notes, rather than
    regenerating from scratch -- so a human's manual edit (or the AI's own
    prior phrasing) survives untouched unless a new note genuinely
    contradicts it. Only ever called with the notes added SINCE the rule was
    last written (see _summarize_due_clusters), not the full history."""
    numbered = "\n".join(f"{i}. {n}" for i, n in enumerate(new_notes, start=1))
    prompt = UPDATE_RULE_PROMPT.format(current_rule=current_rule, numbered_new_notes=numbered)
    result = await call_openrouter_chat([{"role": "user", "content": prompt}])
    text = result.reply_text.strip()
    # Defensive cleanup: a model occasionally echoes back stray quote marks
    # around unchanged text (it was shown the current rule delimited that
    # way) - strip one matching pair so an untouched rule doesn't visibly
    # grow quotes on every otherwise-no-op update.
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        text = text[1:-1].strip()
    return text


# ---------------------------------------------------------------------------
# phase 1: clustering (pure math, no tokens)
# ---------------------------------------------------------------------------
async def _cluster_one(http, client_email, row, note_emb, clusters, result: RefreshResult) -> None:
    """Assign one correction to the nearest bucket (or start a new one). No LLM
    calls here at all -- summarizing happens separately, once per bucket per
    run, in _summarize_due_clusters."""
    correction_id = row["id"]
    idx = nearest_cluster_index(note_emb, [c.centroid for c in clusters])

    if idx is None:
        cluster_id = await _insert_cluster(http, client_email, note_emb)
        clusters.append(
            Cluster(
                id=cluster_id,
                centroid=list(note_emb),
                member_count=1,
                rule=None,
                rule_written_at=None,
                rule_locked=False,
                status="active",
            )
        )
        await _assign_correction(http, correction_id, cluster_id)
        result.new_clusters += 1
        result.corrections_processed += 1
        return

    cluster = clusters[idx]
    reactivated = cluster.status == "retired"
    cluster.centroid = running_avg_centroid(cluster.centroid, cluster.member_count, note_emb)
    cluster.member_count += 1
    cluster.status = "active"
    await _assign_correction(http, correction_id, cluster.id)
    await _update_cluster(http, cluster)

    result.corrections_processed += 1
    if reactivated:
        result.reactivated += 1


# ---------------------------------------------------------------------------
# phase 2: summarizing (gated by preferences_ai_enabled, once per bucket per run)
# ---------------------------------------------------------------------------
async def _summarize_due_clusters(http, clusters: list[Cluster], result: RefreshResult) -> None:
    """One LLM call per bucket that's matured (or grown since its last
    summary) and isn't locked -- covers a bucket receiving several new members
    in this same run, or having grown while the toggle was off, with exactly
    ONE call, not one per correction.

    "Not yet folded in" is found via a TIMESTAMP watermark (rule_written_at),
    not a position count -- so a client deleting some unrelated OLD correction
    via the app's editable table can never cause a genuinely new one to be
    silently skipped (a position-based count would shift and could).

    A bucket with NO rule yet gets one written from ALL its notes (nothing to
    preserve). A bucket that ALREADY has a rule gets it UPDATED -- fed only the
    notes newer than the watermark, with instructions to keep the existing
    wording intact and only add or correct what's actually new. This is what
    stops a human's manual edit (or the AI's own prior phrasing) from being
    silently overwritten by the next daily run."""
    for cluster in clusters:
        if cluster.status != "active":
            continue
        if cluster.rule_locked or cluster.member_count < RULE_THRESHOLD:
            continue  # cheap skip before touching the DB
        rows = await _fetch_member_notes(http, cluster.id, since=cluster.rule_written_at)
        if not should_summarize(cluster.member_count, has_new_notes=bool(rows), locked=cluster.rule_locked):
            continue
        notes = [r["correction_note"] for r in rows]
        if not notes:
            continue
        latest_created_at = rows[-1]["created_at"]  # ordered oldest-first -> last is newest
        try:
            if cluster.rule is None:
                result.llm_calls += 1
                cluster.rule = await _write_rule(notes)
            else:
                result.llm_calls += 1
                cluster.rule = await _update_rule(cluster.rule, notes)
        except GenerationFailedError as exc:
            logger.warning(
                "rule-write failed for cluster %s: %s -- will retry next run", cluster.id, exc
            )
            continue
        cluster.rule_written_at = latest_created_at
        await _update_cluster(http, cluster)
        result.rules_written += 1


# ---------------------------------------------------------------------------
# entry point
# ---------------------------------------------------------------------------
async def refresh_preferences(client_email: str) -> RefreshResult:
    """Process this client's corrections that aren't assigned to a bucket yet
    (cluster_id is null), oldest-first for deterministic counting, then
    summarize whatever buckets are due. Idempotent and resumable: already-
    assigned corrections are skipped and a bucket with an up-to-date summary
    is skipped too, so a quiet day makes ZERO LLM calls."""
    result = RefreshResult(client_email=client_email)

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as http:
        ai_enabled = await _fetch_ai_enabled(http, client_email)

        # backfill note_embedding for corrections that don't have one yet.
        # (Once the Stage 3 n8n node embeds notes at Log Correction time this
        # finds nothing to do; until then it's how existing history is filled.)
        # This is a plain embedding call, not the rule-writing LLM -- runs
        # regardless of the toggle, same as clustering itself.
        for r in await _fetch_missing_note_embeddings(http, client_email):
            note = (r.get("correction_note") or "").strip()
            if not note:
                continue
            try:
                vec = await _embed_text(http, note)
            except Exception as exc:  # noqa: BLE001 -- best-effort; retry next run
                logger.warning("note embed failed for correction id=%s: %s", r["id"], exc)
                continue
            await _patch_note_embedding(http, r["id"], vec)
            result.embeddings_backfilled += 1

        clusters = await _fetch_clusters(http, client_email)

        # phase 1: cluster every unprocessed correction (free, pure math)
        for row in await _fetch_unprocessed(http, client_email):
            note_emb = parse_vector(row.get("note_embedding"))
            if note_emb is None:
                continue
            await _cluster_one(http, client_email, row, note_emb, clusters, result)

        # phase 2: one summarization pass per bucket that's due (gated by toggle)
        if ai_enabled:
            await _summarize_due_clusters(http, clusters, result)

    logger.info(
        "refresh done for client=%s: ai_enabled=%s processed=%s new_clusters=%s reactivated=%s "
        "rules_written=%s llm_calls=%s embeddings_backfilled=%s",
        client_email,
        ai_enabled,
        result.corrections_processed,
        result.new_clusters,
        result.reactivated,
        result.rules_written,
        result.llm_calls,
        result.embeddings_backfilled,
    )
    return result


async def get_last_sweep_at() -> datetime | None:
    """When the daily sweep last actually completed, read from Supabase (not
    memory) so main.py's scheduler survives a container restart -- lets it
    tell a short dev restart (recent -> don't rerun yet) apart from a real
    outage (stale -> catch up now). None means never completed."""
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as http:
        resp = await http.get(
            f"{SUPABASE_URL}/rest/v1/ai_service_schedule",
            params={"name": f"eq.{DAILY_REFRESH_SCHEDULE_NAME}", "select": "last_completed_at"},
            headers=_headers(),
        )
        resp.raise_for_status()
        rows = resp.json()
    raw = rows[0]["last_completed_at"] if rows else None
    return datetime.fromisoformat(raw.replace("Z", "+00:00")) if raw else None


async def mark_sweep_complete() -> None:
    """Record that the daily sweep just finished. Only called after
    refresh_all_clients() succeeds -- a failed sweep leaves the old timestamp
    in place, so it stays "overdue" and gets retried instead of silently
    counted as done."""
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as http:
        resp = await http.patch(
            f"{SUPABASE_URL}/rest/v1/ai_service_schedule",
            params={"name": f"eq.{DAILY_REFRESH_SCHEDULE_NAME}"},
            headers={**_headers(), "Content-Type": "application/json", "Prefer": "return=minimal"},
            json={"last_completed_at": datetime.now(timezone.utc).isoformat()},
        )
        resp.raise_for_status()


async def refresh_all_clients() -> list[RefreshResult]:
    """Run refresh_preferences for every client -- the daily automatic sweep
    (called by main.py's background scheduler). One client's failure (e.g. a
    transient OpenAI/OpenRouter error) is logged and skipped, not fatal to the
    rest of the run."""
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as http:
        emails = await _fetch_all_client_emails(http)

    results = []
    for email in emails:
        try:
            results.append(await refresh_preferences(email))
        except Exception as exc:  # noqa: BLE001 -- one client's failure shouldn't kill the sweep
            logger.error("daily refresh failed for client=%s: %s", email, exc)
    return results
