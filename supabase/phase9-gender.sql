-- ZahraaFit — Phase 9: subscriber gender (screens and reminders address men and women correctly)
-- Run this whole file once in the Supabase SQL Editor (after phase8-food-tools.sql).
-- Safe to run again.

begin;

alter table public.profiles add column if not exists gender text;
do $$ begin
  alter table public.profiles add constraint profiles_gender check (gender is null or gender in ('female', 'male'));
exception when duplicate_object then null; end $$;

-- Existing subscribers: take it from their latest intake form.
update public.profiles p set gender = r.g
from (
  select distinct on (profile_id) profile_id, answers->>'gender' as g
  from public.plan_requests
  where answers->>'gender' in ('female', 'male')
  order by profile_id, submitted_at desc
) r
where r.profile_id = p.id and p.gender is distinct from r.g and p.role = 'client';

-- New forms keep it up to date.
create or replace function public.sync_gender_from_request()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.answers->>'gender' in ('female', 'male') then
    update public.profiles set gender = new.answers->>'gender' where id = new.profile_id and gender is distinct from new.answers->>'gender';
  end if;
  return new;
end $$;
revoke all on function public.sync_gender_from_request() from public, anon, authenticated;
drop trigger if exists plan_requests_sync_gender on public.plan_requests;
create trigger plan_requests_sync_gender after insert or update of answers on public.plan_requests
for each row execute function public.sync_gender_from_request();

-- She (or he) can change it in «حسابي».
create or replace function public.set_my_gender(p_gender text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or p_gender not in ('female', 'male') then return; end if;
  update public.profiles set gender = p_gender where id = auth.uid();
end $$;
revoke all on function public.set_my_gender(text) from public, anon;
grant execute on function public.set_my_gender(text) to authenticated;

-- Reminders in the right form.
create or replace function public.push_due(p_secret text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  t timestamp := now() at time zone 'Asia/Riyadh';
  today date := t::date;
  nowt time := t::time;
  result jsonb;
begin
  if not exists (select 1 from public.push_config where id = 1 and secret = p_secret) then return '[]'::jsonb; end if;

  with slots as (
    select p.profile_id, 'meal-' || m.i as slot, m.tm::time as at,
           '🍽️ وقت الوجبة ' || m.i as title,
           case when pr.gender = 'male' then 'وجبتك جاهزة؟ افتح «أكلي» وعلم عليها بعد ما تاكل'
                else 'وجبتك جاهزة؟ افتحي «أكلي» وعلمي عليها بعد ما تاكلين' end as body, '/app/food' as url
    from public.reminder_prefs p join public.profiles pr on pr.id = p.profile_id, unnest(p.meal_times) with ordinality as m(tm, i)
    union all
    select p.profile_id, 'water-' || h, make_time(h, 0, 0), '💧 كوب ماء',
           case when pr.gender = 'male' then 'اشرب كوب ماء الحين وعلمه في «أكلي»' else 'اشربي كوب ماء الحين وعلميه في «أكلي»' end, '/app/food'
    from public.reminder_prefs p join public.profiles pr on pr.id = p.profile_id, generate_series(10, 22, 2) as h
    where p.water
    union all
    select p.profile_id, 'workout', p.workout_time::time, '💪 وقت تمرينك',
           'تمرين اليوم ينتظرك، يلا نبدأ', '/app/workout'
    from public.reminder_prefs p
    where p.workout_time is not null
    union all
    -- Weekly check-in: on her check-in day, and again the next day if she hasn't sent it.
    select c.profile_id, 'checkin', time '17:00', '📅 وقت متابعتك الأسبوعية',
           case when pr.gender = 'male' then 'كيف كان أسبوعك؟ عب متابعتك عشان المدربة تشوفها 💪' else 'كيف كان أسبوعك؟ عبي متابعتك عشان المدربة تشوفها 💪' end, '/app/checkin'
    from public.clients c join public.profiles pr on pr.id = c.profile_id
    where c.followup_start is not null and today > c.followup_start and today <= c.followup_start + c.followup_weeks * 7 + 1
      and (today - c.followup_start) % 7 in (0, 1)
      and not exists (select 1 from public.weekly_followups w where w.client_id = c.id
                      and w.week_date = c.followup_start + ((today - c.followup_start) / 7) * 7)
  ),
  due as (
    insert into public.push_sent (profile_id, slot, day)
    select s.profile_id, s.slot, today from slots s
    where s.at <= nowt and nowt - s.at < interval '30 minutes'
    on conflict do nothing
    returning profile_id, slot
  ),
  msgs as (
    select s.profile_id, s.title, s.body, s.url from slots s join due d using (profile_id, slot)
    union all
    select q.profile_id, q.title, q.body, q.url from public.push_queue q
  )
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth,
                                               'title', m.title, 'body', m.body, 'url', m.url)), '[]'::jsonb)
  into result
  from msgs m join public.push_subscriptions ps on ps.profile_id = m.profile_id;

  delete from public.push_queue where created_at <= now();
  delete from public.push_sent where day < today - 2;
  return result;
end $$;

revoke all on function public.push_due(text) from public, anon, authenticated;
grant execute on function public.push_due(text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
