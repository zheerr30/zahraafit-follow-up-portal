-- ZahraaFit — Phase 10: favorite foods and saved meals in the food diary
-- Run this whole file once in the Supabase SQL Editor (after phase9-gender.sql).
-- Safe to run again.

begin;

-- kind 'item': one food she likes (data = the food and its values)
-- kind 'meal': several items she eats together (data = { items: [...] })
create table if not exists public.saved_foods (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('item', 'meal')),
  name text not null check (length(trim(name)) between 1 and 120),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 20000),
  created_at timestamptz not null default now()
);
create index if not exists saved_foods_profile_idx on public.saved_foods (profile_id, kind);

grant select, insert, update, delete on public.saved_foods to authenticated;
alter table public.saved_foods enable row level security;
drop policy if exists "Own saved foods" on public.saved_foods;
create policy "Own saved foods" on public.saved_foods for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

notify pgrst, 'reload schema';

commit;
