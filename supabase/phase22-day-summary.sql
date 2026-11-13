-- ZahraaFit — Phase 22: end-of-day summary (notification + «ملخص يومك» card)
-- Run this whole file once in the Supabase SQL Editor (after phase21-off-days-details.sql).
-- Safe to run again.

begin;

-- Her choice in «حسابي» ← الإشعارات: on by default, at 9 pm.
alter table public.reminder_prefs add column if not exists day_summary boolean not null default true;
alter table public.reminder_prefs add column if not exists day_summary_time text not null default '21:00';
alter table public.reminder_prefs drop constraint if exists reminder_prefs_day_summary_time;
alter table public.reminder_prefs add constraint reminder_prefs_day_summary_time
  check (day_summary_time ~ '^(1[6-9]|2[0-3]):[0-5][0-9]$');

-- Today's numbers as the app shows them (plan meals ticked + food logged), saved by the phone.
-- The summary also checks food_entries and daily_logs, in case food was logged after the last save.
create table if not exists public.day_stats (
  client_id uuid not null references public.clients(id) on delete cascade,
  day date not null,
  cal numeric(7, 1) not null default 0 check (cal between 0 and 20000),
  p numeric(6, 1) not null default 0 check (p between 0 and 2000),
  c numeric(6, 1) not null default 0 check (c between 0 and 2000),
  f numeric(6, 1) not null default 0 check (f between 0 and 2000),
  target_cal integer check (target_cal is null or target_cal between 0 and 10000),
  target_p integer check (target_p is null or target_p between 0 and 1000),
  water integer not null default 0 check (water between 0 and 40),
  water_goal integer check (water_goal is null or water_goal between 0 and 40),
  meals_done integer not null default 0 check (meals_done between 0 and 20),
  meals_total integer not null default 0 check (meals_total between 0 and 20),
  updated_at timestamptz not null default now(),
  primary key (client_id, day)
);
grant select, insert, update on public.day_stats to authenticated;
alter table public.day_stats enable row level security;
drop policy if exists "Owner or admin reads" on public.day_stats;
create policy "Owner or admin reads" on public.day_stats for select to authenticated using (public.is_admin() or public.owns_client(client_id));
drop policy if exists "Owner writes" on public.day_stats;
create policy "Owner writes" on public.day_stats for insert to authenticated with check (public.owns_client(client_id));
drop policy if exists "Owner updates" on public.day_stats;
create policy "Owner updates" on public.day_stats for update to authenticated using (public.owns_client(client_id)) with check (public.owns_client(client_id));

-- One summary per person per day (written by the server only).
create table if not exists public.day_summaries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('summary', 'excellent', 'nolog')),
  push text not null check (length(push) between 1 and 120),
  card jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (profile_id, day)
);
grant select on public.day_summaries to authenticated;
alter table public.day_summaries enable row level security;
drop policy if exists "Owner or admin reads" on public.day_summaries;
create policy "Owner or admin reads" on public.day_summaries for select to authenticated using (public.is_admin() or profile_id = auth.uid());

-- The coach's ready sentences for free accounts (she edits them in «المتابعات»).
-- {p} {p_goal} {cal} {cal_goal} {water} {water_goal} {meals_left} are filled in by the app.
insert into public.app_settings (key, value) values ('day_summary_templates', '{
  "protein":   {"push": "بروتينك اليوم {p} من {p_goal} جرام. بكرا زيدي مصدر بروتين في الفطور", "plain": "بروتينك اليوم أقل من هدفك. بكرا زيدي مصدر بروتين في الفطور", "rec": "بكرا ابدئي فطورك ببروتين واضح مثل البيض أو الزبادي اليوناني، وكملي الباقي على الغداء."},
  "cal_low":   {"push": "أكلتي اليوم {cal} من {cal_goal} سعرة. بكرا لا تطولين بين الوجبات", "plain": "أكلك اليوم أقل من هدفك بوضوح. بكرا لا تطولين بين الوجبات", "rec": "بكرا جهزي سناك من الحين وخذيه معك، عشان ما يمر وقت طويل بدون أكل."},
  "cal_high":  {"push": "أكلتي اليوم {cal} من {cal_goal} سعرة. عادي، بكرا ارجعي لخطتك", "plain": "زدتي اليوم عن هدفك. عادي، بكرا ارجعي لخطتك", "rec": "بكرا سجلي أكلك أول بأول، واختاري سناك خفيف لو جعتي بالليل."},
  "water":     {"push": "شربتي {water} من {water_goal} أكواب ماء. بكرا خلي القارورة قدامك", "plain": "شربك للماء اليوم قليل. بكرا خلي القارورة قدامك", "rec": "بكرا اشربي كوب ماء مع كل وجبة، وخلي القارورة قدامك طول اليوم."},
  "meals":     {"push": "فاتك اليوم {meals_left} وجبة من خطتك. بكرا جهزيها من الصبح", "plain": "فاتتك وجبات من خطتك اليوم. بكرا جهزيها من الصبح", "rec": "بكرا جهزي وجباتك من الصبح، وعلمي عليها أول بأول."},
  "excellent": {"push": "يومك اليوم ممتاز: بروتين وسعرات وماء على الهدف. كذا نبيه", "plain": "يومك اليوم ممتاز: بروتين وسعرات وماء على الهدف. كذا نبيه", "rec": ""},
  "nolog":     {"push": "ما سجلتي أكلك اليوم، باقي وقت", "plain": "ما سجلتي أكلك اليوم، باقي وقت", "rec": ""}
}'::jsonb) on conflict (key) do nothing;

-- Who gets a summary now: their time has come (within 45 minutes), none made today,
-- not an off day, and not a second "you didn't log" in a row. Server only (shared secret).
create or replace function public.day_summary_due(p_secret text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  t timestamp := now() at time zone 'Asia/Riyadh';
  today date := t::date;
  nowt time := t::time;
  result jsonb;
begin
  if not exists (select 1 from public.push_config where id = 1 and secret = p_secret) then return '[]'::jsonb; end if;

  with people as (
    select pr.id as profile_id, c.id as client_id, pr.gender, coalesce(pr.hide_numbers, false) as hide,
           (pr.account_type = 'subscriber' and (pr.subscription_end is null or pr.subscription_end >= today)) as sub,
           s as stats,
           fe.n as entries, fe.cal as fe_cal, fe.p as fe_p, fe.c as fe_c, fe.f as fe_f,
           ft.cal as ft_cal, ft.p as ft_p, coalesce(dl.water, 0) as dl_water
    from public.profiles pr
    join public.clients c on c.profile_id = pr.id
    left join public.reminder_prefs rp on rp.profile_id = pr.id
    left join public.day_stats s on s.client_id = c.id and s.day = today
    left join public.food_targets ft on ft.client_id = c.id
    left join public.daily_logs dl on dl.client_id = c.id and dl.log_date = today
    left join lateral (select count(*) as n, coalesce(sum(e.cal), 0) as cal, coalesce(sum(e.p), 0) as p,
                              coalesce(sum(e.c), 0) as c, coalesce(sum(e.f), 0) as f
                       from public.food_entries e where e.client_id = c.id and e.log_date = today) fe on true
    where pr.role = 'client'
      and coalesce(rp.day_summary, true)
      and coalesce(rp.day_summary_time, '21:00')::time <= nowt
      and nowt - coalesce(rp.day_summary_time, '21:00')::time < interval '45 minutes'
      and (pr.last_seen_at >= now() - interval '3 days' or exists (select 1 from public.push_subscriptions ps where ps.profile_id = pr.id))
      and not exists (select 1 from public.day_summaries d where d.profile_id = pr.id and d.day = today)
      and not exists (select 1 from public.off_days o where o.client_id = c.id and o.day = today)
  ),
  rows as (
    select p.*,
           (coalesce((p.stats).cal, 0) > 0 or coalesce((p.stats).meals_done, 0) > 0 or p.entries > 0) as logged,
           exists (select 1 from public.day_summaries d where d.profile_id = p.profile_id and d.day = today - 1 and d.kind = 'nolog') as nolog_yesterday,
           (p.gender is distinct from 'male' and exists (
              select 1 from public.period_logs pl where pl.client_id = p.client_id and pl.start_date <= today
                and ((pl.end_date is null and today - pl.start_date <= 10) or pl.end_date >= today))) as period,
           (select concat_ws(E'\n---\n', w.coach_notes, (select pl.data->>'coachNote' from public.plans pl
                     where pl.client_id = p.client_id and pl.kind = 'nutrition' and pl.is_current limit 1))
            from (select 1) x left join lateral (select wf.coach_notes from public.weekly_followups wf
                  where wf.client_id = p.client_id and wf.coach_notes is not null order by wf.week_date desc limit 1) w on true) as coach_note
    from people p
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'profile_id', r.profile_id, 'male', r.gender = 'male', 'hide', r.hide, 'sub', r.sub,
           'period', r.period, 'logged', r.logged, 'coach_note', nullif(r.coach_note, ''),
           'cal', greatest(coalesce((r.stats).cal, 0), r.fe_cal), 'p', greatest(coalesce((r.stats).p, 0), r.fe_p),
           'c', greatest(coalesce((r.stats).c, 0), r.fe_c), 'f', greatest(coalesce((r.stats).f, 0), r.fe_f),
           'target_cal', coalesce((r.stats).target_cal, r.ft_cal), 'target_p', coalesce((r.stats).target_p, r.ft_p),
           'water', greatest(coalesce((r.stats).water, 0), r.dl_water), 'water_goal', (r.stats).water_goal,
           'meals_done', coalesce((r.stats).meals_done, 0), 'meals_total', coalesce((r.stats).meals_total, 0))), '[]'::jsonb)
  into result
  from rows r
  where r.logged or not r.nolog_yesterday;

  return result;
end $$;

-- Keep the summary and queue its notification (if this person has the app's notifications on).
create or replace function public.day_summary_save(p_secret text, p_profile uuid, p_kind text, p_push text, p_card jsonb)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Riyadh')::date;
  added uuid;
begin
  if not exists (select 1 from public.push_config where id = 1 and secret = p_secret) then return false; end if;
  insert into public.day_summaries (profile_id, day, kind, push, card)
  values (p_profile, today, p_kind, left(p_push, 120), coalesce(p_card, '{}'::jsonb))
  on conflict (profile_id, day) do nothing
  returning id into added;
  if added is null then return false; end if;
  if exists (select 1 from public.push_subscriptions ps where ps.profile_id = p_profile) then
    insert into public.push_queue (profile_id, title, body, url)
    values (p_profile, 'ملخص يومك', left(p_push, 120), '/app?summary=1');
  end if;
  return true;
end $$;

revoke all on function public.day_summary_due(text) from public, anon, authenticated;
grant execute on function public.day_summary_due(text) to anon, authenticated;
revoke all on function public.day_summary_save(text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.day_summary_save(text, uuid, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
