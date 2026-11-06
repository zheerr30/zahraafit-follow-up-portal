-- ZahraaFit — Phase 16: Ramadan mode
-- Run this whole file once in the Supabase SQL Editor (after phase15-period.sql).
-- Safe to run again.

begin;

-- On while this date hasn't passed (set to the third day of Eid when she turns it on).
alter table public.reminder_prefs add column if not exists ramadan_until date;

-- Reminders: water only between Maghrib and Fajr, no meal reminders while fasting.
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
    -- In Ramadan, no meal reminders during fasting hours.
    where not (p.ramadan_until >= today and m.tm::time between time '04:30' and time '17:29')
    union all
    select p.profile_id, 'water-' || h, make_time(h, 0, 0), '💧 كوب ماء',
           case when pr.gender = 'male' then 'اشرب كوب ماء الحين وعلمه في «أكلي»' else 'اشربي كوب ماء الحين وعلميه في «أكلي»' end, '/app/food'
    from public.reminder_prefs p join public.profiles pr on pr.id = p.profile_id,
         unnest(case when p.ramadan_until >= today then array[19, 21, 23, 1, 3] else array[10, 12, 14, 16, 18, 20, 22] end) as h
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
    union all
    -- Subscribers without a coach follow-up: weekly check-in every Saturday at 10am.
    select c.profile_id, 'checkin-sat', time '10:00', '📅 تسجيلك الأسبوعي',
           case when pr.gender = 'male' then 'اليوم السبت! سجل وزنك وقياساتك وشوف تطورك 💪' else 'اليوم السبت! سجلي وزنك وقياساتك وشوفي تطورك 💪' end, '/app/checkin'
    from public.clients c join public.profiles pr on pr.id = c.profile_id
    where c.followup_start is null and extract(dow from today) = 6
      and pr.account_type = 'subscriber' and (pr.subscription_end is null or pr.subscription_end >= today)
      and not exists (select 1 from public.weekly_followups w where w.client_id = c.id and w.week_date = today)
      and not exists (select 1 from public.reminder_prefs rp where rp.profile_id = c.profile_id and rp.saturday = false)
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
