"""
Ansera AI Service.

Runs the correction-learning sweep (cluster reply corrections by the lesson
they teach, write standing rules for mature clusters) on a daily,
database-anchored schedule, and exposes it over HTTP. Also provides
/generate-reply, a cached and retrying drop-in for the n8n drafting node.
Every endpoint except /health requires the X-Service-Secret header.
"""

import asyncio
import logging
import os
from datetime import datetime, timezone

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from claude_client import GenerationFailedError, generate_reply
from consolidation import consolidate_corrections
from preferences import get_last_sweep_at, mark_sweep_complete, refresh_all_clients, refresh_preferences
from prompts import SUPPORT_REPLY_SYSTEM_PROMPT

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai_service")

app = FastAPI(title="Ansera AI Service")

SERVICE_SECRET = os.environ["AI_SERVICE_SECRET"]
DAILY_REFRESH_INTERVAL_SECONDS = 24 * 60 * 60
SWEEP_CHECK_RETRY_SECONDS = 5 * 60  # backoff before re-checking after a failed sweep or a watermark read error


async def _daily_refresh_loop() -> None:
    """Runs refresh_all_clients() roughly once every 24h for as long as the
    container is up -- the always-on replacement for the old cron-triggered
    n8n schedule. Anchored to `last_completed_at` persisted in Supabase
    (preferences.get_last_sweep_at/mark_sweep_complete) rather than a blind
    sleep, so a short container restart doesn't trigger an immediate rerun,
    but a real outage (e.g. the dev machine off overnight) is caught up on
    the moment the service is back instead of silently waiting up to another
    full day. Never run before (fresh deploy) counts as overdue too. A manual
    POST /refresh-preferences (or /refresh-all-preferences) is still
    available for on-demand runs any time in between."""
    while True:
        try:
            last_run = await get_last_sweep_at()
        except Exception as exc:  # noqa: BLE001 - Supabase hiccup; recheck soon rather than spin
            logger.error("daily refresh: could not read last-run watermark: %s", exc)
            await asyncio.sleep(SWEEP_CHECK_RETRY_SECONDS)
            continue

        wait_seconds = 0.0
        if last_run is not None:
            elapsed = (datetime.now(timezone.utc) - last_run).total_seconds()
            wait_seconds = max(0.0, DAILY_REFRESH_INTERVAL_SECONDS - elapsed)
        if wait_seconds > 0:
            await asyncio.sleep(wait_seconds)

        try:
            logger.info("daily refresh: starting sweep of all clients")
            results = await refresh_all_clients()
            await mark_sweep_complete()
            logger.info("daily refresh: swept %s clients", len(results))
        except Exception as exc:  # noqa: BLE001 - the loop must survive to run again
            logger.error("daily refresh sweep failed: %s", exc)
            await asyncio.sleep(SWEEP_CHECK_RETRY_SECONDS)


@app.on_event("startup")
async def _start_daily_refresh() -> None:
    asyncio.create_task(_daily_refresh_loop())


class GenerateReplyRequest(BaseModel):
    client_email: str
    subject: str
    incoming_message: str
    knowledge_base_context: str | None = None
    correction_patterns: str | None = None
    learned_rules: str | None = None
    thread_history: str | None = None


class GenerateReplyResponse(BaseModel):
    reply: str


class ConsolidateCorrectionsRequest(BaseModel):
    client_email: str


class ConsolidateCorrectionsResponse(BaseModel):
    rules: str | None
    source_count: int
    skipped: bool


class RefreshPreferencesRequest(BaseModel):
    client_email: str


class RefreshPreferencesResponse(BaseModel):
    client_email: str
    corrections_processed: int
    new_clusters: int
    reactivated: int
    rules_written: int
    llm_calls: int
    embeddings_backfilled: int


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/generate-reply", response_model=GenerateReplyResponse)
async def create_reply(
    body: GenerateReplyRequest,
    x_service_secret: str = Header(default=""),
):
    if x_service_secret != SERVICE_SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")

    logger.info("generating reply for client=%s subject=%r", body.client_email, body.subject)

    try:
        result = await generate_reply(
            system_prompt=SUPPORT_REPLY_SYSTEM_PROMPT,
            knowledge_base_context=body.knowledge_base_context,
            correction_patterns=body.correction_patterns,
            learned_rules=body.learned_rules,
            thread_history=body.thread_history,
            incoming_message=f"Subject: {body.subject}\n\n{body.incoming_message}",
        )
    except GenerationFailedError as exc:
        # A clear 502 instead of the request silently vanishing - n8n can
        # branch on this to write a fallback email_logs row so the ticket
        # stays visible instead of disappearing. See README.md step 3.
        logger.error("generation failed for client=%s: %s", body.client_email, exc)
        raise HTTPException(status_code=502, detail=f"generation failed: {exc}") from exc

    logger.info("generated reply for client=%s", body.client_email)
    return GenerateReplyResponse(reply=result.reply_text)


@app.post("/consolidate-corrections", response_model=ConsolidateCorrectionsResponse)
async def consolidate_corrections_route(
    body: ConsolidateCorrectionsRequest,
    x_service_secret: str = Header(default=""),
):
    if x_service_secret != SERVICE_SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")

    logger.info("consolidating corrections for client=%s", body.client_email)

    try:
        result = await consolidate_corrections(body.client_email)
    except GenerationFailedError as exc:
        logger.error("consolidation failed for client=%s: %s", body.client_email, exc)
        raise HTTPException(status_code=502, detail=f"consolidation failed: {exc}") from exc

    logger.info(
        "consolidation done for client=%s (skipped=%s source_count=%s)",
        body.client_email,
        result.skipped,
        result.source_count,
    )
    return ConsolidateCorrectionsResponse(
        rules=result.rules,
        source_count=result.source_count,
        skipped=result.skipped,
    )


@app.post("/refresh-preferences", response_model=RefreshPreferencesResponse)
async def refresh_preferences_route(
    body: RefreshPreferencesRequest,
    x_service_secret: str = Header(default=""),
):
    # Clusters this client's new corrections by lesson, counts repeats
    # deterministically, and writes/refreshes a standing-rule summary once a
    # bucket matures at 5 members. Shadow-safe -- writes only to
    # correction_clusters and reply_corrections.cluster_id; the live reply path
    # is unaffected until Stage 3.
    if x_service_secret != SERVICE_SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")

    logger.info("refreshing preferences for client=%s", body.client_email)

    try:
        result = await refresh_preferences(body.client_email)
    except Exception as exc:  # noqa: BLE001 - surface a clear 502 rather than a bare 500
        logger.error("refresh failed for client=%s: %s", body.client_email, exc)
        raise HTTPException(status_code=502, detail=f"refresh failed: {exc}") from exc

    return RefreshPreferencesResponse(
        client_email=result.client_email,
        corrections_processed=result.corrections_processed,
        new_clusters=result.new_clusters,
        reactivated=result.reactivated,
        rules_written=result.rules_written,
        llm_calls=result.llm_calls,
        embeddings_backfilled=result.embeddings_backfilled,
    )


@app.post("/refresh-all-preferences", response_model=list[RefreshPreferencesResponse])
async def refresh_all_preferences_route(x_service_secret: str = Header(default="")):
    # On-demand version of the daily background sweep (_daily_refresh_loop) --
    # runs refresh_preferences for every client immediately, for testing or a
    # manual trigger instead of waiting for the next 24h tick.
    if x_service_secret != SERVICE_SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")

    logger.info("manual refresh-all triggered")
    results = await refresh_all_clients()
    return [
        RefreshPreferencesResponse(
            client_email=r.client_email,
            corrections_processed=r.corrections_processed,
            new_clusters=r.new_clusters,
            reactivated=r.reactivated,
            rules_written=r.rules_written,
            llm_calls=r.llm_calls,
            embeddings_backfilled=r.embeddings_backfilled,
        )
        for r in results
    ]
