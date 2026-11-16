-- Learned-Patterns Redesign, Stage 2 (PREVIEW / TUNE): a read-only view of the
-- shadow clustering, so a human can eyeball the 0.85 grouping and the
-- universal/topic split on REAL data before anything goes live -- exactly the
-- cautious path used for the 0.95 dedup threshold (report_duplicate_corrections).
-- Non-destructive; safe to run against production at any time.
--
--   select * from report_clusters('client@example.com');
--
-- Read each row as: how many corrections landed in this bucket (member_count),
-- how the current vote stands (support/oppose), how topically broad it is
-- (incoming_spread) vs whether that cleared the universal bar (is_universal),
-- and the standing rule that would be injected once live (rule). rule_at_count
-- shows the member_count when the rule was last written -- a large gap to the
-- current member_count means fresh members have arrived since (dirty check).

create or replace function public.report_clusters(target_client_email text)
returns table (
  cluster_id      bigint,
  status          text,
  member_count    int,
  support_count   int,
  oppose_count    int,
  incoming_spread double precision,
  is_universal    boolean,
  rule            text,
  rule_at_count   int,
  updated_at      timestamptz
)
language sql
stable
as $$
  select
    id,
    status,
    member_count,
    support_count,
    oppose_count,
    incoming_spread,
    is_universal,
    rule,
    rule_at_count,
    updated_at
  from public.correction_clusters
  where client_email = target_client_email
  order by is_universal desc, support_count desc, member_count desc;
$$;

grant execute on function public.report_clusters(text) to service_role;
