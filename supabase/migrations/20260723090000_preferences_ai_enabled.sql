-- Per-client on/off switch for the LLM parts of the learned-patterns refresh
-- (rule writing + agree/contradict voting). Distinct from
-- clients.learned_patterns_enabled, which gates whether standing rules are
-- INJECTED into replies -- this one gates whether the background refresh
-- SPENDS TOKENS generating/maintaining them at all.
--
-- When off: corrections are still embedded and bucketed (pure math, free) --
-- clustering never stops. Only the two LLM calls (initial rule write, and the
-- agree/contradict check on votes) are skipped. Corrections that land while
-- off are counted as members but keep stance = null permanently -- they are
-- never retroactively checked once the switch is turned back on.
--
-- When re-enabled: any bucket that already has >=5 members and is universal,
-- but has no rule yet (matured while off), gets its rule written immediately
-- on the next refresh. Voting resumes for new corrections going forward.

alter table public.clients
  add column preferences_ai_enabled boolean not null default true;

grant update (preferences_ai_enabled) on public.clients to authenticated;
