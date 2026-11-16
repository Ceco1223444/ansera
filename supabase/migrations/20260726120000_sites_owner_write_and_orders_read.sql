-- Sites module goes fully live: the MANUAL builder (Sites → Pages/Design/
-- Settings) and the order views need the storefront owner to work with their
-- own rows straight from the authenticated browser client, the same way
-- `products` already does (20260724091000).
--
-- This intentionally SUPERSEDES the original note on `sites` (20260724090000)
-- that said "a client cannot write directly to their own storefront, only
-- through a generation call." That was true when the AI generator was the only
-- way to make a store. Now a human can build and edit one by hand, so owners
-- get scoped write on their OWN sites. Security is unchanged in spirit: every
-- policy is pinned to `auth.email() = client_email`, so a user can only ever
-- touch their own storefronts — never anyone else's. The AI path still writes
-- via the service-role key (which bypasses RLS) and still stamps client_email
-- server-side, so it is unaffected.

-- ---------------------------------------------------------------------------
-- sites: owner-scoped insert / update / delete (public SELECT already exists).
-- ---------------------------------------------------------------------------
create policy "sites_insert_own" on public.sites
  for insert to authenticated
  with check (auth.email() = client_email);

create policy "sites_update_own" on public.sites
  for update to authenticated
  using (auth.email() = client_email)
  with check (auth.email() = client_email);

create policy "sites_delete_own" on public.sites
  for delete to authenticated
  using (auth.email() = client_email);

grant insert, update, delete on public.sites to authenticated;

-- Note on delete: orders.site_slug references sites(slug), so deleting a store
-- that already has orders is blocked by that foreign key (by design — order
-- history is kept). The builder surfaces that as a friendly "has orders" error
-- rather than cascading real sales records away.

-- ---------------------------------------------------------------------------
-- orders: let an owner READ the orders placed against their OWN stores.
--
-- orders deliberately has no anon SELECT (a shopper must never read another
-- shopper's order — see 20260724091000). This adds a tightly-scoped read for
-- authenticated owners only: you can see an order row solely when its
-- site_slug belongs to a store whose client_email is you. One shopper still
-- can't read another's order (they aren't authenticated owners of the store);
-- only the store owner can, and only for their own stores.
-- ---------------------------------------------------------------------------
create policy "orders_select_own_sites" on public.orders
  for select to authenticated
  using (
    site_slug in (select slug from public.sites where client_email = auth.email())
  );

grant select on public.orders to authenticated;
