-- ZahraaFit — Phase 15: period tracking (women) and special plans (period days, Ramadan)
-- Run this whole file once in the Supabase SQL Editor (after phase14-reminder-saturday.sql).
-- Safe to run again.

begin;

-- A plan can be a special version: shown instead of the regular one on period days or in Ramadan.
alter table public.plans add column if not exists variant text;
do $$ begin
  alter table public.plans add constraint plans_variant check (variant is null or variant in ('period', 'ramadan'));
exception when duplicate_object then null; end $$;

-- Her periods: start and end dates (end empty while it's on).
create table if not exists public.period_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  constraint period_logs_dates check (end_date is null or (end_date >= start_date and end_date - start_date <= 15))
);
create index if not exists period_logs_client_idx on public.period_logs (client_id, start_date desc);

grant select, insert, update, delete on public.period_logs to authenticated;
alter table public.period_logs enable row level security;
drop policy if exists "Owner or admin reads" on public.period_logs;
create policy "Owner or admin reads" on public.period_logs for select to authenticated using (public.is_admin() or public.owns_client(client_id));
drop policy if exists "Owner writes" on public.period_logs;
create policy "Owner writes" on public.period_logs for insert to authenticated with check (public.owns_client(client_id));
drop policy if exists "Owner updates" on public.period_logs;
create policy "Owner updates" on public.period_logs for update to authenticated using (public.owns_client(client_id)) with check (public.owns_client(client_id));
drop policy if exists "Owner deletes" on public.period_logs;
create policy "Owner deletes" on public.period_logs for delete to authenticated using (public.owns_client(client_id));

notify pgrst, 'reload schema';

commit;
