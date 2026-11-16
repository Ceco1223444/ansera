-- Runtime home for the n8n webhook URL used by "Approve & Send".
--
-- n8n runs locally and is reached through a Cloudflare quick tunnel whose URL
-- changes several times a day. Keeping that URL in `supabase secrets` meant it
-- could only be updated with a CLI access token, so the deployed approve-reply
-- function kept calling a dead tunnel and every approval failed with a 502.
--
-- The URL is runtime state, not a deploy-time secret, so it lives here instead:
--   * scripts/tunnel-sync.ps1 upserts it over the REST API (service-role key)
--     every time the tunnel starts or rotates;
--   * approve-reply reads it at call time and falls back to the
--     N8N_WEBHOOK_URL secret while the table is still empty.

create table if not exists public.service_config (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

comment on table public.service_config is
  'Small key/value store for runtime service endpoints that change too often to live in supabase secrets. Service-role only -- never exposed to the browser.';

-- ---------------------------------------------------------------------------
-- access: service_role only
-- ---------------------------------------------------------------------------
-- This table holds internal endpoints. No client ever reads it -- only the
-- Edge Functions (service role) and tunnel-sync.ps1 (service role). RLS is on
-- with no policies, which denies anon and authenticated outright; service_role
-- bypasses RLS by design.
alter table public.service_config enable row level security;

revoke all on public.service_config from anon;
revoke all on public.service_config from authenticated;
grant select, insert, update on public.service_config to service_role;
