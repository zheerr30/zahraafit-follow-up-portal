-- ZahraaFit — Phase 21: off days (a day without counting calories), and fiber/sodium/potassium/sugar on logged food
-- Run this whole file once in the Supabase SQL Editor (after phase20-meal-prep.sql).
-- Safe to run again.

begin;

-- How many off days a week (Saturday → Friday) each person gets, and a fixed weekly
-- free day the coach can set in a subscriber's plan (0 = Sunday … 6 = Saturday).
alter table public.clients add column if not exists off_limit integer not null default 1;
alter table public.clients add column if not exists off_weekday integer;
do $$ begin
  alter table public.clients add constraint clients_off_limit check (off_limit between 0 and 3);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.clients add constraint clients_off_weekday check (off_weekday is null or off_weekday between 0 and 6);
exception when duplicate_object then null; end $$;

create table if not exists public.off_days (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  unique (client_id, day)
);
grant select on public.off_days to authenticated;
alter table public.off_days enable row level security;
drop policy if exists "Owner or admin reads" on public.off_days;
create policy "Owner or admin reads" on public.off_days for select to authenticated using (public.is_admin() or public.owns_client(client_id));

-- Saturday that starts the week of a day.
create or replace function public.week_start(d date)
returns date language sql immutable as $$ select d - ((extract(dow from d)::integer + 1) % 7) $$;

-- Pick an off day (today or later, up to 30 days ahead), within the weekly limit.
create or replace function public.set_off_day(p_day date)
returns void language plpgsql security definer set search_path = public
as $$
declare
  c record;
  today date := public.riyadh_today();
  used integer;
begin
  select id, off_limit, off_weekday into c from public.clients where profile_id = auth.uid();
  if c.id is null then raise exception 'no client'; end if;
  if p_day < today or p_day > today + 30 then raise exception 'date'; end if;
  if c.off_weekday is not null and extract(dow from p_day)::integer = c.off_weekday then raise exception 'already'; end if;
  select count(*) into used from public.off_days o
  where o.client_id = c.id and public.week_start(o.day) = public.week_start(p_day);
  -- the plan's fixed free day counts toward the week
  if c.off_weekday is not null then used := used + 1; end if;
  if used >= c.off_limit then raise exception 'limit'; end if;
  insert into public.off_days (client_id, day) values (c.id, p_day) on conflict (client_id, day) do nothing;
end $$;
revoke all on function public.set_off_day(date) from public, anon;
grant execute on function public.set_off_day(date) to authenticated;

-- Cancel an off day before it starts.
create or replace function public.cancel_off_day(p_day date)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if p_day <= public.riyadh_today() then raise exception 'started'; end if;
  delete from public.off_days o using public.clients c
  where o.client_id = c.id and c.profile_id = auth.uid() and o.day = p_day;
end $$;
revoke all on function public.cancel_off_day(date) from public, anon;
grant execute on function public.cancel_off_day(date) to authenticated;

-- «تفاصيل أكثر» in the calorie card: values for logged food (null = no data for it).
alter table public.food_entries add column if not exists fiber numeric(7, 1);
alter table public.food_entries add column if not exists sodium numeric(8, 1);
alter table public.food_entries add column if not exists potassium numeric(8, 1);
alter table public.food_entries add column if not exists sugar numeric(7, 1);
do $$ begin
  alter table public.food_entries add constraint food_entries_micros check (
    (fiber is null or fiber between 0 and 500) and (sodium is null or sodium between 0 and 50000)
    and (potassium is null or potassium between 0 and 50000) and (sugar is null or sugar between 0 and 2000));
exception when duplicate_object then null; end $$;

-- The coach can hide «تفاصيل أكثر» for any subscriber.
alter table public.clients add column if not exists hide_micros boolean not null default false;

notify pgrst, 'reload schema';

commit;
