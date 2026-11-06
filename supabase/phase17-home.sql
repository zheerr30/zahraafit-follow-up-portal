-- ZahraaFit — Phase 17: home page helpers
-- Run this whole file once in the Supabase SQL Editor (after phase16-ramadan.sql).
-- Safe to run again.

begin;

-- A purchase from the store activated after her last intake form: she should fill the new plan's details.
create or replace function public.my_new_purchase()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.salla_orders_applied o
    where o.profile_id = auth.uid()
      and o.applied_at > coalesce((select max(r.submitted_at) from public.plan_requests r where r.profile_id = auth.uid() and r.status <> 'cancelled'), '-infinity'::timestamptz)
  )
$$;
revoke all on function public.my_new_purchase() from public, anon;
grant execute on function public.my_new_purchase() to authenticated;

notify pgrst, 'reload schema';

commit;
