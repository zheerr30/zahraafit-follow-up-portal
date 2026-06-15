-- ZahraaFit Follow-up Portal MVP
-- Run this file in the Supabase SQL Editor after creating a new project.

begin;

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('client', 'admin');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role public.user_role not null default 'client',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete set null,
  age integer check (age is null or age between 10 and 100),
  height_cm numeric(5, 2) check (height_cm is null or height_cm between 100 and 250),
  goal text,
  start_weight numeric(6, 2) check (start_weight is null or start_weight between 20 and 300),
  status text not null default 'active' check (status in ('active', 'paused')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  content text,
  file_path text,
  file_url text,
  is_current boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.weekly_followups (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  week_date date not null default current_date,
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg between 20 and 300),
  waist_cm numeric(6, 2) check (waist_cm is null or waist_cm between 20 and 250),
  hips_cm numeric(6, 2) check (hips_cm is null or hips_cm between 20 and 250),
  nutrition_commitment integer check (nutrition_commitment is null or nutrition_commitment between 1 and 5),
  workout_commitment integer check (workout_commitment is null or workout_commitment between 1 and 5),
  steps_count integer check (steps_count is null or steps_count between 0 and 100000),
  sleep_hours numeric(4, 2) check (sleep_hours is null or sleep_hours between 0 and 24),
  menstrual_cycle text,
  client_notes text,
  coach_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.followup_photos (
  id uuid primary key default gen_random_uuid(),
  followup_id uuid not null references public.weekly_followups(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  photo_type text not null default 'other' check (photo_type in ('front', 'side', 'back', 'other')),
  file_path text not null,
  photo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists clients_profile_id_idx on public.clients(profile_id);
create index if not exists clients_coach_id_idx on public.clients(coach_id);
create index if not exists plans_client_id_idx on public.plans(client_id);
create index if not exists weekly_followups_client_id_idx on public.weekly_followups(client_id);
create index if not exists weekly_followups_week_date_idx on public.weekly_followups(week_date desc);
create index if not exists followup_photos_followup_id_idx on public.followup_photos(followup_id);
create index if not exists followup_photos_client_id_idx on public.followup_photos(client_id);
create index if not exists coach_notes_client_id_idx on public.coach_notes(client_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists weekly_followups_set_updated_at on public.weekly_followups;
create trigger weekly_followups_set_updated_at
before update on public.weekly_followups
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'client'), '@', 1)),
    coalesce(new.email, ''),
    'client'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.plans to authenticated;
grant select, insert, update on public.weekly_followups to authenticated;
grant select, insert on public.followup_photos to authenticated;
grant select, insert on public.coach_notes to authenticated;

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.plans enable row level security;
alter table public.weekly_followups enable row level security;
alter table public.followup_photos enable row level security;
alter table public.coach_notes enable row level security;

drop policy if exists "Profiles are visible to owner or admin" on public.profiles;
create policy "Profiles are visible to owner or admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Clients are visible to owner or admin" on public.clients;
create policy "Clients are visible to owner or admin"
on public.clients for select
to authenticated
using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "Admins can insert clients" on public.clients;
create policy "Admins can insert clients"
on public.clients for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update clients" on public.clients;
create policy "Admins can update clients"
on public.clients for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete clients" on public.clients;
create policy "Admins can delete clients"
on public.clients for delete
to authenticated
using (public.is_admin());

drop policy if exists "Plans are visible to client owner or admin" on public.plans;
create policy "Plans are visible to client owner or admin"
on public.plans for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.clients c
    where c.id = plans.client_id and c.profile_id = auth.uid()
  )
);

drop policy if exists "Admins can insert plans" on public.plans;
create policy "Admins can insert plans"
on public.plans for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update plans" on public.plans;
create policy "Admins can update plans"
on public.plans for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete plans" on public.plans;
create policy "Admins can delete plans"
on public.plans for delete
to authenticated
using (public.is_admin());

drop policy if exists "Followups are visible to client owner or admin" on public.weekly_followups;
create policy "Followups are visible to client owner or admin"
on public.weekly_followups for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.clients c
    where c.id = weekly_followups.client_id and c.profile_id = auth.uid()
  )
);

drop policy if exists "Clients can insert own followups" on public.weekly_followups;
create policy "Clients can insert own followups"
on public.weekly_followups for insert
to authenticated
with check (
  coach_notes is null
  and
  exists (
    select 1 from public.clients c
    where c.id = weekly_followups.client_id and c.profile_id = auth.uid()
  )
);

drop policy if exists "Admins can update followups" on public.weekly_followups;
create policy "Admins can update followups"
on public.weekly_followups for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Photos are visible to client owner or admin" on public.followup_photos;
create policy "Photos are visible to client owner or admin"
on public.followup_photos for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.clients c
    where c.id = followup_photos.client_id and c.profile_id = auth.uid()
  )
);

drop policy if exists "Clients can insert own photos" on public.followup_photos;
create policy "Clients can insert own photos"
on public.followup_photos for insert
to authenticated
with check (
  exists (
    select 1 from public.clients c
    where c.id = followup_photos.client_id and c.profile_id = auth.uid()
  )
  and exists (
    select 1 from public.weekly_followups wf
    where wf.id = followup_photos.followup_id
    and wf.client_id = followup_photos.client_id
  )
);

drop policy if exists "Coach notes are visible to client owner or admin" on public.coach_notes;
create policy "Coach notes are visible to client owner or admin"
on public.coach_notes for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.clients c
    where c.id = coach_notes.client_id and c.profile_id = auth.uid()
  )
);

drop policy if exists "Admins can insert coach notes" on public.coach_notes;
create policy "Admins can insert coach notes"
on public.coach_notes for insert
to authenticated
with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'followup-photos',
  'followup-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-plans',
  'client-plans',
  false,
  20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Clients and admins can read followup photos" on storage.objects;
create policy "Clients and admins can read followup photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'followup-photos'
  and (
    public.is_admin()
    or exists (
      select 1 from public.clients c
      where c.id::text = (storage.foldername(name))[1]
      and c.profile_id = auth.uid()
    )
  )
);

drop policy if exists "Clients can upload own followup photos" on storage.objects;
create policy "Clients can upload own followup photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'followup-photos'
  and exists (
    select 1 from public.clients c
    where c.id::text = (storage.foldername(name))[1]
    and c.profile_id = auth.uid()
  )
);

drop policy if exists "Admins can manage followup photos" on storage.objects;
create policy "Admins can manage followup photos"
on storage.objects for all
to authenticated
using (bucket_id = 'followup-photos' and public.is_admin())
with check (bucket_id = 'followup-photos' and public.is_admin());

drop policy if exists "Clients and admins can read plan files" on storage.objects;
create policy "Clients and admins can read plan files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'client-plans'
  and (
    public.is_admin()
    or exists (
      select 1 from public.clients c
      where c.id::text = (storage.foldername(name))[1]
      and c.profile_id = auth.uid()
    )
  )
);

drop policy if exists "Admins can manage plan files" on storage.objects;
create policy "Admins can manage plan files"
on storage.objects for all
to authenticated
using (bucket_id = 'client-plans' and public.is_admin())
with check (bucket_id = 'client-plans' and public.is_admin());

commit;
