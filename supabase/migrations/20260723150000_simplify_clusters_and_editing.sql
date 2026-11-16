-- Learned-Patterns simplification (2026-07-23): drop the support/oppose vote
-- tracking and the universal/topic-specific split entirely. A bucket is now
-- just "corrections that teach the same lesson" -- once it reaches 5 members,
-- the AI writes ONE summary from every note in it; the summary refreshes once
-- per day (whenever the bucket's membership changed since its last summary),
-- never per individual correction. In the real world a client doesn't
-- contradict their own past corrections; if a bucket's notes ever do conflict
-- and the AI's combined summary comes out wrong, that's what the new editable
-- Learned Patterns table (below) is for -- a human fixes it directly, not more
-- automated machinery.
--
-- Retrieval (Stage 3, not yet wired): every active bucket's rule is injected
-- in ONE combined text via get_standing_rules -- no similarity filtering like
-- match_reply_corrections uses for individual corrections, since a standing
-- rule is meant to apply everywhere by definition. That's also why the
-- clustering threshold (ai-service/clustering.py CLUSTER_THRESHOLD) is lower
-- than per-ticket matching: fewer, broader buckets keep the "inject
-- everything" text a reasonable size.
--
-- Also adds direct edit/delete access for clients over their own Learned
-- Patterns (correction_clusters) and Reply Corrections (reply_corrections), so
-- both are visible and correctable in the app. Reply-correction LOGGING in n8n
-- is completely unaffected by any of this -- only what happens to a correction
-- AFTER it's logged changes.

-- ---------------------------------------------------------------------------
-- 1) drop the functions that reference columns being removed below (Postgres
--    won't let CREATE OR REPLACE change a function's output columns, so these
--    are dropped outright and recreated further down)
-- ---------------------------------------------------------------------------
drop function if exists public.report_clusters(text);
drop function if exists public.get_standing_rules(text);

-- ---------------------------------------------------------------------------
-- 2) schema: remove vote/universal tracking, add what editing needs
-- ---------------------------------------------------------------------------
alter table public.correction_clusters
  drop column support_count,
  drop column oppose_count,
  drop column incoming_spread,
  drop column is_universal,
  add column rule_locked boolean not null default false;  -- true once a human edits the rule by hand; blocks auto-resummarize

alter table public.reply_corrections
  drop column stance;   -- no more support/oppose polarity to track

-- ---------------------------------------------------------------------------
-- 3) report_clusters: read-only preview, updated for the simplified schema
--    select * from report_clusters('client@example.com');
-- ---------------------------------------------------------------------------
create function public.report_clusters(target_client_email text)
returns table (
  cluster_id    bigint,
  status        text,
  member_count  int,
  rule          text,
  rule_locked   boolean,
  rule_at_count int,
  updated_at    timestamptz
)
language sql
stable
as $$
  select id, status, member_count, rule, rule_locked, rule_at_count, updated_at
  from public.correction_clusters
  where client_email = target_client_email
  order by member_count desc;
$$;

grant execute on function public.report_clusters(text) to service_role;

-- ---------------------------------------------------------------------------
-- 4) get_standing_rules: the Stage 3 reply-time retrieval. Returns EVERY
--    active, written rule for the client -- no similarity matching, no top-N
--    cutoff -- because a standing rule is universal by definition; the whole
--    point is that it applies regardless of what the current message is
--    about. INERT until Stage 3 wires it into Build Memory Context.
--
--    Toggle semantics unchanged: when learned_patterns_enabled is false this
--    returns ZERO rows -- but per-ticket retrieval (match_reply_corrections) is
--    untouched and still runs. OFF != dumb.
-- ---------------------------------------------------------------------------
create function public.get_standing_rules(target_client_email text)
returns table (rule text)
language sql
stable
as $$
  select cc.rule
  from public.correction_clusters cc
  join public.clients c on c.email = cc.client_email
  where cc.client_email = target_client_email
    and c.learned_patterns_enabled          -- the per-client on/off switch
    and cc.status = 'active'
    and cc.rule is not null                  -- only buckets that have matured to a written rule
  order by cc.member_count desc;
$$;

grant execute on function public.get_standing_rules(text) to service_role;

-- ---------------------------------------------------------------------------
-- 5) Learned Patterns table: client can edit a rule's text (locking it against
--    auto-resummarize) and "delete" a bucket. Delete is implemented as a soft
--    retire (status='retired', rule cleared, lock released) rather than a real
--    SQL DELETE -- matches the existing "buckets are never truly deleted"
--    design (reply_corrections.cluster_id references this table, and a later
--    matching correction should reactivate a retired bucket instead of
--    orphaning history or starting from zero). The app performs this as a
--    plain update to (rule, rule_locked, status); no separate RPC needed.
-- ---------------------------------------------------------------------------
create policy "correction_clusters_update_own" on public.correction_clusters
  for update to authenticated
  using (auth.email() = client_email)
  with check (auth.email() = client_email);

revoke update on public.correction_clusters from authenticated;
grant update (rule, rule_locked, status) on public.correction_clusters to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Reply Corrections table: client can edit a correction's note text, and
--    delete a row outright (nothing references reply_corrections.id as a
--    foreign key, so this is a real, safe SQL DELETE -- unlike clusters, there
--    is no reactivation concept for a single raw correction). Deleting a row
--    here is display/cleanup only: it does NOT retroactively decrement any
--    cluster's member_count, matching the existing increment-only design (the
--    0.95 dedup trigger already never adjusts cluster counters on delete).
-- ---------------------------------------------------------------------------
create policy "reply_corrections_update_own" on public.reply_corrections
  for update to authenticated
  using (auth.email() = client_email)
  with check (auth.email() = client_email);

revoke update on public.reply_corrections from authenticated;
grant update (correction_note) on public.reply_corrections to authenticated;

create policy "reply_corrections_delete_own" on public.reply_corrections
  for delete to authenticated
  using (auth.email() = client_email);
