-- Migration 0004: Authenticated ticket notes and resolution actions
-- Writes are exposed through narrowly scoped RPCs because ticket tables are
-- otherwise read-only to authenticated clients.

create or replace function public.add_ticket_note(p_ticket_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.tickets%rowtype;
  caller_role public.user_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_note is null or length(btrim(p_note)) = 0 or length(p_note) > 2000 then
    raise exception 'Note must contain 1 to 2000 characters';
  end if;

  select * into target from public.tickets where id = p_ticket_id;
  if not found then
    raise exception 'Ticket not found';
  end if;

  caller_role := public.current_user_role();
  if caller_role <> 'head_office'
    and not (caller_role = 'si' and target.si_user_id = auth.uid()) then
    raise exception 'Only Head Office or the assigned SI can add a note';
  end if;
  if target.status <> 'open' then
    raise exception 'Resolved tickets cannot be updated';
  end if;

  insert into public.ticket_events (ticket_id, event_type, actor_id, actor_role, note)
  values (p_ticket_id, 'note', auth.uid(), caller_role, btrim(p_note));

  update public.tickets set updated_at = now() where id = p_ticket_id;
end;
$$;

create or replace function public.resolve_ticket(p_ticket_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.tickets%rowtype;
  caller_role public.user_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_note is not null and length(p_note) > 2000 then
    raise exception 'Resolution note cannot exceed 2000 characters';
  end if;

  select * into target from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found';
  end if;

  caller_role := public.current_user_role();
  if caller_role <> 'head_office'
    and not (caller_role = 'si' and target.si_user_id = auth.uid()) then
    raise exception 'Only Head Office or the assigned SI can resolve this ticket';
  end if;
  if target.status <> 'open' then
    raise exception 'Ticket is already resolved';
  end if;

  update public.tickets
  set status = 'resolved',
      resolved_at = now(),
      resolved_by = auth.uid(),
      resolution_note = nullif(btrim(p_note), ''),
      updated_at = now()
  where id = p_ticket_id;

  insert into public.ticket_events (ticket_id, event_type, actor_id, actor_role, note)
  values (p_ticket_id, 'resolved', auth.uid(), caller_role, nullif(btrim(p_note), ''));
end;
$$;

revoke all on function public.add_ticket_note(uuid, text) from public;
revoke all on function public.resolve_ticket(uuid, text) from public;
grant execute on function public.add_ticket_note(uuid, text) to authenticated;
grant execute on function public.resolve_ticket(uuid, text) to authenticated;
