-- ZahraaFit — Phase 7: weekly follow-up (check-ins with photos, coach replies, subscription length)
-- Run this whole file once in the Supabase SQL Editor (after phase6-profile.sql).
-- Safe to run again.

begin;

-- Follow-up subscription: starts on a day, lasts N weeks. Check-in is due every 7 days from the start.
alter table public.clients add column if not exists followup_start date;
alter table public.clients add column if not exists followup_weeks integer;
do $$ begin
  alter table public.clients add constraint clients_followup_weeks check (followup_weeks is null or followup_weeks between 1 and 104);
exception when duplicate_object then null; end $$;

-- New questions on the weekly check-in.
alter table public.weekly_followups add column if not exists feeling integer;
alter table public.weekly_followups add column if not exists changes_requested text;
alter table public.weekly_followups add column if not exists coach_replied_at timestamptz;
do $$ begin
  alter table public.weekly_followups add constraint weekly_followups_feeling check (feeling is null or feeling between 1 and 5);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.weekly_followups add constraint weekly_followups_text_len check (
    length(coalesce(client_notes, '')) <= 3000 and length(coalesce(changes_requested, '')) <= 3000 and length(coalesce(coach_notes, '')) <= 5000);
exception when duplicate_object then null; end $$;

-- She can fix her check-in until the coach replies (not the reply itself).
grant select, insert, update, delete on public.weekly_followups to authenticated;
grant select, insert, delete on public.followup_photos to authenticated;

drop policy if exists "Clients can update unanswered followups" on public.weekly_followups;
create policy "Clients can update unanswered followups"
on public.weekly_followups for update to authenticated
using (coach_notes is null and public.owns_client(client_id))
with check (coach_notes is null and coach_replied_at is null and public.owns_client(client_id));

drop policy if exists "Clients can delete own unanswered photos" on public.followup_photos;
create policy "Clients can delete own unanswered photos"
on public.followup_photos for delete to authenticated
using (public.owns_client(client_id) and exists (
  select 1 from public.weekly_followups w where w.id = followup_photos.followup_id and w.coach_notes is null));

drop policy if exists "Clients can replace own followup photos" on storage.objects;
create policy "Clients can replace own followup photos"
on storage.objects for update to authenticated
using (bucket_id = 'followup-photos' and exists (
  select 1 from public.clients c where c.id::text = (storage.foldername(name))[1] and c.profile_id = auth.uid()))
with check (bucket_id = 'followup-photos' and exists (
  select 1 from public.clients c where c.id::text = (storage.foldername(name))[1] and c.profile_id = auth.uid()));

-- When the coach replies, tell the subscriber on her phone.
create or replace function public.notify_followup_reply()
returns trigger language plpgsql security definer set search_path = public
as $$
declare pid uuid;
begin
  if new.coach_notes is not null and new.coach_notes is distinct from old.coach_notes then
    select profile_id into pid from public.clients where id = new.client_id;
    if pid is not null then
      insert into public.push_queue (profile_id, title, body, url)
      values (pid, '💬 المدربة ردت على متابعتك', left(new.coach_notes, 120), '/app/checkin');
      perform public.push_ping();
    end if;
  end if;
  return new;
end $$;
revoke all on function public.notify_followup_reply() from public, anon, authenticated;

drop trigger if exists weekly_followups_notify_reply on public.weekly_followups;
create trigger weekly_followups_notify_reply after update on public.weekly_followups
for each row execute function public.notify_followup_reply();

-- Reminders now include the weekly check-in.
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
           'وجبتك جاهزة؟ افتحي «أكلي» وعلّمي عليها بعد ما تاكلين' as body, '/app/food' as url
    from public.reminder_prefs p, unnest(p.meal_times) with ordinality as m(tm, i)
    union all
    select p.profile_id, 'water-' || h, make_time(h, 0, 0), '💧 كوب ماء',
           'اشربي كوب ماء الحين وعلّميه في «أكلي»', '/app/food'
    from public.reminder_prefs p, generate_series(10, 22, 2) as h
    where p.water
    union all
    select p.profile_id, 'workout', p.workout_time::time, '💪 وقت تمرينك',
           'تمرين اليوم ينتظرك، يلا نبدأ', '/app/workout'
    from public.reminder_prefs p
    where p.workout_time is not null
    union all
    -- Weekly check-in: on her check-in day, and again the next day if she hasn't sent it.
    select c.profile_id, 'checkin', time '17:00', '📅 وقت متابعتك الأسبوعية',
           'كيف كان أسبوعك؟ عبّي متابعتك عشان المدربة تشوفها 💪', '/app/checkin'
    from public.clients c
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
