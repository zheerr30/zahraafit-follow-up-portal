-- ZahraaFit — Phase 19: basics before launch
-- Problem reports, account deletion, usage stats (no personal data), coach user list.
-- Run this whole file once in the Supabase SQL Editor (after phase18-weekly-recs.sql).
-- Safe to run again.

begin;
set local search_path = public, extensions;

-- ── Last time each person opened the app (for the coach's list) ──
alter table public.profiles add column if not exists last_seen_at timestamptz;

-- ── Usage stats: which pages and buttons are used. No names, no ids: each person
--    shows up as a code that changes every day, so days can't be linked together. ──
create table if not exists public.events (
  id bigserial primary key,
  day date not null default public.riyadh_today(),
  kind text not null check (kind in ('view', 'tap')),
  name text not null check (length(name) between 1 and 60 and name ~ '^[a-z0-9/_:\-\[\]]+$'),
  actor text not null,
  created_at timestamptz not null default now()
);
create index if not exists events_day_idx on public.events (day, kind, name);
grant select on public.events to authenticated;
alter table public.events enable row level security;
drop policy if exists "Coach reads events" on public.events;
create policy "Coach reads events" on public.events for select to authenticated using (public.is_admin());

create table if not exists public.app_secrets (key text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
insert into public.app_secrets (key, value) values ('events_salt', encode(gen_random_bytes(24), 'hex')) on conflict (key) do nothing;

create or replace function public.log_event(p_kind text, p_name text)
returns void language plpgsql security definer set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  d date := public.riyadh_today();
begin
  if uid is null or public.is_admin() then return; end if;
  if p_kind not in ('view', 'tap') or p_name is null or length(p_name) > 60 or p_name !~ '^[a-z0-9/_:\-\[\]]+$' then return; end if;
  insert into public.events (day, kind, name, actor)
  values (d, p_kind, p_name, encode(digest(uid::text || d::text || (select value from public.app_secrets where key = 'events_salt'), 'sha256'), 'hex'));
  update public.profiles set last_seen_at = now() where id = uid and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
end $$;
revoke all on function public.log_event(text, text) from public, anon;
grant execute on function public.log_event(text, text) to authenticated;

-- Coach: most used pages/buttons and daily active people, for the last p_days days.
create or replace function public.coach_stats(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare since date := public.riyadh_today() - greatest(1, least(p_days, 180)) + 1;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'people', n) order by day) from (
      select day, count(distinct actor) n from public.events where day >= since group by day) x), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'n', n, 'people', p) order by n desc) from (
      select name, count(*) n, count(distinct actor) p from public.events where day >= since and kind = 'view' group by name order by n desc limit 20) x), '[]'::jsonb),
    'taps', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'n', n, 'people', p) order by n desc) from (
      select name, count(*) n, count(distinct actor) p from public.events where day >= since and kind = 'tap' group by name order by n desc limit 20) x), '[]'::jsonb)
  );
end $$;
revoke all on function public.coach_stats(integer) from public, anon;
grant execute on function public.coach_stats(integer) to authenticated;

-- ── Coach: everyone at a glance ──
create or replace function public.coach_users()
returns table (profile_id uuid, client_id uuid, full_name text, phone text, gender text, account_type text, subscription_end date,
  created_at timestamptz, last_seen_at timestamptz, days_this_week integer, last_checkin timestamptz)
language plpgsql stable security definer set search_path = public
as $$
declare since date := public.riyadh_today() - 6;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query
  select p.id, c.id, p.full_name, p.phone, p.gender, p.account_type, p.subscription_end, p.created_at, p.last_seen_at,
    (select count(*)::integer from (
       select d.log_date from public.daily_logs d where d.client_id = c.id and d.log_date >= since
         and exists (select 1 from jsonb_each(d.meals) e where e.key !~ '^_' and e.value = 'true'::jsonb)
       union
       select f.log_date from public.food_entries f where f.client_id = c.id and f.log_date >= since) x),
    (select max(w.created_at) from public.weekly_followups w where w.client_id = c.id)
  from public.profiles p
  left join public.clients c on c.profile_id = p.id
  where p.role = 'client'
  order by p.last_seen_at desc nulls last;
end $$;
revoke all on function public.coach_users() from public, anon;
grant execute on function public.coach_users() to authenticated;

-- ── Problem reports (text + optional photo + device info) ──
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  body text not null check (length(trim(body)) between 3 and 3000),
  photo_path text check (photo_path is null or length(photo_path) < 300),
  device jsonb not null default '{}'::jsonb check (pg_column_size(device) < 4000),
  page text check (page is null or length(page) < 200),
  app_version text check (app_version is null or length(app_version) < 60),
  status text not null default 'new' check (status in ('new', 'done')),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.reports to authenticated;
alter table public.reports enable row level security;
drop policy if exists "Own reports" on public.reports;
create policy "Own reports" on public.reports for insert to authenticated with check (profile_id = auth.uid());
drop policy if exists "Own or coach reads reports" on public.reports;
create policy "Own or coach reads reports" on public.reports for select to authenticated using (profile_id = auth.uid() or public.is_admin());
drop policy if exists "Coach handles reports" on public.reports;
create policy "Coach handles reports" on public.reports for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Coach removes reports" on public.reports;
create policy "Coach removes reports" on public.reports for delete to authenticated using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owner uploads report photos" on storage.objects;
create policy "Owner uploads report photos" on storage.objects for insert to authenticated
with check (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Owner and coach read report photos" on storage.objects;
create policy "Owner and coach read report photos" on storage.objects for select to authenticated
using (bucket_id = 'reports' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
drop policy if exists "Coach manages report photos" on storage.objects;
create policy "Coach manages report photos" on storage.objects for all to authenticated
using (bucket_id = 'reports' and public.is_admin()) with check (bucket_id = 'reports' and public.is_admin());

-- ── Delete my account: she removes her own files, then everything else goes ──
drop policy if exists "Owner deletes own files" on storage.objects;
create policy "Owner deletes own files" on storage.objects for delete to authenticated
using (
  (bucket_id in ('inbody', 'reports') and (storage.foldername(name))[1] = auth.uid()::text)
  or (bucket_id in ('followup-photos', 'client-plans') and exists (
    select 1 from public.clients c where c.id::text = (storage.foldername(name))[1] and c.profile_id = auth.uid()))
);

-- Her files, so the app can remove them with the storage API (direct deletes aren't allowed).
create or replace function public.my_files()
returns table (bucket text, path text) language sql stable security definer set search_path = public, storage
as $$
  select o.bucket_id, o.name from storage.objects o
  where (o.bucket_id in ('inbody', 'reports') and (storage.foldername(o.name))[1] = auth.uid()::text)
     or (o.bucket_id in ('followup-photos', 'client-plans') and (storage.foldername(o.name))[1] in (
           select c.id::text from public.clients c where c.profile_id = auth.uid()))
$$;
revoke all on function public.my_files() from public, anon;
grant execute on function public.my_files() to authenticated;

create or replace function public.delete_my_account(p_confirm text)
returns void language plpgsql security definer set search_path = public, storage
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if public.is_admin() then raise exception 'coach account'; end if;
  if p_confirm is distinct from 'حذف' then raise exception 'confirm'; end if;
  if exists (select 1 from public.my_files()) then raise exception 'files left'; end if;
  delete from public.pending_subscriptions where applied_profile = uid;
  -- Everything else hangs off the login and goes with it (profiles, clients, logs, plans...).
  delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;

-- ── «حسابي»: her details (weight is saved on its own in body_logs) ──
create or replace function public.save_my_details(p_gender text, p_age integer, p_height numeric, p_activity numeric, p_goal text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_gender not in ('female', 'male') then raise exception 'gender'; end if;
  if p_age not between 12 and 90 then raise exception 'age'; end if;
  if p_height not between 120 and 230 then raise exception 'height'; end if;
  if p_activity not between 1.1 and 2 then raise exception 'activity'; end if;
  if p_goal not in ('تخسيس', 'تضخيم', 'صيانة', 'ريكومب') then raise exception 'goal'; end if;
  update public.profiles set gender = p_gender, updated_at = now() where id = auth.uid();
  insert into public.clients (profile_id, status) values (auth.uid(), 'active') on conflict (profile_id) do nothing;
  update public.clients set age = p_age, height_cm = p_height, goal = p_goal, activity = p_activity
  where profile_id = auth.uid() returning id into cid;
  return cid;
end $$;
revoke all on function public.save_my_details(text, integer, numeric, numeric, text) from public, anon;
grant execute on function public.save_my_details(text, integer, numeric, numeric, text) to authenticated;

notify pgrst, 'reload schema';

commit;
