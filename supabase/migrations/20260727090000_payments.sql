-- Payment options for the Sites module. Two independent methods a store owner
-- can enable, either or both, from Sites → Settings → Payments:
--   * cash on delivery (COD) — no processor needed; the order is recorded and
--     paid when it arrives.
--   * online card payments — needs a connected Stripe account (Stripe Connect).
--     The connection + real capture is the one true external dependency (keys +
--     the owner signing into their own Stripe); see ECOMMERCE-BUILD.md and
--     BANKING-CONNECTION-GUIDE.md. The order is still recorded meanwhile.
--
-- These flags live on the `sites` row (public-read) so the shopper's checkout
-- can see which methods to offer; owner-write RLS (20260726120000) lets the
-- owner toggle them. `stripe_account_id` is the connected acct_… id (not
-- secret) once onboarding completes.

alter table public.sites
  add column if not exists cod_enabled      boolean not null default false,
  add column if not exists online_enabled   boolean not null default false,
  add column if not exists stripe_account_id text;

-- Record how each order chose to pay ('cod' | 'online'; null = legacy/none).
alter table public.orders
  add column if not exists payment_method text;

-- Recreate place_order() to carry the chosen method through. Adding a
-- defaulted parameter would create a second overload (ambiguous), so drop the
-- old 7-arg signature first, then recreate with the extra arg. Behaviour is
-- otherwise identical: SECURITY DEFINER insert that returns only the new id,
-- so an anon shopper still can't read anyone's orders. payment_status stays
-- 'unpaid' (COD = pay on delivery; online = pending until real capture).
drop function if exists public.place_order(text, jsonb, int, text, text, text, text);

create or replace function public.place_order(
  p_site_slug text,
  p_line_items jsonb,
  p_subtotal_cents int,
  p_email text,
  p_ship_name text,
  p_ship_address text,
  p_currency text default 'USD',
  p_payment_method text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.orders (
    site_slug, line_items, subtotal_cents, currency, email, ship_name, ship_address, payment_method
  )
  values (
    p_site_slug, p_line_items, p_subtotal_cents,
    coalesce(nullif(p_currency, ''), 'USD'), p_email, p_ship_name, p_ship_address,
    nullif(p_payment_method, '')
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.place_order(text, jsonb, int, text, text, text, text, text) from public;
grant execute on function public.place_order(text, jsonb, int, text, text, text, text, text) to anon, authenticated;
