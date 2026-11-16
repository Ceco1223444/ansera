-- Storefront builder: the `sites` table is where a generated storefront
-- actually lives. This replaces the earlier plan of pushing generated
-- storefronts into a real Shopify store's Admin API -- there is no external
-- platform in this design at all. A "site" is a single row: the AI-generated
-- plan (composer.py's output, see ai-service/storefront/composer.py), saved
-- once, and rendered directly by our own StorefrontPage.tsx whenever a
-- shopper visits /store/<slug>. See SHOPIFY-BUILD.md for the full picture.

create table public.sites (
  id           bigint generated always as identity primary key,
  client_email text not null references public.clients(email),
  slug         text not null unique,        -- the public URL segment: /store/<slug>
  store_name   text not null,
  tagline      text not null,
  theme        jsonb not null,              -- {color_scheme, heading_font, body_font, density}
  sections     jsonb not null,              -- ordered array of composed sections (composer.py output)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index sites_client_idx on public.sites (client_email, created_at desc);

alter table public.sites enable row level security;

-- Storefronts are PUBLIC pages by nature -- anyone visiting /store/<slug>
-- must be able to read the site, logged in or not. This is the opposite of
-- every other table in this schema (which scope reads to auth.email()), and
-- is deliberate: a storefront is meant to be seen by shoppers who have no
-- Ansera account at all.
create policy "sites_select_public" on public.sites
  for select to anon, authenticated
  using (true);

-- Writes come only from ai-service's /generate-storefront endpoint via the
-- Supabase service-role key, which bypasses RLS entirely -- same pattern as
-- learned_patterns and correction_clusters. No insert/update policy for
-- anon/authenticated is granted on purpose: a client cannot write directly
-- to their own storefront from the browser, only through a generation call.
grant select on public.sites to anon, authenticated;
