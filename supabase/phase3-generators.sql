-- ZahraaFit — Phase 3: the coach's generator files live in the platform.
-- Run once in the Supabase SQL Editor. Safe to run again.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generators', 'generators', false, 31457280, array['text/html'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Only the coach reads and replaces generator files.
drop policy if exists "Admin manages generators" on storage.objects;
create policy "Admin manages generators"
on storage.objects for all
to authenticated
using (bucket_id = 'generators' and public.is_admin())
with check (bucket_id = 'generators' and public.is_admin());

commit;
