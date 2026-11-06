-- ZahraaFit — Phase 18: weekly recommendations (AI) on the Friday summary, and extra measurements
-- Run this whole file once in the Supabase SQL Editor (after phase17-home.sql).
-- Safe to run again.

begin;

-- Optional measurements in «تقدمي».
alter table public.body_logs add column if not exists chest_cm numeric(5,1);
alter table public.body_logs add column if not exists arm_cm numeric(5,1);
alter table public.body_logs add column if not exists thigh_cm numeric(5,1);
do $$ begin
  alter table public.body_logs add constraint body_logs_extra_cm check (
    (chest_cm is null or chest_cm between 40 and 250) and (arm_cm is null or arm_cm between 10 and 100) and (thigh_cm is null or thigh_cm between 20 and 150));
exception when duplicate_object then null; end $$;

-- She can ask for recommendations without numbers.
alter table public.profiles add column if not exists hide_numbers boolean not null default false;

create or replace function public.set_hide_numbers(p_hide boolean)
returns void language sql security definer set search_path = public
as $$ update public.profiles set hide_numbers = coalesce(p_hide, false) where id = auth.uid() $$;
revoke all on function public.set_hide_numbers(boolean) from public, anon;
grant execute on function public.set_hide_numbers(boolean) to authenticated;

-- Coach settings (key → value).
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values ('weekly_recs_review', 'false'::jsonb) on conflict (key) do nothing;
grant select, insert, update on public.app_settings to authenticated;
alter table public.app_settings enable row level security;
drop policy if exists "Everyone reads settings" on public.app_settings;
create policy "Everyone reads settings" on public.app_settings for select to authenticated using (true);
drop policy if exists "Coach writes settings" on public.app_settings;
create policy "Coach writes settings" on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- One set of recommendations per person per week (the week ending on that Friday).
create table if not exists public.weekly_recs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  week_end date not null,
  recs jsonb not null check (jsonb_typeof(recs) = 'array' and jsonb_array_length(recs) between 1 and 3),
  status text not null default 'published' check (status in ('published', 'pending', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (profile_id, week_end)
);
grant select, update, delete on public.weekly_recs to authenticated;
alter table public.weekly_recs enable row level security;
drop policy if exists "Own or coach reads recs" on public.weekly_recs;
create policy "Own or coach reads recs" on public.weekly_recs for select to authenticated using (profile_id = auth.uid() or public.is_admin());
drop policy if exists "Coach reviews recs" on public.weekly_recs;
create policy "Coach reviews recs" on public.weekly_recs for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Coach removes recs" on public.weekly_recs;
create policy "Coach removes recs" on public.weekly_recs for delete to authenticated using (public.is_admin());

-- Saves this week's recommendations (once). Subscribers' go to the coach first if she reviews them.
create or replace function public.save_weekly_recs(p_week date, p_recs jsonb)
returns text language plpgsql security definer set search_path = public
as $$
declare
  st text;
  review boolean := coalesce((select (value)::text::boolean from public.app_settings where key = 'weekly_recs_review'), false);
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if jsonb_typeof(p_recs) <> 'array' or jsonb_array_length(p_recs) not between 1 and 3
     or exists (select 1 from jsonb_array_elements(p_recs) e where jsonb_typeof(e) <> 'string' or length(e #>> '{}') > 400) then
    raise exception 'recs';
  end if;
  if p_week > public.riyadh_today() or p_week < public.riyadh_today() - 7 then raise exception 'week'; end if;
  st := case when review and public.is_subscriber() and not public.is_admin() then 'pending' else 'published' end;
  insert into public.weekly_recs (profile_id, week_end, recs, status) values (auth.uid(), p_week, p_recs, st)
  on conflict (profile_id, week_end) do nothing;
  return (select status from public.weekly_recs where profile_id = auth.uid() and week_end = p_week);
end $$;
revoke all on function public.save_weekly_recs(date, jsonb) from public, anon;
grant execute on function public.save_weekly_recs(date, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
