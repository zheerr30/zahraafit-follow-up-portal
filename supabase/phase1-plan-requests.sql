-- ZahraaFit — Phase 1: plan requests (intake form + "plans waiting" queue)
-- Run this whole file once in the Supabase SQL Editor, after schema.sql.
-- Safe to run again: every statement checks before it creates.

begin;

-- ---------------------------------------------------------------
-- Business days: Sunday to Thursday. Friday (5) and Saturday (6) are off.
-- ---------------------------------------------------------------
create or replace function public.add_business_days(start_date date, days_to_add integer)
returns date
language plpgsql
immutable
as $$
declare
  d date := start_date;
  added integer := 0;
begin
  while added < days_to_add loop
    d := d + 1;
    if extract(dow from d) not in (5, 6) then
      added := added + 1;
    end if;
  end loop;
  return d;
end;
$$;

-- ---------------------------------------------------------------
-- One row per order the subscriber fills the intake form for.
-- ---------------------------------------------------------------
create table if not exists public.plan_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  order_number text not null check (length(trim(order_number)) between 3 and 40),
  wants_nutrition boolean not null default false,
  wants_workout boolean not null default false,
  wants_followup boolean not null default false,
  order_verified boolean not null default false,
  verified_at timestamptz,
  status text not null default 'submitted'
    check (status in ('submitted', 'in_progress', 'delivered', 'cancelled')),
  answers jsonb not null default '{}'::jsonb,
  inbody_path text,
  submitted_at timestamptz not null default now(),
  due_date date,
  started_at timestamptz,
  delivered_at timestamptz,
  coach_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_requests_has_type check (wants_nutrition or wants_workout or wants_followup)
);

-- An order number can be claimed by one request only (cancelled ones free it again).
create unique index if not exists plan_requests_order_unique
  on public.plan_requests (lower(trim(order_number)))
  where status <> 'cancelled';

create index if not exists plan_requests_status_idx on public.plan_requests (status, submitted_at);
create index if not exists plan_requests_client_idx on public.plan_requests (client_id, submitted_at desc);
create index if not exists plan_requests_profile_idx on public.plan_requests (profile_id);

drop trigger if exists plan_requests_set_updated_at on public.plan_requests;
create trigger plan_requests_set_updated_at
before update on public.plan_requests
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- Guard: a subscriber can only create a fresh request and edit her answers
-- while it is still "submitted". Status, verification, dates and the coach's
-- note are set by the coach only.
-- ---------------------------------------------------------------
create or replace function public.plan_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    if tg_op = 'INSERT' and new.due_date is null then
      new.due_date := public.add_business_days((new.submitted_at at time zone 'Asia/Riyadh')::date, 3);
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.profile_id := auth.uid();
    new.status := 'submitted';
    new.order_verified := false;
    new.verified_at := null;
    new.started_at := null;
    new.delivered_at := null;
    new.coach_note := null;
    new.submitted_at := now();
    new.due_date := public.add_business_days((now() at time zone 'Asia/Riyadh')::date, 3);
    return new;
  end if;

  -- UPDATE by the subscriber
  if old.status <> 'submitted' then
    raise exception 'لا يمكن تعديل الطلب بعد ما بدأت المدربة عليه.';
  end if;
  new.id := old.id;
  new.client_id := old.client_id;
  new.profile_id := old.profile_id;
  new.status := old.status;
  new.order_verified := old.order_verified;
  new.verified_at := old.verified_at;
  new.submitted_at := old.submitted_at;
  new.due_date := old.due_date;
  new.started_at := old.started_at;
  new.delivered_at := old.delivered_at;
  new.coach_note := old.coach_note;
  -- Changing the order number after the coach confirmed it would undo the check.
  if old.order_verified then
    new.order_number := old.order_number;
  end if;
  return new;
end;
$$;

drop trigger if exists plan_requests_guard_trg on public.plan_requests;
create trigger plan_requests_guard_trg
before insert or update on public.plan_requests
for each row execute function public.plan_requests_guard();

-- ---------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------
grant select, insert, update on public.plan_requests to authenticated;
alter table public.plan_requests enable row level security;

drop policy if exists "Plan requests visible to owner or admin" on public.plan_requests;
create policy "Plan requests visible to owner or admin"
on public.plan_requests for select
to authenticated
using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "Subscribers create own plan requests" on public.plan_requests;
create policy "Subscribers create own plan requests"
on public.plan_requests for insert
to authenticated
with check (
  public.is_admin()
  or exists (
    select 1 from public.clients c
    where c.id = plan_requests.client_id and c.profile_id = auth.uid()
  )
);

drop policy if exists "Owner edits while submitted, admin always" on public.plan_requests;
create policy "Owner edits while submitted, admin always"
on public.plan_requests for update
to authenticated
using (public.is_admin() or (profile_id = auth.uid() and status = 'submitted'))
with check (public.is_admin() or profile_id = auth.uid());

-- ---------------------------------------------------------------
-- InBody files: private bucket, one folder per account.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inbody',
  'inbody',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owner and admin read inbody" on storage.objects;
create policy "Owner and admin read inbody"
on storage.objects for select
to authenticated
using (
  bucket_id = 'inbody'
  and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
);

drop policy if exists "Owner uploads inbody" on storage.objects;
create policy "Owner uploads inbody"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'inbody'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Admin manages inbody" on storage.objects;
create policy "Admin manages inbody"
on storage.objects for all
to authenticated
using (bucket_id = 'inbody' and public.is_admin())
with check (bucket_id = 'inbody' and public.is_admin());

notify pgrst, 'reload schema';

commit;
