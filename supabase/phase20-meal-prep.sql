-- ZahraaFit — Phase 20: meal prep (ready boxes) and her own shopping items
-- Run this whole file once in the Supabase SQL Editor (after phase19-basics.sql).
-- Safe to run again.

begin;

-- Boxes she cooked ahead: one row per box, with its calories and how long it keeps.
create table if not exists public.prep_boxes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  batch uuid not null,
  name text not null check (length(name) between 1 and 160),
  detail text check (detail is null or length(detail) <= 300),
  grams numeric(7, 1) check (grams is null or grams between 0 and 5000),
  cal numeric(7, 1) not null check (cal between 0 and 10000),
  p numeric(6, 1) not null default 0 check (p between 0 and 1000),
  c numeric(6, 1) not null default 0 check (c between 0 and 1000),
  f numeric(6, 1) not null default 0 check (f between 0 and 1000),
  made_on date not null,
  place text not null default 'fridge' check (place in ('fridge', 'freezer')),
  fridge_days integer not null check (fridge_days between 0 and 14),
  freezer_days integer check (freezer_days is null or freezer_days between 0 and 365),
  use_by date not null,
  eaten_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists prep_boxes_client_idx on public.prep_boxes (client_id, eaten_at, use_by);

-- Things she adds to the shopping list herself (or from meal prep).
create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  amount text check (amount is null or length(amount) <= 40),
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists shopping_items_client_idx on public.shopping_items (client_id, created_at);

grant select, insert, update, delete on public.prep_boxes, public.shopping_items to authenticated;
alter table public.prep_boxes enable row level security;
alter table public.shopping_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array['prep_boxes', 'shopping_items'] loop
    execute format('drop policy if exists "Owner or admin reads" on public.%I', t);
    execute format('create policy "Owner or admin reads" on public.%I for select to authenticated using (public.is_admin() or public.owns_client(client_id))', t);
    execute format('drop policy if exists "Owner writes" on public.%I', t);
    execute format('create policy "Owner writes" on public.%I for insert to authenticated with check (public.owns_client(client_id))', t);
    execute format('drop policy if exists "Owner updates" on public.%I', t);
    execute format('create policy "Owner updates" on public.%I for update to authenticated using (public.owns_client(client_id)) with check (public.owns_client(client_id))', t);
    execute format('drop policy if exists "Owner deletes" on public.%I', t);
    execute format('create policy "Owner deletes" on public.%I for delete to authenticated using (public.owns_client(client_id))', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
