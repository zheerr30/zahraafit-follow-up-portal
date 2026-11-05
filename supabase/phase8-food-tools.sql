-- ZahraaFit — Phase 8: barcode products and AI photo limits
-- Run this whole file once in the Supabase SQL Editor (after phase7-weekly-followup.sql).
-- Safe to run again.

begin;

-- Products found by barcode (from Open Food Facts or read from a label), shared by everyone.
-- Values per 100 g (or 100 ml).
create table if not exists public.barcode_products (
  barcode text primary key check (barcode ~ '^[0-9]{6,14}$'),
  name text not null check (length(trim(name)) between 1 and 160),
  brand text check (brand is null or length(brand) <= 120),
  cal numeric(7, 1) not null check (cal between 0 and 1000),
  p numeric(6, 1) not null default 0 check (p between 0 and 100),
  c numeric(6, 1) not null default 0 check (c between 0 and 100),
  f numeric(6, 1) not null default 0 check (f between 0 and 100),
  serving_g numeric(7, 1) check (serving_g is null or serving_g between 1 and 2000),
  serving_label text check (serving_label is null or length(serving_label) <= 40),
  source text not null default 'label' check (source in ('off', 'label', 'manual')),
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

grant select, insert on public.barcode_products to authenticated;
grant update, delete on public.barcode_products to authenticated;
alter table public.barcode_products enable row level security;

drop policy if exists "Everyone reads products" on public.barcode_products;
create policy "Everyone reads products" on public.barcode_products for select to authenticated using (true);
drop policy if exists "Anyone adds a product" on public.barcode_products;
create policy "Anyone adds a product" on public.barcode_products for insert to authenticated
  with check (added_by = auth.uid());
drop policy if exists "Coach fixes products" on public.barcode_products;
create policy "Coach fixes products" on public.barcode_products for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Coach removes products" on public.barcode_products;
create policy "Coach removes products" on public.barcode_products for delete to authenticated
  using (public.is_admin());

-- Serving weight for foods added by hand (so she can log "1 حصة" of a per-100 g food).
alter table public.foods add column if not exists serving_g numeric(7, 1);
do $$ begin
  alter table public.foods add constraint foods_serving_g check (serving_g is null or serving_g between 1 and 2000);
exception when duplicate_object then null; end $$;

-- How many AI photo reads each person used today (limits cost).
create table if not exists public.ai_usage (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  kind text not null,
  count integer not null default 0,
  primary key (profile_id, day, kind)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

-- Takes one use if she is under today's limit. Limits live here, not in the app.
create or replace function public.ai_take(p_kind text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  lim integer := case p_kind when 'meal' then 15 when 'label' then 15 else 0 end;
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
