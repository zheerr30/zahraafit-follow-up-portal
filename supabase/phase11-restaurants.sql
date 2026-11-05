-- ZahraaFit — Phase 11: restaurants in «سعراتي»
-- Run this whole file once in the Supabase SQL Editor (after phase10-favorites.sql).
-- Safe to run again.

begin;

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 80),
  emoji text check (emoji is null or length(emoji) <= 8),
  added_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Menu items with the calories printed on the menu. Shared by everyone.
create table if not exists public.restaurant_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  cal numeric(7, 1) not null check (cal between 0 and 5000),
  p numeric(6, 1) check (p is null or p between 0 and 500),
  c numeric(6, 1) check (c is null or c between 0 and 500),
  f numeric(6, 1) check (f is null or f between 0 and 500),
  coach_pick boolean not null default false,
  tip text check (tip is null or length(tip) <= 300),
  added_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (restaurant_id, name)
);
create index if not exists restaurant_items_rest_idx on public.restaurant_items (restaurant_id);

grant select, insert, update, delete on public.restaurants, public.restaurant_items to authenticated;
alter table public.restaurants enable row level security;
alter table public.restaurant_items enable row level security;

drop policy if exists "Everyone reads restaurants" on public.restaurants;
create policy "Everyone reads restaurants" on public.restaurants for select to authenticated using (true);
drop policy if exists "Anyone adds a restaurant" on public.restaurants;
create policy "Anyone adds a restaurant" on public.restaurants for insert to authenticated with check (added_by = auth.uid());
drop policy if exists "Coach edits restaurants" on public.restaurants;
create policy "Coach edits restaurants" on public.restaurants for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Coach removes restaurants" on public.restaurants;
create policy "Coach removes restaurants" on public.restaurants for delete to authenticated using (public.is_admin());

drop policy if exists "Everyone reads items" on public.restaurant_items;
create policy "Everyone reads items" on public.restaurant_items for select to authenticated using (true);
-- Subscribers add items (never as coach picks); the coach can add anything.
drop policy if exists "Anyone adds an item" on public.restaurant_items;
create policy "Anyone adds an item" on public.restaurant_items for insert to authenticated
  with check (added_by = auth.uid() and (public.is_admin() or (coach_pick = false and tip is null)));
drop policy if exists "Coach or adder edits items" on public.restaurant_items;
create policy "Coach or adder edits items" on public.restaurant_items for update to authenticated
  using (public.is_admin() or added_by = auth.uid())
  with check (public.is_admin() or (added_by = auth.uid() and coach_pick = false and tip is null));
drop policy if exists "Coach or adder removes items" on public.restaurant_items;
create policy "Coach or adder removes items" on public.restaurant_items for delete to authenticated
  using (public.is_admin() or added_by = auth.uid());

-- Popular restaurants to start with (names only; items come from menu photos).
insert into public.restaurants (name, emoji, added_by) values
  ('البيك', '🍗', null), ('كودو', '🥪', null), ('هرفي', '🍔', null), ('ماكدونالدز', '🍟', null),
  ('برجر كنج', '🍔', null), ('كنتاكي', '🍗', null), ('شاورمر', '🌯', null), ('صب واي', '🥖', null),
  ('ستاربكس', '☕', null), ('دانكن', '🍩', null), ('بيتزا هت', '🍕', null), ('دومينوز', '🍕', null)
on conflict (name) do nothing;

-- Menu photos count toward the daily AI limit too.
create or replace function public.ai_take(p_kind text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  lim integer := case p_kind when 'meal' then 15 when 'label' then 15 when 'menu' then 10 else 0 end;
  today date := (now() at time zone 'Asia/Riyadh')::date;
  n integer;
begin
  if auth.uid() is null or lim = 0 then return false; end if;
  if public.is_admin() then lim := 200; end if;
  insert into public.ai_usage (profile_id, day, kind, count) values (auth.uid(), today, p_kind, 1)
  on conflict (profile_id, day, kind) do update set count = public.ai_usage.count + 1
  where public.ai_usage.count < lim
  returning count into n;
  return n is not null;
end $$;
revoke all on function public.ai_take(text) from public, anon;
grant execute on function public.ai_take(text) to authenticated;

notify pgrst, 'reload schema';

commit;
