-- ZahraaFit — Phase 6: subscribers can edit their own name and phone
-- Run this whole file once in the Supabase SQL Editor. Safe to run again.

begin;

-- Only these two fields; role and email stay as they are.
create or replace function public.update_my_profile(p_full_name text, p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if length(trim(coalesce(p_full_name, ''))) not between 2 and 120 then raise exception 'name'; end if;
  if p_phone is not null and length(p_phone) > 30 then raise exception 'phone'; end if;
  update public.profiles
  set full_name = trim(p_full_name), phone = nullif(trim(coalesce(p_phone, '')), ''), updated_at = now()
  where id = auth.uid();
end $$;

revoke all on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
