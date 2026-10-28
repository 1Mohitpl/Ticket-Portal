-- Migration 0005: Public "create ticket" API endpoint
-- Called with the publishable (anon) key, by anyone, via:
--   POST /rest/v1/rpc/create_ticket_api
--   { "p_branch_code": "BA", "p_note": "ATM not dispensing" }
--
-- No login is required: the function is SECURITY DEFINER so it can write to
-- the (otherwise read-only) tickets table for external callers.

create or replace function public.create_ticket_api(p_branch_code text, p_note text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  branch        public.branches%rowtype;
  active_si     uuid;
  new_ticket_id uuid;
  new_number    text;
  note          text;
begin
  -- ---- Validate input ----
  p_branch_code := btrim(coalesce(p_branch_code, ''));
  if p_branch_code = '' then
    raise exception 'Input validation failed'
      using hint = 'p_branch_code is required (a branch code such as "BA")';
  end if;

  note := nullif(btrim(coalesce(p_note, '')), '');
  if note is not null and length(note) > 2000 then
    raise exception 'Input validation failed'
      using hint = 'p_note cannot exceed 2000 characters';
  end if;

  -- ---- Resolve the branch ----
  select * into branch
  from public.branches
  where lower(code) = lower(p_branch_code);
  if not found then
    raise exception 'Branch not found'
      using hint = 'No branch exists with code "' || p_branch_code || '"';
  end if;

  -- ---- Assign the branch's active SI (if any) ----
  select bsa.si_user_id into active_si
  from public.branch_si_assignments bsa
  where bsa.branch_id = branch.id and bsa.is_active
  limit 1;

  -- ---- Create the ticket ----
  insert into public.tickets (branch_id, device_id, si_user_id, status, escalation_level)
  values (branch.id, null, active_si, 'open', 0)
  returning tickets.id, tickets.ticket_number into new_ticket_id, new_number;

  -- ---- Audit trail ----
  insert into public.ticket_events (ticket_id, event_type, actor_id, actor_role, note)
  values (new_ticket_id, 'created', auth.uid(), null,
          coalesce(note, 'Ticket created via create-ticket API'));

  return json_build_object(
    'ticket_id', new_ticket_id,
    'ticket_number', new_number,
    'branch_code', branch.code,
    'branch_name', branch.name,
    'si_user_id', active_si,
    'note', note
  );
end;
$$;

-- Only Head Office may create tickets elsewhere; grant the external/API path
-- to anon + authenticated callers explicitly (function is callable via PostgREST).
revoke all on function public.create_ticket_api(text, text) from public;
grant execute on function public.create_ticket_api(text, text) to anon;
grant execute on function public.create_ticket_api(text, text) to authenticated;
