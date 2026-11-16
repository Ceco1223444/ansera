-- Learned-Patterns Redesign: the DB half of the reply-prompt swap (spec 6.3).
-- Encapsulates "the standing (universal) rules to inject for this client" AND the
-- per-client toggle guard in one place, so the Stage 3 n8n change is a single
-- node that calls this function instead of reading the learned_patterns blob.
--
-- INERT until Stage 3: adding this function changes nothing on its own -- the
-- live reply path does not call it until Build Memory Context is rewired (and
-- that only happens after the shadow groupings are approved).
--
-- Toggle semantics (spec 4.6): when learned_patterns_enabled is false this
-- returns ZERO rows, so no standing rules are injected -- but per-ticket
-- retrieval (match_reply_corrections) is untouched and still runs. OFF != dumb.

create or replace function public.get_standing_rules(target_client_email text)
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
    and cc.is_universal                      -- topic-specific lessons stay in retrieval only
    and cc.rule is not null                  -- only clusters that have matured to a written rule
  order by cc.support_count desc;
$$;

grant execute on function public.get_standing_rules(text) to service_role;
