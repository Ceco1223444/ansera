-- Storefront builder, ecommerce layer: the catalog and the orders behind a
-- generated storefront. Like `sites` (20260724090000), these are OUR OWN
-- tables -- there is no Shopify, no external store. A client's products live
-- here; a shopper's order lands here. See SHOPIFY-BUILD.md.

-- ---------------------------------------------------------------------------
-- products: one row == one item in a client's catalog. `collection` is the
-- handle a storefront's featured_collection section references
-- (section.settings.collection); 'all' is the default catch-all bucket so a
-- brand-new store shows everything without the client having to curate
-- collections first.
-- ---------------------------------------------------------------------------
create table public.products (
  id           bigint generated always as identity primary key,
  client_email text not null references public.clients(email),
  collection   text not null default 'all',
  title        text not null,
  description  text,
  price_cents  int  not null default 0,      -- integer minor units; the UI formats it
  currency     text not null default 'USD',
  image_url    text,
  stock        int,                          -- null = untracked / unlimited
  active       boolean not null default true,
  position     int  not null default 0,      -- display order within a collection
  created_at   timestamptz not null default now()
);

create index products_client_collection_idx
  on public.products (client_email, collection, position);

alter table public.products enable row level security;

-- Public read: a storefront is a public page, so a shopper with no account
-- must be able to load the catalog. Writes are the owner's own, straight from
-- the admin UI (authenticated, scoped to their own email) -- no service-role
-- round-trip needed for plain product management.
create policy "products_select_public" on public.products
  for select to anon, authenticated using (true);
create policy "products_insert_own" on public.products
  for insert to authenticated with check (auth.email() = client_email);
create policy "products_update_own" on public.products
  for update to authenticated using (auth.email() = client_email)
  with check (auth.email() = client_email);
create policy "products_delete_own" on public.products
  for delete to authenticated using (auth.email() = client_email);

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

-- ---------------------------------------------------------------------------
-- orders: one row == one shopper checkout against a storefront. Line items are
-- snapshotted into jsonb at purchase time (title + price as they were when
-- bought), so later edits to `products` never rewrite someone's order history.
-- `payment_status` starts 'unpaid': actually charging a card needs a licensed
-- processor (Stripe) and is the one credential-gated boundary -- see
-- SHOPIFY-BUILD.md. An order is recorded regardless, so nothing is lost.
-- ---------------------------------------------------------------------------
create table public.orders (
  id             bigint generated always as identity primary key,
  site_slug      text not null references public.sites(slug),
  line_items     jsonb not null,             -- [{product_id, title, price_cents, qty}, ...]
  subtotal_cents int  not null,
  currency       text not null default 'USD',
  email          text not null,              -- shopper's contact email
  ship_name      text,
  ship_address   text,
  status         text not null default 'placed'
                   check (status in ('placed','fulfilled','cancelled')),
  payment_status text not null default 'unpaid'
                   check (payment_status in ('unpaid','paid','refunded')),
  created_at     timestamptz not null default now()
);

create index orders_site_idx on public.orders (site_slug, created_at desc);

alter table public.orders enable row level security;

-- A shopper (anon) must be able to PLACE an order (insert), but never read
-- other people's orders -- so there is an insert policy but deliberately no
-- broad select policy for anon. The storefront owner reading their own orders
-- back is done through the service role (or a future scoped view); keeping a
-- naive "select own by email" off anon avoids leaking one shopper's order to
-- another just because they typed the same email.
create policy "orders_insert_anyone" on public.orders
  for insert to anon, authenticated with check (true);

grant insert on public.orders to anon, authenticated;
