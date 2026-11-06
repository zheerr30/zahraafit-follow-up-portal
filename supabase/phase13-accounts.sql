-- ZahraaFit — Phase 13: free and subscriber accounts, and automatic activation from Salla orders
-- Run this whole file once in the Supabase SQL Editor (after phase12-photo-count.sql).
-- Safe to run again.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;

begin;

-- ── Accounts ────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists account_type text not null default 'free';
alter table public.profiles add column if not exists subscription_end date;
alter table public.profiles add column if not exists photo_credits integer not null default 10;
do $$ begin
  alter table public.profiles add constraint profiles_account_type check (account_type in ('free', 'subscriber'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_photo_credits check (photo_credits >= 0);
exception when duplicate_object then null; end $$;

alter table public.clients add column if not exists activity numeric(4, 3);

create or replace function public.riyadh_today()
returns date language sql stable as $$ select (now() at time zone 'Asia/Riyadh')::date $$;

-- Subscriber now: marked subscriber and the end date hasn't passed. The coach counts as one.
create or replace function public.is_subscriber(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((
    select p.role = 'admin' or (p.account_type = 'subscriber' and (p.subscription_end is null or p.subscription_end >= public.riyadh_today()))
    from public.profiles p where p.id = uid
  ), false)
$$;
grant execute on function public.is_subscriber(uuid) to authenticated;

-- Once a day: ended subscriptions go back to free. Data and history stay.
create or replace function public.expire_subscriptions()
returns integer language sql security definer set search_path = public
as $$
  with x as (
    update public.profiles set account_type = 'free'
    where account_type = 'subscriber' and subscription_end is not null and subscription_end < public.riyadh_today()
    returning 1
  ) select count(*)::integer from x
$$;
revoke all on function public.expire_subscriptions() from public, anon, authenticated;

-- One-time: everyone who already bought a plan keeps access (30 days, or to the end of their follow-up).
create table if not exists public.app_flags (key text primary key, done_at timestamptz not null default now());
alter table public.app_flags enable row level security;
revoke all on public.app_flags from anon, authenticated;

do $$
begin
  if not exists (select 1 from public.app_flags where key = 'accounts_backfill_v1') then
    update public.profiles p
    set account_type = 'subscriber',
        subscription_end = greatest(
          public.riyadh_today() + 30,
          coalesce((select c.followup_start + c.followup_weeks * 7 from public.clients c where c.profile_id = p.id and c.followup_start is not null), public.riyadh_today())
        )
    where p.role = 'client'
      and exists (select 1 from public.plan_requests r where r.profile_id = p.id and r.status <> 'cancelled');
    insert into public.app_flags (key) values ('accounts_backfill_v1');
  end if;
end $$;

-- Adds days to a subscription: from its current end if still running, else from today.
create or replace function public.grant_subscription(p_profile uuid, p_days integer)
returns date language plpgsql security definer set search_path = public
as $$
declare new_end date;
begin
  update public.profiles
  set account_type = 'subscriber',
      subscription_end = greatest(
        case when account_type = 'subscriber' and subscription_end is not null and subscription_end >= public.riyadh_today() then subscription_end else public.riyadh_today() end,
        public.riyadh_today()
      ) + p_days
  where id = p_profile
  returning subscription_end into new_end;
  return new_end;
end $$;
revoke all on function public.grant_subscription(uuid, integer) from public, anon, authenticated;

-- Coach: activate or extend by days, or set the end date, or end it now (p_days = 0 and no date).
create or replace function public.coach_set_subscription(p_profile uuid, p_days integer, p_end date)
returns date language plpgsql security definer set search_path = public
as $$
declare r date;
begin
  if not public.is_admin() then raise exception 'coach only'; end if;
  if p_end is not null then
    update public.profiles set account_type = case when p_end >= public.riyadh_today() then 'subscriber' else 'free' end, subscription_end = p_end
    where id = p_profile returning subscription_end into r;
  elsif coalesce(p_days, 0) > 0 then
    r := public.grant_subscription(p_profile, p_days);
  else
    update public.profiles set account_type = 'free', subscription_end = public.riyadh_today() - 1 where id = p_profile returning subscription_end into r;
  end if;
  return r;
end $$;
revoke all on function public.coach_set_subscription(uuid, integer, date) from public, anon;
grant execute on function public.coach_set_subscription(uuid, integer, date) to authenticated;

-- ── Signup details (everyone) ───────────────────────────────────────────────
create or replace function public.save_onboarding(p_name text, p_gender text, p_age integer, p_height numeric, p_weight numeric, p_activity numeric, p_goal text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_activity not between 1.1 and 2 then raise exception 'activity'; end if;
  if p_gender not in ('female', 'male') then raise exception 'gender'; end if;
  if p_age not between 12 and 90 then raise exception 'age'; end if;
  if p_height not between 120 and 230 then raise exception 'height'; end if;
  if p_weight not between 30 and 300 then raise exception 'weight'; end if;
  if p_goal not in ('تخسيس', 'تضخيم', 'صيانة', 'ريكومب') then raise exception 'goal'; end if;

  update public.profiles
  set full_name = coalesce(nullif(trim(p_name), ''), full_name), gender = p_gender, updated_at = now()
  where id = auth.uid();

  insert into public.clients (profile_id, status) values (auth.uid(), 'active') on conflict (profile_id) do nothing;
  update public.clients
  set age = p_age, height_cm = p_height, goal = p_goal, activity = p_activity, start_weight = coalesce(start_weight, p_weight)
  where profile_id = auth.uid()
  returning id into cid;

  insert into public.body_logs (client_id, log_date, weight_kg)
  values (cid, public.riyadh_today(), p_weight)
  on conflict (client_id, log_date) do update set weight_kg = excluded.weight_kg;
  return cid;
end $$;
revoke all on function public.save_onboarding(text, text, integer, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.save_onboarding(text, text, integer, numeric, numeric, numeric, text) to authenticated;

-- ── Photo reads: free accounts use credits, subscribers have a daily safety cap ─
create or replace function public.ai_take(p_kind text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  sub boolean := public.is_subscriber();
  lim integer := case p_kind when 'meal' then 60 when 'label' then 15 when 'menu' then 10 else 0 end;
  today date := public.riyadh_today();
  n integer;
begin
  if auth.uid() is null or lim = 0 then return false; end if;
  if p_kind = 'meal' and not sub then
    update public.profiles set photo_credits = photo_credits - 1 where id = auth.uid() and photo_credits > 0 returning photo_credits into n;
    return n is not null;
  end if;
  if public.is_admin() then lim := 200; end if;
  insert into public.ai_usage (profile_id, day, kind, count) values (auth.uid(), today, p_kind, 1)
  on conflict (profile_id, day, kind) do update set count = public.ai_usage.count + 1
  where public.ai_usage.count < lim
  returning count into n;
  return n is not null;
end $$;
revoke all on function public.ai_take(text) from public, anon;
grant execute on function public.ai_take(text) to authenticated;

-- Photos left: credits for free accounts, -1 (no limit shown) for subscribers' plate photos.
create or replace function public.ai_left(p_kind text)
returns integer language plpgsql stable security definer set search_path = public
as $$
declare
  lim integer := case p_kind when 'meal' then 60 when 'label' then 15 when 'menu' then 10 else 0 end;
  used integer;
begin
  if auth.uid() is null then return 0; end if;
  if p_kind = 'meal' then
    if public.is_subscriber() then return -1; end if;
    return (select photo_credits from public.profiles where id = auth.uid());
  end if;
  if public.is_admin() then lim := 200; end if;
  select count into used from public.ai_usage where profile_id = auth.uid() and day = public.riyadh_today() and kind = p_kind;
  return greatest(0, lim - coalesce(used, 0));
end $$;
revoke all on function public.ai_left(text) from public, anon;
grant execute on function public.ai_left(text) to authenticated;

-- ── Salla ───────────────────────────────────────────────────────────────────
-- Which store products give a subscription, and for how long. The coach fills it.
create table if not exists public.products_map (
  id uuid primary key default gen_random_uuid(),
  salla_product_id text,
  product_name text,
  option_value text,
  days integer not null check (days between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint products_map_has_product check (salla_product_id is not null or product_name is not null)
);

-- Purchases whose buyer has no account yet: applied when they sign up with the same phone or email.
create table if not exists public.pending_subscriptions (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  phone text,
  email text,
  days integer not null,
  product text,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  applied_profile uuid references public.profiles(id) on delete set null
);
create index if not exists pending_subscriptions_phone_idx on public.pending_subscriptions (phone) where applied_at is null;

-- Every notification from Salla, and the orders already used (never twice).
create table if not exists public.webhook_log (
  id bigint generated always as identity primary key,
  order_id text,
  event text,
  status text,
  result text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.salla_orders_applied (
  order_id text primary key,
  profile_id uuid references public.profiles(id) on delete set null,
  days integer not null,
  applied_at timestamptz not null default now()
);
create table if not exists public.salla_config (
  id integer primary key default 1 check (id = 1),
  webhook_secret text
);
insert into public.salla_config (id) values (1) on conflict (id) do nothing;

do $$
declare t text;
begin
  foreach t in array array['products_map', 'pending_subscriptions', 'webhook_log', 'salla_orders_applied', 'salla_config'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "Coach only" on public.%I', t);
    execute format('create policy "Coach only" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;
revoke all on public.products_map, public.pending_subscriptions, public.webhook_log, public.salla_orders_applied, public.salla_config from anon;

-- Saudi mobile in one form: 9665XXXXXXXX.
create or replace function public.normalize_phone(p text)
returns text language sql immutable
as $$
  select case
    when d ~ '^9665[0-9]{8}$' then d
    when d ~ '^009665[0-9]{8}$' then substr(d, 3)
    when d ~ '^05[0-9]{8}$' then '966' || substr(d, 2)
    when d ~ '^5[0-9]{8}$' then '966' || d
    when d = '' then null
    else d
  end
  from (select regexp_replace(translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '[^0-9]', '', 'g') as d) x
$$;

create or replace function public.find_profile(p_phone text, p_email text)
returns uuid language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select id from public.profiles where role = 'client' and p_phone is not null and public.normalize_phone(phone) = p_phone order by created_at desc limit 1),
    (select id from public.profiles where role = 'client' and p_email is not null and p_email <> '' and lower(email) = lower(p_email) order by created_at desc limit 1)
  )
$$;
revoke all on function public.find_profile(text, text) from public, anon, authenticated;

-- Receives Salla's notification (forwarded as-is by /api/salla/webhook).
create or replace function public.salla_webhook(p_body text, p_signature text, p_token text)
returns text language plpgsql security definer set search_path = public, extensions
as $$
declare
  secret text;
  payload jsonb;
  d jsonb;
  ev text;
  oid text;
  slug text;
  item jsonb;
  m record;
  days integer := 0;
  names text[] := '{}';
  phone text;
  email text;
  pid uuid;
  opts text;
begin
  select webhook_secret into secret from public.salla_config where id = 1;
  if secret is null or secret = '' then
    insert into public.webhook_log (result) values ('no_secret');
    return 'not_configured';
  end if;
  if coalesce(lower(p_signature), '') <> encode(hmac(convert_to(p_body, 'UTF8'), convert_to(secret, 'UTF8'), 'sha256'), 'hex')
     and coalesce(p_token, '') <> secret then
    insert into public.webhook_log (result) values ('bad_signature');
    return 'unauthorized';
  end if;

  begin
    payload := p_body::jsonb;
  exception when others then
    insert into public.webhook_log (result) values ('bad_json');
    return 'bad_json';
  end;
  d := coalesce(payload -> 'data', '{}'::jsonb);
  ev := payload ->> 'event';
  oid := coalesce(d ->> 'id', d ->> 'reference_id');
  slug := coalesce(d #>> '{status,slug}', d #>> '{status,customized,slug}', d ->> 'status');

  if ev is not null and ev not like 'order.%' then
    insert into public.webhook_log (order_id, event, status, result) values (oid, ev, slug, 'not_an_order');
    return 'ignored';
  end if;
  if slug is null or slug not in ('under_review', 'in_progress', 'delivering', 'delivered', 'completed', 'shipped') then
    insert into public.webhook_log (order_id, event, status, result) values (oid, ev, slug, 'not_paid');
    return 'ignored';
  end if;
  if oid is null then
    insert into public.webhook_log (event, status, result, payload) values (ev, slug, 'no_order_id', payload);
    return 'ignored';
  end if;
  if exists (select 1 from public.salla_orders_applied where order_id = oid) then
    insert into public.webhook_log (order_id, event, status, result) values (oid, ev, slug, 'already_applied');
    return 'duplicate';
  end if;

  -- Days from the products in the order (by product id or name, and the chosen option if mapped).
  for item in select * from jsonb_array_elements(coalesce(d -> 'items', '[]'::jsonb)) loop
    opts := coalesce((select string_agg(coalesce(o ->> 'value', o #>> '{value,name}', o ->> 'name', ''), ' | ') from jsonb_array_elements(coalesce(item -> 'options', '[]'::jsonb)) o), '');
    select pm.days, coalesce(item ->> 'name', pm.product_name) as n into m
    from public.products_map pm
    where (pm.salla_product_id is not null and pm.salla_product_id in (item ->> 'product_id', item #>> '{product,id}', item ->> 'id', item ->> 'sku'))
       or (pm.product_name is not null and trim(pm.product_name) = trim(coalesce(item ->> 'name', item #>> '{product,name}', '')))
    order by (pm.option_value is not null and position(pm.option_value in opts) > 0) desc, pm.option_value is null desc
    limit 1;
    if found and (m.days is not null) then
      days := days + m.days * greatest(1, coalesce((item ->> 'quantity')::integer, 1));
      names := names || m.n;
    end if;
  end loop;

  if days = 0 then
    insert into public.webhook_log (order_id, event, status, result)
    values (oid, ev, slug, 'no_subscription_product: ' || coalesce((select string_agg(coalesce(i ->> 'name', i #>> '{product,name}', '?'), '، ') from jsonb_array_elements(coalesce(d -> 'items', '[]'::jsonb)) i), ''));
    return 'ignored';
  end if;

  phone := public.normalize_phone(coalesce(d #>> '{customer,mobile_code}', '') || coalesce(d #>> '{customer,mobile}', ''));
  email := nullif(lower(trim(coalesce(d #>> '{customer,email}', ''))), '');
  pid := public.find_profile(phone, email);

  insert into public.salla_orders_applied (order_id, profile_id, days) values (oid, pid, days);
  if pid is not null then
    perform public.grant_subscription(pid, days);
    insert into public.webhook_log (order_id, event, status, result) values (oid, ev, slug, 'activated ' || days || ' days');
    return 'activated';
  end if;
  insert into public.pending_subscriptions (order_id, phone, email, days, product) values (oid, phone, email, days, array_to_string(names, '، '));
  insert into public.webhook_log (order_id, event, status, result) values (oid, ev, slug, 'pending ' || days || ' days');
  return 'pending';
end $$;
revoke all on function public.salla_webhook(text, text, text) from public, authenticated;
grant execute on function public.salla_webhook(text, text, text) to anon;

-- New account (or changed phone/email): apply purchases waiting for it.
create or replace function public.apply_pending_subscriptions()
returns trigger language plpgsql security definer set search_path = public
as $$
declare r record;
begin
  if new.role <> 'client' then return new; end if;
  for r in
    select * from public.pending_subscriptions
    where applied_at is null
      and ((phone is not null and phone = public.normalize_phone(new.phone)) or (email is not null and email = lower(new.email)))
    for update
  loop
    perform public.grant_subscription(new.id, r.days);
    update public.pending_subscriptions set applied_at = now(), applied_profile = new.id where id = r.id;
    update public.salla_orders_applied set profile_id = new.id where order_id = r.order_id;
  end loop;
  return new;
end $$;
revoke all on function public.apply_pending_subscriptions() from public, anon, authenticated;
drop trigger if exists profiles_apply_pending on public.profiles;
create trigger profiles_apply_pending after insert or update of phone, email on public.profiles
for each row execute function public.apply_pending_subscriptions();

-- Reminders: add the Saturday check-in for subscribers.
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
    union all
    -- Subscribers without a coach follow-up: weekly check-in every Saturday at 10am.
    select c.profile_id, 'checkin-sat', time '10:00', '📅 تسجيلك الأسبوعي',
           case when pr.gender = 'male' then 'اليوم السبت! سجل وزنك وقياساتك وشوف تطورك 💪' else 'اليوم السبت! سجلي وزنك وقياساتك وشوفي تطورك 💪' end, '/app/checkin'
    from public.clients c join public.profiles pr on pr.id = c.profile_id
    where c.followup_start is null and extract(dow from today) = 6
      and pr.account_type = 'subscriber' and (pr.subscription_end is null or pr.subscription_end >= today)
      and not exists (select 1 from public.weekly_followups w where w.client_id = c.id and w.week_date = today)
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

-- Every night just after midnight Riyadh time (21:05 UTC).
select cron.unschedule('zahraafit-expire-subscriptions') where exists (select 1 from cron.job where jobname = 'zahraafit-expire-subscriptions');
select cron.schedule('zahraafit-expire-subscriptions', '5 21 * * *', 'select public.expire_subscriptions()');
