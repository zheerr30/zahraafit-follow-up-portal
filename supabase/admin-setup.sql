-- ZahraaFit Admin Setup
-- 1) Create the coach user first in Supabase Dashboard:
--    Authentication > Users > Add user
--    Email: zheerr30@gmail.com
-- 2) Run this SQL in Supabase SQL Editor.

do $$
declare
  coach_email text := 'zheerr30@gmail.com';
  coach_user_id uuid;
begin
  select id
  into coach_user_id
  from auth.users
  where email = coach_email
  limit 1;

  if coach_user_id is null then
    raise exception 'No Supabase Auth user found for %. Create the user in Authentication > Users first.', coach_email;
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (coach_user_id, 'ZahraaFit Coach', coach_email, 'admin')
  on conflict (id) do update
  set full_name = excluded.full_name,
      email = excluded.email,
      role = 'admin',
      updated_at = now();

  delete from public.clients
  where profile_id = coach_user_id;
end $$;
