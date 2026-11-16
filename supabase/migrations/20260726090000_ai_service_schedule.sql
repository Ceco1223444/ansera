-- Persists when the ai-service daily refresh sweep last actually completed,
-- so the in-process scheduler (main.py's asyncio loop) can tell a short
-- container restart (don't rerun yet) apart from a real outage -- e.g. the
-- dev machine being off overnight (catch up immediately instead of silently
-- waiting up to another full day). An in-memory timestamp can't do this: it
-- doesn't survive the restart that's the whole point of tracking.
--
-- Single named row per schedule (just "daily_refresh" today, room for more
-- later without a schema change). Written only by the ai-service's
-- service-role key; no client ever reads or writes this.
create table public.ai_service_schedule (
  name              text primary key,
  last_completed_at timestamptz
);

insert into public.ai_service_schedule (name, last_completed_at)
values ('daily_refresh', null);

alter table public.ai_service_schedule enable row level security;

revoke all on public.ai_service_schedule from anon, authenticated;
