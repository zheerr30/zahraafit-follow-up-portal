-- ZahraaFit — Phase 2: interactive plans and the subscriber's logs
-- Run this whole file once in the Supabase SQL Editor (after phase1-plan-requests.sql).
-- Safe to run again.

begin;

-- Plan data exported from the generators, next to the PDF file.
alter table public.plans add column if not exists data jsonb;
alter table public.plans add column if not exists kind text;
alter table public.plans drop constraint if exists plans_kind_check;
alter table public.plans add constraint plans_kind_check check (kind is null or kind in ('nutrition', 'workout', 'other'));

-- Helper: is this client row the signed-in subscriber's own?
create or replace function public.owns_client(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.clients c where c.id = target and c.profile_id = auth.uid());
$$;
grant execute on function public.owns_client(uuid) to authenticated;

-- One row per subscriber per day: meals she ticked, water cups.
create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  log_date date not null,
  meals jsonb not null default '{}'::jsonb,
  water integer not null default 0 check (water between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, log_date)
);

-- Each finished workout session with the weights and reps she logged.
create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  day_index integer not null,
  day_title text,
  performed_on date not null default current_date,
  duration_sec integer check (duration_sec is null or duration_sec between 0 and 86400),
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Weight and measurements, one row per day.
create table if not exists public.body_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  log_date date not null,
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg between 20 and 300),
  waist_cm numeric(6, 2) check (waist_cm is null or waist_cm between 20 and 250),
  hips_cm numeric(6, 2) check (hips_cm is null or hips_cm between 20 and 250),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, log_date)
);

-- Her swaps on a plan (ingredient and meal swaps), one row per plan.
create table if not exists public.plan_choices (
  plan_id uuid primary key references public.plans(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists daily_logs_client_idx on public.daily_logs (client_id, log_date desc);
create index if not exists workout_logs_client_idx on public.workout_logs (client_id, created_at desc);
create index if not exists body_logs_client_idx on public.body_logs (client_id, log_date desc);

drop trigger if exists daily_logs_set_updated_at on public.daily_logs;
create trigger daily_logs_set_updated_at before update on public.daily_logs for each row execute function public.set_updated_at();
drop trigger if exists body_logs_set_updated_at on public.body_logs;
create trigger body_logs_set_updated_at before update on public.body_logs for each row execute function public.set_updated_at();
drop trigger if exists plan_choices_set_updated_at on public.plan_choices;
create trigger plan_choices_set_updated_at before update on public.plan_choices for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.daily_logs, public.workout_logs, public.body_logs, public.plan_choices to authenticated;

do $$
declare t text;
begin
  foreach t in array array['daily_logs', 'workout_logs', 'body_logs', 'plan_choices'] loop
    execute format('alter table public.%I enable row level security', t);
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

-- A plan_choices row must point at one of her own plans.
create or replace function public.plan_choices_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.plans p where p.id = new.plan_id and p.client_id = new.client_id) then
    raise exception 'plan does not belong to this client';
  end if;
  return new;
end;
$$;
drop trigger if exists plan_choices_guard_trg on public.plan_choices;
create trigger plan_choices_guard_trg before insert or update on public.plan_choices for each row execute function public.plan_choices_guard();

notify pgrst, 'reload schema';

commit;
