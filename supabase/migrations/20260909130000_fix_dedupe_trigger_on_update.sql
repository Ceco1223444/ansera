-- Fix: automatic duplicate-correction prevention never actually ran.
--
-- Proven live on 2026-09-09. A correction 99.6% identical to an existing one
-- was inserted exactly the way n8n's "Log Correction" node inserts it, then a
-- full refresh sweep was run. It survived both. Only a manual call to
-- prune_duplicate_corrections() removed it.
--
-- WHY: the dedupe trigger (20260717120000, repointed by 20260722100100) is
-- AFTER INSERT only, and its body does nothing when NEW.note_embedding is
-- null. But n8n writes `embedding` (the customer's message vector) and leaves
-- `note_embedding` (the lesson vector) null -- confirmed on the live row
-- logged during that test: embedding set, note_embedding null. The refresh
-- sweep fills note_embedding later with a PATCH, which is an UPDATE, and the
-- trigger does not fire on UPDATE. So the check ran only at a moment when the
-- column it depends on was guaranteed to be empty.
--
-- The original migration anticipated the gap ("Dedup resumes for it on the
-- next refresh sweep once its note is embedded") but that resumption was never
-- wired: nothing re-evaluates the row after the backfill.
--
-- FIX: also fire on the UPDATE that populates note_embedding. Same 0.95
-- threshold, same "newest row wins" rule, same comparison -- only the trigger
-- event changes.
--
-- The alternative fix -- having n8n compute the note embedding at insert time
-- -- is still worth doing (it would dedupe immediately rather than at the next
-- sweep), but it requires an n8n workflow change and would leave this trigger
-- broken for every row already in the table. This migration fixes the
-- database half, and is correct whether or not n8n is ever changed.

create or replace function public.trg_dedupe_reply_correction()
returns trigger
language plpgsql
as $$
begin
  -- Nothing to compare against yet: an insert from n8n arrives with a null
  -- note_embedding and is simply skipped, exactly as before.
  if NEW.note_embedding is null then
    return NEW;
  end if;

  -- On UPDATE, only act when note_embedding actually changed. Without this,
  -- every unrelated update to the row (cluster_id assignment during the sweep,
  -- a human editing the note in the app) would re-run the scan for no reason.
  if TG_OP = 'UPDATE' and OLD.note_embedding is not distinct from NEW.note_embedding then
    return NEW;
  end if;

  delete from public.reply_corrections r
  where r.client_email = NEW.client_email
    and r.id < NEW.id                                -- only older rows; the new one is kept
    and r.note_embedding is not null
    and 1 - (r.note_embedding <=> NEW.note_embedding) >= 0.95;

  return NEW;
end;
$$;

-- The trigger object itself has to be recreated: CREATE OR REPLACE on the
-- function cannot change which events fire it.
drop trigger if exists dedupe_reply_correction on public.reply_corrections;
create trigger dedupe_reply_correction
  after insert or update of note_embedding on public.reply_corrections
  for each row
  execute function public.trg_dedupe_reply_correction();

-- NOTE on cluster counters, unchanged from 20260722100100's invariant:
-- correction_clusters.member_count is a stored, increment-only integer, and
-- deleting a correction never decrements it. A row removed here always has a
-- surviving twin at >= 0.95 carrying the same lesson, so the count still
-- reflects the number of lessons folded in. This migration does not change
-- that behaviour; it only makes the dedupe actually happen.
