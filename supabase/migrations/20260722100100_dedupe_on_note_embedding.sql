-- Learned-Patterns Redesign, Stage 1: repoint the 0.95 dedup from the incoming
-- MESSAGE vector to the correction NOTE vector, so near-duplicates are collapsed
-- by the LESSON they teach, not by how similar the customer's question happened
-- to be. Same 0.95 cosine threshold, same "newest row wins" rule, same
-- O(rows-for-that-client)-per-insert shape as 20260717120000 -- only the column
-- compared changes. This is a NEW migration; the original file is left untouched.
--
-- INVARIANT (spec 4.5): deleting a reply_corrections row here must NEVER touch a
-- cluster counter. It doesn't, structurally -- correction_clusters counters are
-- stored, increment-only integers, and there is no ON DELETE path from
-- reply_corrections back to them (the cluster_id FK points the other way, and
-- deleting a child never mutates the parent). A correction removed as a lesson-
-- duplicate always has an even-closer surviving twin (>= 0.95) that carries the
-- same vote, so the count stays correct.
--
-- TRANSITION NOTE: until note_embedding is backfilled -- and until the Stage 3
-- n8n note-embedding node is live -- a freshly inserted row briefly has a null
-- note_embedding and is simply skipped by this trigger. Dedup resumes for it on
-- the next refresh sweep once its note is embedded. Dedup is a retrieval-quality
-- optimization, so a short gap is harmless.

-- Automatic per-insert trigger: dedupe by lesson (note_embedding) now.
create or replace function public.trg_dedupe_reply_correction()
returns trigger
language plpgsql
as $$
begin
  if NEW.note_embedding is not null then
    delete from public.reply_corrections r
    where r.client_email = NEW.client_email
      and r.id < NEW.id                                -- only older rows; the new one is kept
      and r.note_embedding is not null
      and 1 - (r.note_embedding <=> NEW.note_embedding) >= 0.95;
  end if;
  return NEW;
end;
$$;
-- The trigger object itself is unchanged (still AFTER INSERT ... FOR EACH ROW),
-- so CREATE OR REPLACE on the function is all that's needed.

-- Keep the manual preview/prune helpers consistent with the automatic trigger:
-- both now dedupe by lesson (note_embedding) instead of by customer question.

create or replace function public.report_duplicate_corrections(
  target_client_email text,
  sim_threshold double precision default 0.95
)
returns table (
  older_id bigint,
  newer_id bigint,
  similarity double precision,
  older_note text,
  newer_note text
)
language sql
stable
as $$
  select
    a.id as older_id,
    b.id as newer_id,
    1 - (a.note_embedding <=> b.note_embedding) as similarity,
    a.correction_note as older_note,
    b.correction_note as newer_note
  from public.reply_corrections a
  join public.reply_corrections b
    on a.client_email = b.client_email
   and b.id > a.id                         -- b is the newer row of the pair
  where a.client_email = target_client_email
    and a.note_embedding is not null
    and b.note_embedding is not null
    and 1 - (a.note_embedding <=> b.note_embedding) >= sim_threshold
  order by a.id;
$$;

create or replace function public.prune_duplicate_corrections(
  target_client_email text,
  sim_threshold double precision default 0.95
)
returns integer
language plpgsql
as $$
declare
  deleted_count integer;
begin
  with doomed as (
    select distinct a.id
    from public.reply_corrections a
    join public.reply_corrections b
      on a.client_email = b.client_email
     and b.id > a.id
    where a.client_email = target_client_email
      and a.note_embedding is not null
      and b.note_embedding is not null
      and 1 - (a.note_embedding <=> b.note_embedding) >= sim_threshold
  )
  delete from public.reply_corrections r
  using doomed d
  where r.id = d.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
