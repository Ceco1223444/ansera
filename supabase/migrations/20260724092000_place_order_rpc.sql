-- Storefront checkout: a safe way for an anonymous shopper to place an order
-- AND get back the new order id.
--
-- The orders table (20260724091000) lets anon INSERT but deliberately has no
-- SELECT policy — a shopper must not be able to read other people's orders.
-- But the checkout wants to show "Order #123", which needs the inserted id
-- back, and INSERT ... RETURNING is blocked by that missing SELECT. Rather
-- than open up SELECT (unsafe — anyone could read any order), order creation
-- goes through this SECURITY DEFINER function: it runs as the owner, inserts
-- the row, and returns ONLY the new id. Nothing else about orders becomes
-- readable. This is also the natural place to later harden trust (e.g.
-- recompute the subtotal from real product prices instead of trusting the
-- client) without touching the frontend.

create or replace function public.place_order(
  p_site_slug text,
  p_line_items jsonb,
  p_subtotal_cents int,
  p_email text,
  p_ship_name text,
  p_ship_address text,
  p_currency text default 'USD'
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.orders (
    site_slug, line_items, subtotal_cents, currency, email, ship_name, ship_address
  )
  values (
    p_site_slug, p_line_items, p_subtotal_cents,
    coalesce(nullif(p_currency, ''), 'USD'), p_email, p_ship_name, p_ship_address
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Order creation now flows ONLY through this controlled function: revoke the
-- direct-insert path so a client can't fabricate an orders row via plain REST.
drop policy if exists "orders_insert_anyone" on public.orders;
revoke insert on public.orders from anon, authenticated;

revoke all on function public.place_order(text, jsonb, int, text, text, text, text) from public;
grant execute on function public.place_order(text, jsonb, int, text, text, text, text) to anon, authenticated;
