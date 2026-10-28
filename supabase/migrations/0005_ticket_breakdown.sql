-- Migration 0005: Scoped dashboard breakdown for the API/UI.
-- Returns one row per branch + device with open/resolved/escalated counts.
-- Security definer so the hierarchy names are readable by every role; scope is
-- enforced by branch_in_scope().

create or replace function public.ticket_breakdown()
returns table (
  branch_id uuid,
  branch_name text,
  zone_name text,
  nbg_name text,
  device_id uuid,
  device_serial text,
  open_count bigint,
  resolved_count bigint,
  escalated_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.name,
    z.name,
    n.name,
    d.id,
    d.serial_number,
    count(*) filter (where t.status = 'open'),
    count(*) filter (where t.status = 'resolved'),
    count(*) filter (where t.status = 'open' and t.escalation_level > 0)
  from public.tickets t
  join public.branches b on b.id = t.branch_id
  join public.zones z on z.id = b.zone_id
  join public.nbgs n on n.id = z.nbg_id
  left join public.devices d on d.id = t.device_id
  where public.branch_in_scope(t.branch_id)
  group by b.id, b.name, z.name, n.name, d.id, d.serial_number
$$;

revoke all on function public.ticket_breakdown() from public;
grant execute on function public.ticket_breakdown() to authenticated;
