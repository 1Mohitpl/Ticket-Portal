-- Migration 0001: Core schema, enums, helper functions, RLS, indexes
-- S-Watch 360 Desk

-- ============================================================
-- Enums
-- ============================================================
create type public.user_role as enum ('head_office','nbg','zonal','branch','si');
create type public.device_status as enum ('ok','fault','system_off');
create type public.ticket_status as enum ('open','resolved');
create type public.email_status as enum ('pending','sent','failed');

-- ============================================================
-- Hierarchy
-- ============================================================
create table public.nbgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  nbg_id uuid not null references public.nbgs(id) on delete cascade,
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Profiles (extends Supabase Auth)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  role public.user_role not null,
  nbg_id uuid references public.nbgs(id) on delete set null,
  zone_id uuid references public.zones(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- SI assignments (history retained; at most one active per branch)
-- ============================================================
create table public.branch_si_assignments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  si_user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  is_active boolean not null default true
);

-- ============================================================
-- Devices
-- ============================================================
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  type text not null,
  serial_number text not null,
  status public.device_status not null default 'ok',
  status_since timestamptz not null default now(),
  last_seen timestamptz,
  created_at timestamptz not null default now(),
  unique (serial_number)
);

-- ============================================================
-- Device status log
-- ============================================================
create table public.device_status_log (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  previous_status public.device_status,
  new_status public.device_status not null,
  changed_at timestamptz not null default now()
);

-- ============================================================
-- Ticket number sequence (SW-000123)
-- ============================================================
create sequence public.ticket_number_seq start with 1 increment by 1;

create or replace function public.next_ticket_number() returns text
language sql stable
as $$
  select 'SW-' || to_char(nextval('public.ticket_number_seq'), 'FM000000')
$$;

-- ============================================================
-- Tickets
-- ============================================================
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default public.next_ticket_number(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  si_user_id uuid references public.profiles(id) on delete set null,
  status public.ticket_status not null default 'open',
  escalation_level int not null default 0 check (escalation_level between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  resolution_note text
);

-- ============================================================
-- Ticket events (audit timeline)
-- ============================================================
create table public.ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  event_type text not null,
  actor_id uuid references public.profiles(id),
  actor_role public.user_role,
  note text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Email outbox (queued escalation emails)
-- ============================================================
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  to_email text not null,
  subject text not null,
  body text not null,
  status public.email_status not null default 'pending',
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Helper functions (security definer, stable) used by RLS
-- ============================================================
create or replace function public.current_user_role() returns public.user_role
language sql stable security definer
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Returns true if the given branch is within the caller's scope.
create or replace function public.branch_in_scope(branch_id uuid) returns boolean
language sql stable security definer
as $$
  declare
    r public.user_role;
    p public.profiles%rowtype;
  begin
    select * into p from public.profiles where id = auth.uid();
    if not found then return false; end if;
    r := p.role;

    if r = 'head_office' then
      return true;
    end if;

    if r = 'si' then
      return exists (
        select 1 from public.branch_si_assignments bsa
        where bsa.branch_id = branch_in_scope.branch_id
          and bsa.si_user_id = auth.uid()
          and bsa.is_active
      );
    end if;

    -- NBG / Zonal / Branch: walk up the branch's zone/nbg
    declare
      b public.branches%rowtype;
      z public.zones%rowtype;
    begin
      select * into b from public.branches where id = branch_in_scope.branch_id;
      if not found then return false; end if;

      if r = 'branch' then
        return b.id = p.branch_id;
      end if;

      select * into z from public.zones where id = b.zone_id;
      if not found then return false; end if;

      if r = 'zonal' then
        return z.id = p.zone_id;
      end if;

      if r = 'nbg' then
        return z.nbg_id = p.nbg_id;
      end if;

      return false;
    end;
  end;
$$;

-- ============================================================
-- RLS: enable on every table
-- ============================================================
alter table public.nbgs enable row level security;
alter table public.zones enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.branch_si_assignments enable row level security;
alter table public.devices enable row level security;
alter table public.device_status_log enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_events enable row level security;
alter table public.email_outbox enable row level security;

-- ============================================================
-- RLS policies
-- ============================================================

-- Profiles: read own profile; HO reads all; write is via Edge Function (service role)
create policy "profiles_own_read" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_ho_read_all" on public.profiles
  for select using (public.current_user_role() = 'head_office');

-- NBGs / Zones / Branches: read within scope; HO reads all
create policy "nbgs_scope_read" on public.nbgs
  for select using (
    public.current_user_role() = 'head_office'
    or id in (
      select n.id from public.nbgs n
      join public.profiles p on p.role = 'nbg' and p.nbg_id = n.id and p.id = auth.uid()
    )
  );
create policy "zones_scope_read" on public.zones
  for select using (
    public.current_user_role() = 'head_office'
    or id in (
      select z.id from public.zones z
      join public.profiles p on p.role in ('nbg','zonal')
        and (p.role = 'nbg' and z.nbg_id = p.nbg_id or p.role = 'zonal' and z.id = p.zone_id)
        and p.id = auth.uid()
    )
  );
create policy "branches_scope_read" on public.branches
  for select using (
    public.current_user_role() = 'head_office'
    or public.branch_in_scope(id)
  );

-- branch_si_assignments: HO full management; others read assignments for branches in scope
create policy "bsa_ho_manage" on public.branch_si_assignments
  for all using (public.current_user_role() = 'head_office')
  with check (public.current_user_role() = 'head_office');
create policy "bsa_read_scope" on public.branch_si_assignments
  for select using (
    public.current_user_role() = 'head_office'
    or public.branch_in_scope(branch_id)
  );

-- Devices: read within scope; SI reads devices of assigned branches
create policy "devices_scope_read" on public.devices
  for select using (
    public.current_user_role() = 'head_office'
    or public.branch_in_scope(branch_id)
  );

-- Device status log: read within scope
create policy "device_status_log_scope_read" on public.device_status_log
  for select using (
    public.current_user_role() = 'head_office'
    or public.branch_in_scope(
      (select branch_id from public.devices where id = device_status_log.device_id)
    )
  );

-- Tickets: read within scope; SI reads tickets for assigned branches
create policy "tickets_scope_read" on public.tickets
  for select using (
    public.current_user_role() = 'head_office'
    or public.branch_in_scope(branch_id)
  );

-- Ticket events: read within scope
create policy "ticket_events_scope_read" on public.ticket_events
  for select using (
    public.current_user_role() = 'head_office'
    or public.branch_in_scope((select branch_id from public.tickets where id = ticket_events.ticket_id))
  );

-- Email outbox: read within scope
create policy "email_outbox_scope_read" on public.email_outbox
  for select using (
    public.current_user_role() = 'head_office'
    or public.branch_in_scope((select branch_id from public.tickets where id = email_outbox.ticket_id))
  );

-- Nobody can delete tickets (or events). Only explicit policies above allow writes.
create policy "tickets_no_delete" on public.tickets
  for delete using (false);
create policy "ticket_events_no_delete" on public.ticket_events
  for delete using (false);

-- ============================================================
-- Indexes (PRD FR-11 / NFR Performance)
-- ============================================================
create index idx_tickets_branch_status on public.tickets(branch_id, status);
create index idx_tickets_created_at on public.tickets(created_at);
create index idx_tickets_status on public.tickets(status);
create index idx_devices_branch_status on public.devices(branch_id, status);
create index idx_devices_status_since on public.devices(status, status_since);
create index idx_email_outbox_status on public.email_outbox(status);
create index idx_ticket_events_ticket on public.ticket_events(ticket_id, created_at);
create index idx_profiles_role on public.profiles(role);
create index idx_bsa_branch_active on public.branch_si_assignments(branch_id, is_active);

-- ============================================================
-- Dashboard widget counts RPC (invoker rights => RLS applies)
-- "today" evaluated in Asia/Kolkata
-- ============================================================
create or replace function public.dashboard_counts()
returns table (widget text, value bigint, filter_key text)
language sql stable
as $$
  select 'open', count(*), 'open' from public.tickets where status = 'open'
  union all
  select 'today_open', count(*), 'today_open'
  from public.tickets
  where status = 'open'
    and (created_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date
  union all
  select 'today_resolved', count(*), 'today_resolved'
  from public.tickets
  where status = 'resolved'
    and (resolved_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date
  union all
  select 'resolved', count(*), 'resolved' from public.tickets where status = 'resolved'
  union all
  select 'escalated', count(*), 'escalated'
  from public.tickets where status = 'open' and escalation_level > 0
$$;

grant execute on function public.dashboard_counts() to authenticated;
