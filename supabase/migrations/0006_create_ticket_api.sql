-- Authenticated REST RPC for creating a ticket for a branch in the caller's scope.
-- POST /rest/v1/rpc/create_ticket_api

drop function if exists public.create_ticket_api(text, text);

create or replace function public.create_ticket_api(
  p_branch_code text,
  p_note text default null,
  p_device_serial text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_branch public.branches%rowtype;
  target_device public.devices%rowtype;
  assigned_si uuid;
  new_ticket_id uuid;
  new_ticket_number text;
  clean_note text;
  clean_device_serial text;
  caller_role public.user_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  p_branch_code := btrim(coalesce(p_branch_code, ''));
  if p_branch_code = '' or length(p_branch_code) > 50 then
    raise exception 'A valid branch code is required';
  end if;

  clean_note := nullif(btrim(coalesce(p_note, '')), '');
  if clean_note is not null and length(clean_note) > 2000 then
    raise exception 'Note cannot exceed 2000 characters';
  end if;

  clean_device_serial := nullif(btrim(coalesce(p_device_serial, '')), '');
  if clean_device_serial is not null and length(clean_device_serial) > 200 then
    raise exception 'Device serial cannot exceed 200 characters';
  end if;

  select * into target_branch
  from public.branches
  where lower(code) = lower(p_branch_code);
  if not found then
    raise exception 'Branch not found';
  end if;

  if not public.branch_in_scope(target_branch.id) then
    raise exception 'Branch is outside the caller''s scope';
  end if;

  if clean_device_serial is not null then
    select * into target_device
    from public.devices
    where branch_id = target_branch.id
      and lower(serial_number) = lower(clean_device_serial);
    if not found then
      raise exception 'Device not found for this branch';
    end if;
  end if;

  select bsa.si_user_id into assigned_si
  from public.branch_si_assignments bsa
  where bsa.branch_id = target_branch.id and bsa.is_active
  order by bsa.assigned_at desc
  limit 1;

  caller_role := public.current_user_role();
  insert into public.tickets (branch_id, device_id, si_user_id, status, escalation_level)
  values (
    target_branch.id,
    target_device.id,
    assigned_si,
    'open',
    0
  )
  returning id, ticket_number into new_ticket_id, new_ticket_number;

  insert into public.ticket_events (ticket_id, event_type, actor_id, actor_role, note)
  values (
    new_ticket_id,
    'created',
    auth.uid(),
    caller_role,
    coalesce(clean_note, 'Ticket created through the ticket API')
  );

  return jsonb_build_object(
    'ticket_id', new_ticket_id,
    'ticket_number', new_ticket_number,
    'status', 'open',
    'branch_code', target_branch.code,
    'branch_name', target_branch.name,
    'device_serial', target_device.serial_number,
    'si_user_id', assigned_si,
    'note', clean_note
  );
end;
$$;

revoke all on function public.create_ticket_api(text, text, text) from public, anon;
grant execute on function public.create_ticket_api(text, text, text) to authenticated;
