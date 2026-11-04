-- ZahraaFit — Phase 3: weekly articles and weekly challenges
-- Run this whole file once in the Supabase SQL Editor (after phase2-interactive-plans.sql).
-- Safe to run again.

begin;

-- Articles the coach writes. Subscribers see the published ones.
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 2 and 200),
  emoji text,
  body text not null default '',
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Challenges the coach sets for a date range (usually a week).
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 2 and 200),
  emoji text,
  description text not null default '',
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint challenges_dates check (ends_on >= starts_on and ends_on - starts_on <= 60)
);

-- One row per subscriber per day she completed a challenge.
create table if not exists public.challenge_checkins (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  unique (challenge_id, client_id, day)
);

create index if not exists articles_published_idx on public.articles (published, published_at desc);
create index if not exists challenges_dates_idx on public.challenges (starts_on desc);
create index if not exists challenge_checkins_challenge_idx on public.challenge_checkins (challenge_id);
create index if not exists challenge_checkins_client_idx on public.challenge_checkins (client_id);

drop trigger if exists articles_set_updated_at on public.articles;
create trigger articles_set_updated_at before update on public.articles for each row execute function public.set_updated_at();
drop trigger if exists challenges_set_updated_at on public.challenges;
create trigger challenges_set_updated_at before update on public.challenges for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.articles, public.challenges, public.challenge_checkins to authenticated;
alter table public.articles enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_checkins enable row level security;

drop policy if exists "Read published articles" on public.articles;
create policy "Read published articles" on public.articles for select to authenticated using (published or public.is_admin());
drop policy if exists "Coach writes articles" on public.articles;
create policy "Coach writes articles" on public.articles for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Read challenges" on public.challenges;
create policy "Read challenges" on public.challenges for select to authenticated using (true);
drop policy if exists "Coach writes challenges" on public.challenges;
create policy "Coach writes challenges" on public.challenges for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Owner or coach reads checkins" on public.challenge_checkins;
create policy "Owner or coach reads checkins" on public.challenge_checkins for select to authenticated using (public.is_admin() or public.owns_client(client_id));
drop policy if exists "Owner checks in" on public.challenge_checkins;
create policy "Owner checks in" on public.challenge_checkins for insert to authenticated with check (
  public.owns_client(client_id)
  and exists (select 1 from public.challenges c where c.id = challenge_id and day between c.starts_on and c.ends_on)
);
drop policy if exists "Owner unchecks" on public.challenge_checkins;
create policy "Owner unchecks" on public.challenge_checkins for delete to authenticated using (public.owns_client(client_id));

notify pgrst, 'reload schema';

commit;
