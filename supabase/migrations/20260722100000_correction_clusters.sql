-- Learned-Patterns Redesign, Stage 1 (SHADOW): the math-driven clustering model
-- that will replace the nightly "re-read a client's ENTIRE correction history and
-- ask an LLM to summarize it" learned_patterns blob.
--
-- This migration is ADDITIVE ONLY. It creates the new cluster table and the
-- columns the incremental refresh writes to, plus a per-client toggle. Nothing
-- here changes what the live reply path reads yet -- that is Stage 3. Until then
-- these columns are populated in shadow and eyeballed via report_clusters()
-- (migration 20260722100200). See docs/architecture.md section 3.

-- ---------------------------------------------------------------------------
-- 1) correction_clusters: one row == one recurring lesson ("bucket").
--    Counters are STORED and increment-only -- never recomputed from live rows,
--    and never decremented when the 0.95 dedup deletes a redundant correction
--    (the vote was already counted; see 20260722100100_dedupe_on_note_embedding).
-- ---------------------------------------------------------------------------
create table public.correction_clusters (
  id              bigint generated always as identity primary key,
  client_email    text not null references public.clients(email),
  centroid        vector(1536) not null,            -- running avg of member note_embeddings
  member_count    int  not null default 1,          -- stored, increment-only, never decremented
  support_count   int  not null default 0,          -- corrections consistent with the current rule
  oppose_count    int  not null default 0,          -- corrections against the current rule
  incoming_spread double precision,                 -- topic breadth: mean cosine dist of member incoming embeddings
  is_universal    boolean not null default false,   -- cluster spread >= k * client baseline spread
  rule            text,                             -- null until a side reaches 5 (universal clusters only)
  rule_at_count   int,                              -- member_count when the rule was last (re)written
  status          text not null default 'active' check (status in ('active','retired')),
  updated_at      timestamptz not null default now()
);

create index correction_clusters_client_idx
  on public.correction_clusters (client_email, status, is_universal);

alter table public.correction_clusters enable row level security;

-- Mirror learned_patterns' RLS: a client may read their own clusters; every
-- write comes from the service-role key (ai-service), which bypasses RLS -- so
-- there is deliberately no write policy for authenticated.
create policy "correction_clusters_select_own" on public.correction_clusters
  for select to authenticated
  using (auth.email() = client_email);

revoke all on public.correction_clusters from anon;

-- ---------------------------------------------------------------------------
-- 2) reply_corrections: fingerprint the LESSON (note_embedding) and remember
--    which cluster / which side each correction landed on. The existing
--    `embedding` (incoming-message vector) is kept untouched -- it still drives
--    per-ticket retrieval (match_reply_corrections) and the "topic breadth"
--    measurement that decides universal vs topic-specific.
-- ---------------------------------------------------------------------------
alter table public.reply_corrections
  add column note_embedding vector(1536),
  add column cluster_id     bigint references public.correction_clusters(id),
  add column stance         text check (stance in ('support','oppose'));  -- null until polarity is checked

-- Speeds up both "members of cluster C" reads and the "cluster_id is null"
-- (unprocessed) scan the refresh sweep runs each pass.
create index reply_corrections_cluster_idx on public.reply_corrections (cluster_id);

-- ---------------------------------------------------------------------------
-- 3) clients: per-client on/off for injecting the standing (universal) rules.
--    Retrieval ALWAYS runs regardless of this flag; it only gates whether the
--    distilled standing rules are added to the draft (spec 4.6). Grant the
--    column narrowly, exactly like auto_send -- the existing clients_update_own
--    policy already restricts writes to the caller's own row.
-- ---------------------------------------------------------------------------
alter table public.clients
  add column learned_patterns_enabled boolean not null default true;

grant update (learned_patterns_enabled) on public.clients to authenticated;
