-- ZahraaFit — Phase 4: phone reminders (meals, water, workout)
-- Run this whole file once in the Supabase SQL Editor (after phase3-content.sql).
-- Safe to run again. After running it, open the coach pages once so the
-- reminders learn the site address.

create extension if not exists pg_net;
create extension if not exists pg_cron;

begin;

-- Each phone/browser where a subscriber turned reminders on.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and length(endpoint) < 1000),
  p256dh text not null check (length(p256dh) < 200),
  auth text not null check (length(auth) < 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

-- What she wants to be reminded of (times are Riyadh time, "HH:MM").
create table if not exists public.reminder_prefs (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  meal_times text[] not null default '{}',
  water boolean not null default false,
  workout_time text,
  updated_at timestamptz not null default now(),
  constraint reminder_prefs_meals check (cardinality(meal_times) <= 8 and array_to_string(meal_times, ',') ~ '^((([01][0-9]|2[0-3]):[0-5][0-9])(,|$))*$'),
  constraint reminder_prefs_workout check (workout_time is null or workout_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

-- Server-only: keys, secret, site address, what was already sent, test requests.
create table if not exists public.push_config (
  id integer primary key default 1 check (id = 1),
  secret text not null default (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')),
  site_url text,
  public_key text,
  private_key text
);
insert into public.push_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.push_sent (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  slot text not null,
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (profile_id, slot, day)
);

create table if not exists public.push_queue (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  url text not null default '/app',
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
alter table public.reminder_prefs enable row level security;
alter table public.push_config enable row level security;
alter table public.push_sent enable row level security;
alter table public.push_queue enable row level security;
revoke all on public.push_config, public.push_sent, public.push_queue from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions, public.reminder_prefs to authenticated;

drop policy if exists "Own push subscriptions" on public.push_subscriptions;
create policy "Own push subscriptions" on public.push_subscriptions for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists "Own reminder prefs" on public.reminder_prefs;
create policy "Own reminder prefs" on public.reminder_prefs for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- The public half of the signing key, for the phone to subscribe.
create or replace function public.push_public_key()
returns text language sql stable security definer set search_path = public
as $$ select public_key from public.push_config where id = 1 $$;

-- The coach's pages tell the database the site address the reminders job calls.
create or replace function public.set_push_site(url text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then return; end if;
  if url !~ '^https://[a-z0-9.-]+$' then return; end if;
  update public.push_config set site_url = url where id = 1 and site_url is distinct from url;
  -- New address: ping once now so the signing keys get made right away.
  if found then perform public.push_ping(); end if;
end $$;

-- Calls the site's reminders endpoint with the shared secret.
create or replace function public.push_ping()
returns void language plpgsql security definer set search_path = public
as $$
declare c record;
begin
  select site_url, secret into c from public.push_config where id = 1;
  if c.site_url is null then return; end if;
  perform net.http_post(
    url := c.site_url || '/api/push/tick',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', c.secret),
    timeout_milliseconds := 20000
  );
end $$;

-- "Send me a test": queue one message for her and ping right away (once a minute at most).
create or replace function public.push_test()
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from public.push_queue where profile_id = auth.uid() and created_at > now() - interval '1 minute') then return false; end if;
  insert into public.push_queue (profile_id, title, body, url)
  values (auth.uid(), '🔔 التذكيرات شغالة', 'كذا بيوصلك تذكير الأكل والماء والتمرين 💪', '/app');
  perform public.push_ping();
  return true;
end $$;

-- Server-only helpers. Each one checks the secret.
create or replace function public.push_keys(p_secret text)
returns jsonb language sql stable security definer set search_path = public
as $$ select jsonb_build_object('public', public_key, 'private', private_key) from public.push_config where id = 1 and secret = p_secret $$;

create or replace function public.push_set_keys(p_secret text, p_public text, p_private text)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  update public.push_config set public_key = p_public, private_key = p_private
  where id = 1 and secret = p_secret and public_key is null;
  return found;
end $$;

create or replace function public.push_forget(p_secret text, p_endpoint text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.push_config where id = 1 and secret = p_secret) then return; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
end $$;

-- Everything due now (Riyadh time), each reminder once a day, plus queued tests.
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

revoke all on function public.push_ping(), public.push_keys(text), public.push_set_keys(text, text, text),
  public.push_forget(text, text), public.push_due(text), public.push_test(), public.push_public_key(), public.set_push_site(text) from public, anon, authenticated;
grant execute on function public.push_public_key(), public.set_push_site(text), public.push_test() to authenticated;
grant execute on function public.push_keys(text), public.push_set_keys(text, text, text), public.push_forget(text, text), public.push_due(text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- Every 10 minutes, ask the site to send what is due.
select cron.unschedule('zahraafit-reminders') where exists (select 1 from cron.job where jobname = 'zahraafit-reminders');
select cron.schedule('zahraafit-reminders', '*/10 * * * *', 'select public.push_ping()');
