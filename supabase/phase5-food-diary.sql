-- ZahraaFit — Phase 5: food diary (count calories like MyFitnessPal)
-- Run this whole file once in the Supabase SQL Editor (after phase4-reminders.sql).
-- Safe to run again.

begin;

-- Foods added by hand. owner_id = the subscriber who added it (only she sees it).
-- owner_id null = a ready dish the coach added for everyone.
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  basis text not null default 'serving' check (basis in ('100g', 'serving')),
  serving_label text check (serving_label is null or length(serving_label) <= 40),
  cal numeric(7, 1) not null check (cal between 0 and 5000),
  p numeric(6, 1) not null default 0 check (p between 0 and 500),
  c numeric(6, 1) not null default 0 check (c between 0 and 500),
  f numeric(6, 1) not null default 0 check (f between 0 and 500),
  created_at timestamptz not null default now()
);
create index if not exists foods_owner_idx on public.foods (owner_id);

-- What she ate: one row per item, values already worked out for the amount.
create table if not exists public.food_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  log_date date not null,
  slot text not null check (slot in ('فطور', 'غداء', 'عشاء', 'سناك')),
  name text not null check (length(name) between 1 and 160),
  amount numeric(7, 2) not null check (amount > 0 and amount <= 5000),
  unit text not null check (length(unit) <= 40),
  cal numeric(7, 1) not null check (cal between 0 and 10000),
  p numeric(6, 1) not null default 0 check (p between 0 and 1000),
  c numeric(6, 1) not null default 0 check (c between 0 and 1000),
  f numeric(6, 1) not null default 0 check (f between 0 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists food_entries_client_day_idx on public.food_entries (client_id, log_date);

-- Her daily target when she has no plan from the coach (saved from the calculator).
create table if not exists public.food_targets (
  client_id uuid primary key references public.clients(id) on delete cascade,
  cal integer not null check (cal between 800 and 6000),
  p integer not null check (p between 0 and 500),
  c integer not null check (c between 0 and 900),
  f integer not null check (f between 0 and 400),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.foods, public.food_entries, public.food_targets to authenticated;
alter table public.foods enable row level security;
alter table public.food_entries enable row level security;
alter table public.food_targets enable row level security;

drop policy if exists "Read own and coach foods" on public.foods;
create policy "Read own and coach foods" on public.foods for select to authenticated
  using (owner_id is null or owner_id = auth.uid() or public.is_admin());
drop policy if exists "Add foods" on public.foods;
create policy "Add foods" on public.foods for insert to authenticated
  with check (owner_id = auth.uid() or (owner_id is null and public.is_admin()));
drop policy if exists "Change foods" on public.foods;
create policy "Change foods" on public.foods for update to authenticated
  using (owner_id = auth.uid() or (owner_id is null and public.is_admin()))
  with check (owner_id = auth.uid() or (owner_id is null and public.is_admin()));
drop policy if exists "Remove foods" on public.foods;
create policy "Remove foods" on public.foods for delete to authenticated
  using (owner_id = auth.uid() or (owner_id is null and public.is_admin()));

do $$
declare t text;
begin
  foreach t in array array['food_entries', 'food_targets'] loop
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
