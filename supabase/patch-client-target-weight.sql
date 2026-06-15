begin;

alter table public.clients
add column if not exists target_weight numeric(6, 2)
check (target_weight is null or target_weight between 20 and 300);

create or replace function public.set_client_target_weight(target_weight_value numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if target_weight_value is not null and (target_weight_value < 20 or target_weight_value > 300) then
    raise exception 'Target weight must be between 20 and 300.';
  end if;

  update public.clients
  set target_weight = target_weight_value
  where profile_id = auth.uid();

  if not found then
    raise exception 'Client profile was not found.';
  end if;
end;
$$;

revoke all on function public.set_client_target_weight(numeric) from public;
grant execute on function public.set_client_target_weight(numeric) to authenticated;

notify pgrst, 'reload schema';

commit;
