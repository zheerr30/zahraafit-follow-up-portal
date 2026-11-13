-- ZahraaFit — Phase 23: the coach sets «بدون أرقام» (hide_numbers) for a subscriber
-- Run this whole file once in the Supabase SQL Editor (after phase22-day-summary.sql).
-- Safe to run again.

begin;

-- Coach only: turn «بدون أرقام» on or off for one person.
create or replace function public.coach_set_hide_numbers(p_profile uuid, p_hide boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.profiles set hide_numbers = coalesce(p_hide, false) where id = p_profile;
end $$;
revoke all on function public.coach_set_hide_numbers(uuid, boolean) from public, anon;
grant execute on function public.coach_set_hide_numbers(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';

commit;
