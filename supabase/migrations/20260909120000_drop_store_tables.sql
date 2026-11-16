-- Drop the website-builder ("Sites") schema.
--
-- The project briefly included a website builder, storefront, product research
-- and ad tools; they were removed to focus on customer support. Nothing in the
-- support agent reads any of the objects below -- verified by import graph and
-- by the n8n workflow, which touches only email_logs, thread_messages,
-- reply_corrections, learned_patterns, clients, ai_recommendations and
-- documents.
--
-- IRREVERSIBLE. The few rows these tables held were exported before this ran.
--
-- The five migrations that CREATED these objects (20260724090000,
-- 20260724091000, 20260724092000, 20260726120000, 20260727090000) are
-- deliberately kept. They are applied history recorded in
-- supabase_migrations.schema_migrations on the remote; deleting the files
-- would desync local and remote and force a `supabase migration repair`.
-- Schema is removed by adding a migration, never by deleting one.

-- ---------------------------------------------------------------------------
-- 1) the RPC first -- it depends on the tables below
-- ---------------------------------------------------------------------------
-- Both signatures: the original (20260724092000) and the payments-era
-- overload that added p_payment_method (20260727090000). Dropping by explicit
-- argument list so a stale overload cannot survive.
drop function if exists public.place_order(text, jsonb, int, text, text, text, text);
drop function if exists public.place_order(text, jsonb, int, text, text, text, text, text);

-- ---------------------------------------------------------------------------
-- 2) the tables
-- ---------------------------------------------------------------------------
-- Indexes (sites_client_idx, products_client_collection_idx, orders_site_idx),
-- RLS policies and grants are owned by these tables and are dropped with them.
-- No other table references them, so no cascade is needed -- if one somehow
-- does, this migration should fail loudly rather than silently remove it.
drop table if exists public.orders;
drop table if exists public.products;
drop table if exists public.sites;

-- ---------------------------------------------------------------------------
-- 3) what remains
-- ---------------------------------------------------------------------------
-- Every table left in `public` belongs to the customer-support agent:
--   email_logs, thread_messages, reply_corrections, correction_clusters,
--   learned_patterns, clients, documents, ai_recommendations,
--   ai_service_schedule, waitlist_signups
--
-- After applying, regenerate the types -- do not hand-edit them:
--   npx supabase gen types typescript --linked > src/lib/database.types.ts
