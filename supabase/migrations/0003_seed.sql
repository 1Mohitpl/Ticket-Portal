-- Migration 0003: Seed data (2 NBGs, 4 zones, 12 branches, 40 devices, one user per role)
-- Password for every seeded user: SWatch123!

-- ---- Auth users ----
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('aaaaaaaa-1111-1111-1111-111111111101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ho@swatch.example', crypt('SWatch123!', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
  ('aaaaaaaa-1111-1111-1111-111111111102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','nbg@swatch.example', crypt('SWatch123!', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
  ('aaaaaaaa-1111-1111-1111-111111111103','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zonal@swatch.example', crypt('SWatch123!', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
  ('aaaaaaaa-1111-1111-1111-111111111104','00000000-0000-0000-0000-000000000000','authenticated','authenticated','branch@swatch.example', crypt('SWatch123!', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
  ('aaaaaaaa-1111-1111-1111-111111111105','00000000-0000-0000-0000-000000000000','authenticated','authenticated','si@swatch.example', crypt('SWatch123!', gen_salt('bf')), now(), now(), now(), '', '', '', '');

-- ---- NBGs ----
insert into public.nbgs (id, name, code) values
  ('11111111-1111-1111-1111-111111111101','North NBG','NBG-N'),
  ('11111111-1111-1111-1111-111111111102','South NBG','NBG-S');

-- ---- Zones ----
insert into public.zones (id, nbg_id, name, code) values
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111101','North Zone 1','NZ1'),
  ('22222222-2222-2222-2222-222222222202','11111111-1111-1111-1111-111111111101','North Zone 2','NZ2'),
  ('22222222-2222-2222-2222-222222222203','11111111-1111-1111-1111-111111111102','South Zone 1','SZ1'),
  ('22222222-2222-2222-2222-222222222204','11111111-1111-1111-1111-111111111102','South Zone 2','SZ2');

-- ---- Branches (3 per zone) ----
insert into public.branches (id, zone_id, name, code) values
  ('33333333-3333-3333-3333-333333333301','22222222-2222-2222-2222-222222222201','Branch Alpha','BA'),
  ('33333333-3333-3333-3333-333333333302','22222222-2222-2222-2222-222222222201','Branch Beta','BB'),
  ('33333333-3333-3333-3333-333333333303','22222222-2222-2222-2222-222222222201','Branch Gamma','BG'),
  ('33333333-3333-3333-3333-333333333304','22222222-2222-2222-2222-222222222202','Branch Delta','BD'),
  ('33333333-3333-3333-3333-333333333305','22222222-2222-2222-2222-222222222202','Branch Epsilon','BE'),
  ('33333333-3333-3333-3333-333333333306','22222222-2222-2222-2222-222222222202','Branch Zeta','BZ'),
  ('33333333-3333-3333-3333-333333333307','22222222-2222-2222-2222-222222222203','Branch Eta','BH'),
  ('33333333-3333-3333-3333-333333333308','22222222-2222-2222-2222-222222222203','Branch Theta','BT'),
  ('33333333-3333-3333-3333-333333333309','22222222-2222-2222-2222-222222222203','Branch Iota','BI'),
  ('33333333-3333-3333-3333-333333333310','22222222-2222-2222-2222-222222222204','Branch Kappa','BK'),
  ('33333333-3333-3333-3333-333333333311','22222222-2222-2222-2222-222222222204','Branch Lambda','BL'),
  ('33333333-3333-3333-3333-333333333312','22222222-2222-2222-2222-222222222204','Branch Mu','BM');

-- ---- Profiles ----
insert into public.profiles (id, email, name, role, nbg_id, zone_id, branch_id) values
  ('aaaaaaaa-1111-1111-1111-111111111101','ho@swatch.example','Head Office User','head_office', null, null, null),
  ('aaaaaaaa-1111-1111-1111-111111111102','nbg@swatch.example','NBG User','nbg', '11111111-1111-1111-1111-111111111101', null, null),
  ('aaaaaaaa-1111-1111-1111-111111111103','zonal@swatch.example','Zonal User','zonal', null, '22222222-2222-2222-2222-222222222201', null),
  ('aaaaaaaa-1111-1111-1111-111111111104','branch@swatch.example','Branch User','branch', null, null, '33333333-3333-3333-3333-333333333301'),
  ('aaaaaaaa-1111-1111-1111-111111111105','si@swatch.example','SI User','si', null, null, null);

-- ---- SI assignments: SI assigned to BA, BB, BD, BE, BH, BT, BK, BL (8 branches)
-- Leaves BG, BZ, BI, BM without SI (no tickets generated for them)
insert into public.branch_si_assignments (branch_id, si_user_id, assigned_by, is_active) values
  ('33333333-3333-3333-3333-333333333301','aaaaaaaa-1111-1111-1111-111111111105','aaaaaaaa-1111-1111-1111-111111111101', true),
  ('33333333-3333-3333-3333-333333333302','aaaaaaaa-1111-1111-1111-111111111105','aaaaaaaa-1111-1111-1111-111111111101', true),
  ('33333333-3333-3333-3333-333333333304','aaaaaaaa-1111-1111-1111-111111111105','aaaaaaaa-1111-1111-1111-111111111101', true),
  ('33333333-3333-3333-3333-333333333305','aaaaaaaa-1111-1111-1111-111111111105','aaaaaaaa-1111-1111-1111-111111111101', true),
  ('33333333-3333-3333-3333-333333333307','aaaaaaaa-1111-1111-1111-111111111105','aaaaaaaa-1111-1111-1111-111111111101', true),
  ('33333333-3333-3333-3333-333333333308','aaaaaaaa-1111-1111-1111-111111111105','aaaaaaaa-1111-1111-1111-111111111101', true),
  ('33333333-3333-3333-3333-333333333310','aaaaaaaa-1111-1111-1111-111111111105','aaaaaaaa-1111-1111-1111-111111111101', true),
  ('33333333-3333-3333-3333-333333333311','aaaaaaaa-1111-1111-1111-111111111105','aaaaaaaa-1111-1111-1111-111111111101', true);

-- ---- Devices: 40 devices, mix of statuses ----
-- Branch Alpha (33333333-3333-3333-3333-333333333301)
insert into public.devices (id, branch_id, type, serial_number, status, status_since, last_seen) values
  ('d0000001-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333301','ATM','SN-ATM-001','ok', now() - interval '5 days', now()),
  ('d0000001-0000-0000-0000-000000000002','33333333-3333-3333-3333-333333333301','Teller','SN-TEL-001','fault', now() - interval '30 hours', now() - interval '1 hour'),
  ('d0000001-0000-0000-0000-000000000003','33333333-3333-3333-3333-333333333301','UPS','SN-UPS-001','system_off', now() - interval '10 hours', now());

-- Branch Beta (...302)
insert into public.devices (id, branch_id, type, serial_number, status, status_since, last_seen) values
  ('d0000001-0000-0000-0000-000000000004','33333333-3333-3333-3333-333333333302','ATM','SN-ATM-002','ok', now() - interval '2 days', now()),
  ('d0000001-0000-0000-0000-000000000005','33333333-3333-3333-3333-333333333302','Teller','SN-TEL-002','fault', now() - interval '50 hours', now() - interval '3 hours'),
  ('d0000001-0000-0000-0000-000000000006','33333333-3333-3333-3333-333333333302','UPS','SN-UPS-002','ok', now() - interval '1 day', now());

-- Branch Gamma (...303) - no SI
insert into public.devices (id, branch_id, type, serial_number, status, status_since, last_seen) values
  ('d0000001-0000-0000-0000-000000000007','33333333-3333-3333-3333-333333333303','ATM','SN-ATM-003','fault', now() - interval '40 hours', now() - interval '2 hours'),
  ('d0000001-0000-0000-0000-000000000008','33333333-3333-3333-3333-333333333303','Teller','SN-TEL-003','ok', now() - interval '3 days', now());

-- Branch Delta (...304)
insert into public.devices (id, branch_id, type, serial_number, status, status_since, last_seen) values
  ('d0000001-0000-0000-0000-000000000009','33333333-3333-3333-3333-333333333304','ATM','SN-ATM-004','ok', now() - interval '1 day', now()),
  ('d0000001-0000-0000-0000-000000000010','33333333-3333-3333-3333-333333333304','Teller','SN-TEL-004','system_off', now() - interval '28 hours', now() - interval '30 min'),
  ('d0000001-0000-0000-0000-000000000011','33333333-3333-3333-3333-333333333304','UPS','SN-UPS-003','fault', now() - interval '100 hours', now() - interval '5 hours');

-- Branch Epsilon (...305)
insert into public.devices (id, branch_id, type, serial_number, status, status_since, last_seen) values
  ('d0000001-0000-0000-0000-000000000012','33333333-3333-3333-3333-333333333305','ATM','SN-ATM-005','fault', now() - interval '20 hours', now()),
  ('d0000001-0000-0000-0000-000000000013','33333333-3333-3333-3333-333333333305','Teller','SN-TEL-005','ok', now() - interval '4 days', now());

-- Branch Zeta (...306) - no SI
insert into public.devices (id, branch_id, type, serial_number, status, status_since, last_seen) values
  ('d0000001-0000-0000-0000-000000000014','33333333-3333-3333-3333-333333333306','ATM','SN-ATM-006','system_off', now() - interval '60 hours', now() - interval '4 hours'),
  ('d0000001-0000-0000-0000-000000000015','33333333-3333-3333-3333-333333333306','Teller','SN-TEL-006','ok', now() - interval '1 day', now());

-- Branch Eta (...307)
insert into public.devices (id, branch_id, type, serial_number, status, status_since, last_seen) values
  ('d0000001-0000-0000-0000-000000000016','33333333-3333-3333-3333-333333333307','ATM','SN-ATM-007','ok', now() - interval '2 days', now()),
  ('d0000001-0000-0000-0000-000000000017','33333333-3333-3333-3333-333333333307','Teller','SN-TEL-007','fault', now() - interval '36 hours', now() - interval '1 hour'),
  ('d0000001-0000-0000-0000-000000000018','33333333-3333-3333-3333-333333333307','UPS','SN-UPS-004','ok', now() - interval '2 days', now());

-- Branch Theta (...308)
insert into public.devices (id, branch_id, type, serial_number, status, status_since, last_seen) values
  ('d0000001-0000-0000-0000-000000000019','33333333-3333-3333-3333-333333333308','ATM','SN-ATM-008','ok', now() - interval '1 day', now()),
  ('d0000001-0000-0000-0000-000000000020','33333333-3333-3333-3333-333333333308','Teller','SN-TEL-008','system_off', now() - interval '200 hours', now() - interval '10 hours');

-- Branch Iota (...309) - no SI
insert into public.devices (id, branch_id, type, serial_number, status, status_since, last_seen) values
  ('d0000001-0000-0000-0000-000000000021','33333333-3333-3333-3333-333333333309','ATM','SN-ATM-009','fault', now() - interval '10 hours', now()),
  ('d0000001-0000-0000-0000-000000000022','33333333-3333-3333-3333-333333333309','Teller','SN-TEL-009','ok', now() - interval '3 days', now());

-- Branch Kappa (...310)
insert into public.devices (id, branch_id, type, serial_number, status, status_since, last_seen) values
  ('d0000001-0000-0000-0000-000000000023','33333333-3333-3333-3333-333333333310','ATM','SN-ATM-010','ok', now() - interval '2 days', now()),
  ('d0000001-0000-0000-0000-000000000024','33333333-3333-3333-3333-333333333310','Teller','SN-TEL-010','fault', now() - interval '30 hours', now() - interval '1 hour'),
  ('d0000001-0000-0000-0000-000000000025','33333333-3333-3333-3333-333333333310','UPS','SN-UPS-005','ok', now() - interval '1 day', now());

-- Branch Lambda (...311)
insert into public.devices (id, branch_id, type, serial_number, status, status_since, last_seen) values
  ('d0000001-0000-0000-0000-000000000026','33333333-3333-3333-3333-333333333311','ATM','SN-ATM-011','ok', now() - interval '1 day', now()),
  ('d0000001-0000-0000-0000-000000000027','33333333-3333-3333-3333-333333333311','Teller','SN-TEL-011','ok', now() - interval '2 days', now());

-- Branch Mu (...312) - no SI
insert into public.devices (id, branch_id, type, serial_number, status, status_since, last_seen) values
  ('d0000001-0000-0000-0000-000000000028','33333333-3333-3333-3333-333333333312','ATM','SN-ATM-012','ok', now() - interval '1 day', now()),
  ('d0000001-0000-0000-0000-000000000029','33333333-3333-3333-3333-333333333312','Teller','SN-TEL-012','system_off', now() - interval '48 hours', now() - interval '2 hours'),
  ('d0000001-0000-0000-0000-000000000030','33333333-3333-3333-3333-333333333312','UPS','SN-UPS-006','ok', now() - interval '1 day', now());

-- Remaining devices to reach 40 (add ok devices to branches that have fewer)
insert into public.devices (id, branch_id, type, serial_number, status, status_since, last_seen) values
  ('d0000001-0000-0000-0000-000000000031','33333333-3333-3333-3333-333333333303','UPS','SN-UPS-007','ok', now() - interval '2 days', now()),
  ('d0000001-0000-0000-0000-000000000032','33333333-3333-3333-3333-333333333304','UPS','SN-UPS-008','ok', now() - interval '1 day', now()),
  ('d0000001-0000-0000-0000-000000000033','33333333-3333-3333-3333-333333333306','UPS','SN-UPS-009','ok', now() - interval '1 day', now()),
  ('d0000001-0000-0000-0000-000000000034','33333333-3333-3333-3333-333333333309','UPS','SN-UPS-010','ok', now() - interval '1 day', now()),
  ('d0000001-0000-0000-0000-000000000035','33333333-3333-3333-3333-333333333312','Teller','SN-TEL-013','ok', now() - interval '1 day', now()),
  ('d0000001-0000-0000-0000-000000000036','33333333-3333-3333-3333-333333333301','Teller','SN-TEL-014','ok', now() - interval '3 days', now()),
  ('d0000001-0000-0000-0000-000000000037','33333333-3333-3333-3333-333333333302','UPS','SN-UPS-011','ok', now() - interval '3 days', now()),
  ('d0000001-0000-0000-0000-000000000038','33333333-3333-3333-3333-333333333305','UPS','SN-UPS-012','ok', now() - interval '2 days', now()),
  ('d0000001-0000-0000-0000-000000000039','33333333-3333-3333-3333-333333333308','UPS','SN-UPS-013','ok', now() - interval '3 days', now()),
  ('d0000001-0000-0000-0000-000000000040','33333333-3333-3333-3333-333333333311','UPS','SN-UPS-014','ok', now() - interval '2 days', now());

-- ---- Device status log samples ----
insert into public.device_status_log (device_id, previous_status, new_status, changed_at) values
  ('d0000001-0000-0000-0000-000000000002','ok','fault', now() - interval '30 hours'),
  ('d0000001-0000-0000-0000-000000000005','ok','fault', now() - interval '50 hours'),
  ('d0000001-0000-0000-0000-000000000010','ok','system_off', now() - interval '28 hours'),
  ('d0000001-0000-0000-0000-000000000011','ok','fault', now() - interval '100 hours'),
  ('d0000001-0000-0000-0000-000000000017','ok','fault', now() - interval '36 hours'),
  ('d0000001-0000-0000-0000-000000000020','ok','system_off', now() - interval '200 hours'),
  ('d0000001-0000-0000-0000-000000000024','ok','fault', now() - interval '30 hours'),
  ('d0000001-0000-0000-0000-000000000029','ok','system_off', now() - interval '48 hours');

-- ---- Tickets at various ages / escalation levels ----
insert into public.tickets (id, ticket_number, branch_id, device_id, si_user_id, status, escalation_level, created_at, updated_at) values
  ('70000001-0000-0000-0000-000000000001','SW-000100','33333333-3333-3333-3333-333333333301','d0000001-0000-0000-0000-000000000002','aaaaaaaa-1111-1111-1111-111111111105','open', 1, now() - interval '26 hours', now() - interval '26 hours'),
  ('70000001-0000-0000-0000-000000000002','SW-000101','33333333-3333-3333-3333-333333333302','d0000001-0000-0000-0000-000000000005','aaaaaaaa-1111-1111-1111-111111111105','open', 2, now() - interval '52 hours', now() - interval '52 hours'),
  ('70000001-0000-0000-0000-000000000003','SW-000102','33333333-3333-3333-3333-333333333310','d0000001-0000-0000-0000-000000000024','aaaaaaaa-1111-1111-1111-111111111105','open', 0, now() - interval '32 hours', now() - interval '32 hours'),
  ('70000001-0000-0000-0000-000000000004','SW-000103','33333333-3333-3333-3333-333333333304','d0000001-0000-0000-0000-000000000011','aaaaaaaa-1111-1111-1111-111111111105','resolved', 1, now() - interval '5 days', now() - interval '4 days'),
  ('70000001-0000-0000-0000-000000000005','SW-000104','33333333-3333-3333-3333-333333333308','d0000001-0000-0000-0000-000000000020','aaaaaaaa-1111-1111-1111-111111111105','open', 3, now() - interval '80 hours', now() - interval '80 hours');

-- Ticket events for seeded tickets
insert into public.ticket_events (ticket_id, event_type, actor_role, note, created_at) values
  ('70000001-0000-0000-0000-000000000001','created',null,'Auto-created after 24h in fault', now() - interval '26 hours'),
  ('70000001-0000-0000-0000-000000000001','escalated',null,'Escalation level 1', now() - interval '2 hours'),
  ('70000001-0000-0000-0000-000000000002','created',null,'Auto-created after 24h in fault', now() - interval '52 hours'),
  ('70000001-0000-0000-0000-000000000002','escalated',null,'Escalation level 1', now() - interval '28 hours'),
  ('70000001-0000-0000-0000-000000000002','escalated',null,'Escalation level 2', now() - interval '4 hours'),
  ('70000001-0000-0000-0000-000000000004','created',null,'Auto-created after 24h in fault', now() - interval '5 days'),
  ('70000001-0000-0000-0000-000000000004','escalated',null,'Escalation level 1', now() - interval '4 days 2 hours'),
  ('70000001-0000-0000-0000-000000000004','resolved','si','Resolved by SI user', now() - interval '4 days'),
  ('70000001-0000-0000-0000-000000000005','created',null,'Auto-created after 24h in system_off', now() - interval '80 hours'),
  ('70000001-0000-0000-0000-000000000005','escalated',null,'Escalation level 1', now() - interval '56 hours'),
  ('70000001-0000-0000-0000-000000000005','escalated',null,'Escalation level 2', now() - interval '32 hours'),
  ('70000001-0000-0000-0000-000000000005','escalated',null,'Escalation level 3', now() - interval '8 hours');

-- Reset ticket sequence so generated numbers don't collide with seed
select setval('public.ticket_number_seq', (select coalesce(max(substring(ticket_number from '\d+')::int),0) from public.tickets));
