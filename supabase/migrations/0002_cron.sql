-- Migration 0002: Automation schedules (pg_cron + pg_net)
-- Enable extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ============================================================
-- Automation functions (security definer; run as scheduler role, bypass RLS)
-- ============================================================

create or replace function public.generate_tickets() returns void
language plpgsql volatile security definer
as $$
declare
  rec record;
  new_ticket_id uuid;
begin
  for rec in
    select d.id as device_id, d.branch_id, d.status, bsa.si_user_id
    from public.devices d
    join public.branches b on b.id = d.branch_id
    join public.branch_si_assignments bsa on bsa.branch_id = b.id and bsa.is_active
    where d.status in ('fault','system_off')
      and d.status_since <= now() - interval '24 hours'
      and not exists (
        select 1 from public.tickets t
        where t.device_id = d.id and t.status = 'open'
      )
  loop
    insert into public.tickets (ticket_number, branch_id, device_id, si_user_id, status, escalation_level)
    values (public.next_ticket_number(), rec.branch_id, rec.device_id, rec.si_user_id, 'open', 0)
    returning id into new_ticket_id;

    insert into public.ticket_events (ticket_id, event_type, actor_role, note)
    values (
      new_ticket_id,
      'created',
      null,
      'Auto-created after 24h in ' || rec.status
    );
  end loop;
end;
$$;

create or replace function public.escalate_tickets() returns void
language plpgsql volatile security definer
as $$
declare
  rec record;
  target_level int;
begin
  for rec in
    select t.id, t.ticket_number, t.created_at, t.escalation_level,
           si.email as si_email, si.name as si_name
    from public.tickets t
    join public.profiles si on si.id = t.si_user_id
    where t.status = 'open'
  loop
    if rec.escalation_level < 1 and now() >= rec.created_at + interval '24 hours' then
      target_level := 1;
    elsif rec.escalation_level < 2 and now() >= rec.created_at + interval '48 hours' then
      target_level := 2;
    elsif rec.escalation_level < 3 and now() >= rec.created_at + interval '72 hours' then
      target_level := 3;
    else
      target_level := rec.escalation_level;
    end if;

    if target_level > rec.escalation_level then
      update public.tickets
      set escalation_level = target_level, updated_at = now()
      where id = rec.id;

      insert into public.ticket_events (ticket_id, event_type, actor_role, note)
      values (rec.id, 'escalated', null, 'Escalation level ' || target_level);

      insert into public.email_outbox (ticket_id, to_email, subject, body)
      values (
        rec.id,
        rec.si_email,
        case target_level
          when 1 then 'S-Watch: Level 1 warning - ticket ' || rec.ticket_number
          when 2 then 'S-Watch: Level 2 warning - ticket ' || rec.ticket_number
          else 'S-Watch: Level 3 final warning - ticket ' || rec.ticket_number
        end,
        case target_level
          when 1 then 'Dear ' || coalesce(rec.si_name,'') || ', ticket ' || rec.ticket_number
                     || ' has been open for 24 hours. Please prioritise resolution.'
          when 2 then 'Dear ' || coalesce(rec.si_name,'') || ', ticket ' || rec.ticket_number
                     || ' has been open for 48 hours. Immediate action is required.'
          else 'Dear ' || coalesce(rec.si_name,'') || ', ticket ' || rec.ticket_number
                     || ' has been open for 72 hours. This is a final warning requiring urgent resolution.'
        end
      );
    end if;
  end loop;
end;
$$;

-- ============================================================
-- Schedules: every 5 minutes
-- ============================================================
select cron.schedule(
  'generate-tickets-every-5min',
  '*/5 * * * *',
  'select public.generate_tickets()'
);

select cron.schedule(
  'escalate-tickets-every-5min',
  '*/5 * * * *',
  'select public.escalate_tickets()'
);

-- send-emails via pg_cron + pg_net calling the Edge Function.
-- REPLACE <PROJECT_REF> with your Supabase project ref before applying.
-- The Edge Function must be deployed and its secret (email provider API key) set.
select cron.schedule(
  'send-emails-every-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.anon_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
