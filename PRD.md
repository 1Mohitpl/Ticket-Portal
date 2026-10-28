# Product Requirements Document — S-Watch 360 Desk

| | |
|---|---|
| **Status** | Draft v1 |
| **Platform** | Web app (responsive, desktop-first) |
| **Tech stack** | React + TypeScript (Vite), Tailwind CSS, Supabase (Postgres, Auth, Row Level Security, Edge Functions, `pg_cron`) |
| **Deployment** | Static frontend host (Vercel or Netlify) + hosted Supabase project. No Docker. |

---

## 1. Overview

S-Watch 360 Desk is a web application that gives bank stakeholders a single view of the health of devices installed across bank branches. It tracks device issues, automatically raises service tickets when problems are not fixed in time, and escalates unresolved tickets to the responsible System Integrator (SI) through warning emails.

The organisation follows a fixed hierarchy: **Head Office (HO) → NBG → Zonal Office → Branch**, with a **System Integrator (SI)** assigned to each branch. Every level logs in with its own credentials and sees a dashboard limited to its own scope.

## 2. Problem Statement

Device faults and "system-off" conditions at branches often go unnoticed or unresolved because there is no shared, hierarchy-aware view of what is broken, who is responsible, and how long it has been broken. Without automatic ticketing and escalation, resolution depends on manual follow-up, and leadership has no reliable way to compare performance across NBGs, zones, and branches.

## 3. Goals and Non-Goals

### Goals
- Give every hierarchy level a dashboard scoped to exactly the branches it owns.
- Automatically create a service ticket when a device issue persists for 24 hours.
- Automatically escalate unresolved tickets at 24h, 48h, and 72h after ticket creation, emailing the assigned SI each time.
- Let Head Office assign an SI to each branch, and make that a prerequisite for ticketing.
- Let Head Office compare ticket data NBG-wise, Zone-wise, and Branch-wise.
- Let any user print or export the current dashboard view as PDF.

### Non-Goals (v1)
- No device firmware management, remote control, or remote reboot.
- No in-app chat, SLA contracts, billing, or spare-parts inventory.
- No native mobile apps.
- No integration with any third-party helpdesk or CRM.
- No complex custom report builder; reporting is limited to print/PDF of the current view.

## 4. Target Users

| Role | Scope | What they do |
|---|---|---|
| **Head Office (HO)** | Entire organisation | Monitors all tickets, assigns SIs to branches, views NBG/Zone/Branch insights |
| **NBG** | All zones and branches in their NBG | Monitors tickets and device health for their NBG |
| **Zonal Office** | All branches in their zone | Monitors tickets and device health for their zone |
| **Branch** | Their own branch | Sees their branch's devices and tickets |
| **System Integrator (SI)** | Branches they are assigned to | Receives escalation emails, works on and resolves tickets |

## 5. Core Features

### 5.1 Authentication and Role-Based Dashboards
Each user signs in with individual credentials. After login they land on the dashboard for their role. Data visibility is enforced in the database (Row Level Security), not just in the UI.

### 5.2 SI Assignment (Head Office only)
- A side-menu tab named **Assign SI** is visible only to HO users.
- HO selects a branch and assigns an SI user to it. Reassignment is allowed; history is kept.
- A branch without an assigned SI shows an "SI not assigned" indicator, and no tickets are generated for it until one is assigned.

### 5.3 Ticket Monitoring Widgets
Five widgets at the top of every dashboard, scoped to the user's hierarchy:
- **Open Tickets**: all currently unresolved tickets.
- **Today's Open Tickets**: unresolved tickets created today.
- **Today's Resolved Tickets**: tickets resolved today.
- **Resolved Tickets**: all closed tickets.
- **Escalated Tickets**: open tickets at escalation Level 1, 2, or 3.

Clicking a widget opens the filtered ticket list. Clicking **Open Tickets** shows all active tickets for the branch and its devices; clicking **Resolved Tickets** shows all closed tickets.

### 5.4 Automatic Ticket Generation
- Devices report a status: `ok`, `fault`, or `system_off`.
- If a device stays in `fault` or `system_off` continuously for 24 hours and it has no open ticket, the system creates a ticket automatically.
- A ticket is linked to the device, branch, and the SI assigned to that branch at creation time.
- Tickets are visible to all levels above and including the branch (HO, NBG, Zonal, Branch) within their scope, and to the assigned SI.

### 5.5 Escalation Process
Measured from ticket creation time:

| Elapsed | Escalation level | Email to SI |
|---|---|---|
| 24 hours | Level 1 | Warning to prioritise resolution |
| 48 hours | Level 2 | Second warning urging immediate action |
| 72 hours | Level 3 | Final warning requiring urgent resolution |

Each level triggers exactly once per ticket. Resolved tickets stop escalating.

### 5.6 Ticket Resolution
The assigned SI can open a ticket, add notes, and mark it **Resolved**. A full activity timeline (created, escalated, emailed, noted, resolved) is shown on the ticket detail page.

### 5.7 Head Office Insights
An HO-only insights page with three switchable views: **NBG-wise**, **Zone-wise**, **Branch-wise**. Each shows ticket counts (open, resolved, escalated) with drill-down from NBG to zone to branch.

### 5.8 Reports
Every dashboard and list view has **Print** and **Download PDF** actions that output the view exactly as currently shown (including active filters).

## 6. User Stories

- As an **HO user**, I want to assign an SI to a branch so that tickets for that branch have a responsible owner.
- As an **HO user**, I want to compare ticket volume across NBGs, zones, and branches so that I can spot weak areas.
- As an **NBG or Zonal user**, I want to see only my region's tickets so that I can focus on what I'm accountable for.
- As a **Branch user**, I want to see open tickets for my branch's devices so that I know what is being fixed.
- As an **SI**, I want to receive warning emails when tickets age so that I can prioritise them.
- As an **SI**, I want to mark a ticket resolved with a note so that the branch and HO see it closed.
- As **any user**, I want to print or save the current dashboard as PDF so that I can share it in meetings.

## 7. Functional Requirements

**Auth and access**
- FR-1: Users authenticate with email and password via Supabase Auth.
- FR-2: Each user has exactly one role and one scope (HO: none; NBG: an NBG; Zonal: a zone; Branch: a branch; SI: assigned branches).
- FR-3: All reads and writes are restricted by RLS policies matching the scope in FR-2.

**SI assignment**
- FR-4: Only HO users can create or change SI assignments, enforced by RLS.
- FR-5: A branch has at most one active SI at a time; previous assignments are retained as history.

**Tickets**
- FR-6: A scheduled job runs every 5 minutes and creates a ticket for any device that has been in `fault` or `system_off` for 24 hours or more, has no open ticket, and whose branch has an assigned SI.
- FR-7: Ticket numbers are human-readable and sequential (for example `SW-000123`).
- FR-8: The same scheduled run sets escalation level to 1, 2, or 3 when a ticket reaches 24, 48, or 72 hours old, and queues one email per level.
- FR-9: A queued-email worker sends pending emails and records success or failure per email.
- FR-10: Only the assigned SI (and HO) can resolve a ticket; resolution records who, when, and an optional note.
- FR-11: Widget counts and ticket lists respect the user's scope, and "today" is evaluated in Asia/Kolkata time.

**Devices**
- FR-12: Devices belong to a branch and carry type, serial number, current status, and time the current status began.
- FR-13: An authenticated HTTPS endpoint (Edge Function) accepts device status updates and records them in a status log.

**Reporting and UI**
- FR-14: Print uses a dedicated print stylesheet; Download PDF generates a file client-side from the rendered view.
- FR-15: The HO insights page aggregates tickets by NBG, zone, and branch with drill-down.

## 8. Non-Functional Requirements

- **Security**: RLS on every table; no service-role key in the frontend; Edge Functions validate caller identity; passwords handled only by Supabase Auth.
- **Performance**: dashboard loads in under 3 seconds for up to 1,000 branches and 20,000 devices; widget counts come from indexed aggregate queries or a database function, not client-side counting.
- **Reliability**: ticket creation and escalation are idempotent; a re-run of the job never creates duplicate tickets or duplicate emails.
- **Timeliness**: automated tickets and escalation emails fire within 10 minutes of their threshold.
- **Usability**: responsive layout from 360px up; accessible colour contrast and keyboard navigation (WCAG 2.1 AA target).
- **Auditability**: every ticket state change is stored in an events table.
- **Simplicity**: no containers, no separate backend server; everything runs on the hosted database and Edge Functions.

## 9. Data Model (summary)

| Table | Purpose |
|---|---|
| `profiles` | Extends auth user: name, role, `nbg_id` / `zone_id` / `branch_id` scope |
| `nbgs`, `zones`, `branches` | Hierarchy (`zones.nbg_id`, `branches.zone_id`) |
| `branch_si_assignments` | `branch_id`, `si_user_id`, `assigned_by`, `assigned_at`, `is_active` |
| `devices` | Branch device with `status`, `status_since`, `last_seen` |
| `device_status_log` | History of status changes |
| `tickets` | Ticket number, branch, device, SI, status, escalation level, timestamps, resolution info |
| `ticket_events` | Timeline of every ticket action |
| `email_outbox` | Queued escalation emails with send status |

## 10. Success Metrics

- 100% of device issues lasting 24h+ on SI-assigned branches have a ticket within 10 minutes of the threshold.
- 100% of escalation emails are sent within 10 minutes of their threshold (measured from `email_outbox`).
- Percentage of tickets resolved before Level 1 escalation increases over the first 3 months.
- Median ticket resolution time decreases month over month.
- Zero cross-scope data leaks (verified by RLS test cases per role).
- HO insights page used weekly by HO users.

## 11. Open Questions

1. **Ticket age vs. issue age**: tickets are created after 24h of an unresolved issue, and escalation is measured from ticket creation (so Level 1 occurs about 48h after the issue began). Is this intended, or should escalation be measured from the start of the issue?
2. **Device data source**: how do real devices report status today (existing monitoring platform, polling, push)? v1 assumes a push endpoint plus a simulator.
3. **Auto-close**: should a ticket close automatically when its device returns to `ok`, or must the SI always resolve it manually?
4. **User onboarding**: who creates NBG, Zonal, Branch, and SI accounts? v1 assumes HO creates them through an HO-only Users page.
5. **Branches with no SI**: should HO be warned about branches with long-running device issues but no assigned SI?
6. **Email sender**: which sending domain and provider will be used for escalation emails?
7. **Multiple SIs per branch**: is one active SI per branch always enough?

## 12. Future Considerations (Post-v1)

- SMS and WhatsApp escalation channels.
- Escalation notifications to Zonal, NBG, and HO as well as the SI.
- SLA targets and breach reporting.
- Scheduled report delivery by email.
- Photo and file attachments on tickets.
- Real-time live updates of widgets via Supabase Realtime.
- Native mobile app for SIs.
