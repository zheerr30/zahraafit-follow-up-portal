-- ZahraaFit — Phase 12: how many AI photo reads are left today (shown on «صوري صحنك»)
-- Run this whole file once in the Supabase SQL Editor (after phase11-restaurants.sql).
-- Safe to run again.

begin;

create or replace function public.ai_left(p_kind text)
returns integer language plpgsql stable security definer set search_path = public
as $$
declare
  lim integer := case p_kind when 'meal' then 15 when 'label' then 15 when 'menu' then 10 else 0 end;
  used integer;
begin
  if auth.uid() is null then return 0; end if;
  if public.is_admin() then lim := 200; end if;
  select count into used from public.ai_usage
  where profile_id = auth.uid() and day = (now() at time zone 'Asia/Riyadh')::date and kind = p_kind;
  return greatest(0, lim - coalesce(used, 0));
end $$;
revoke all on function public.ai_left(text) from public, anon;
grant execute on function public.ai_left(text) to authenticated;

notify pgrst, 'reload schema';

commit;
