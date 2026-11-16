-- Replace the POSITION-based "what's new since the last summary" tracking
-- (rule_at_count, an integer member-count snapshot) with a TIMESTAMP
-- watermark. The position-based version breaks under deletion: the new
-- editable Reply Corrections table (migration 20260723150000) lets a client
-- delete an OLD correction that's already reflected in a bucket's rule; doing
-- so shifts every later row's list position, which can cause a genuinely NEW
-- correction to be silently skipped from ever being merged into the rule
-- (notes[rule_at_count:] under-shoots past it). A timestamp comparison
-- (created_at > rule_written_at) is immune to this -- deleting any row,
-- anywhere, never shifts what "after this point in time" means.
--
-- rule_written_at = the point up to which the rule already reflects
-- everything; null until the bucket's first rule is written. Editing a rule
-- by hand in the app also bumps this to "now", so the next refresh only
-- considers corrections that arrived AFTER the edit as new -- not the whole
-- history the human already had in mind when they wrote it.

alter table public.correction_clusters
  drop column rule_at_count,
  add column rule_written_at timestamptz;

-- report_clusters: swap rule_at_count for rule_written_at in the preview.
drop function if exists public.report_clusters(text);

create function public.report_clusters(target_client_email text)
returns table (
  cluster_id       bigint,
  status           text,
  member_count     int,
  rule             text,
  rule_locked      boolean,
  rule_written_at  timestamptz,
  updated_at       timestamptz
)
language sql
stable
as $$
  select id, status, member_count, rule, rule_locked, rule_written_at, updated_at
  from public.correction_clusters
  where client_email = target_client_email
  order by member_count desc;
$$;

grant execute on function public.report_clusters(text) to service_role;

-- Editing a rule in the app now bumps rule_written_at to "now" (treating the
-- edit as authoritative as of that moment, so the next refresh only folds in
-- corrections that arrive AFTER it -- not the whole history the human already
-- considered) WITHOUT hard-locking the bucket. Extend the client's existing
-- column-level update grant (rule, rule_locked, status) to include it.
grant update (rule_written_at) on public.correction_clusters to authenticated;
