# Build Prompt — S-Watch 360 Desk

You are building **S-Watch 360 Desk**, a web application that monitors devices installed across bank branches, automatically raises service tickets for unresolved issues, and escalates them to System Integrators (SI) by email.

Read `PRD.md` in full before writing any code. It is the source of truth for scope, roles, rules, and the data model. If anything is unclear, make the simplest reasonable choice, note it in `README.md`, and keep going.

## Constraints

- **Stack**: React 18 + TypeScript (Vite), Tailwind CSS, React Router, TanStack Query, `@supabase/supabase-js`.
- **Backend**: Supabase only (Postgres, Auth, Row Level Security, Edge Functions, `pg_cron`, `pg_net`). No custom server.
- **Do not use Docker** anywhere: no Dockerfile, no docker-compose, no local Supabase containers. Use a **hosted Supabase project** and apply SQL migrations by pasting them into the SQL editor or running `supabase db push` against the linked remote project. Deploy Edge Functions with `supabase functions deploy`.
- **Minimal dependencies**: add a library only when it clearly saves significant work. Allowed extras: `jspdf` + `html2canvas` (PDF export), `date-fns`, `lucide-react`.
- Everything in TypeScript with strict mode on. No `any` unless unavoidable.
- Secrets only in `.env` (frontend uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` only). The service-role key must never reach the frontend.

## Roles and hierarchy

Hierarchy: Head Office (HO) → NBG → Zonal Office → Branch. A System Integrator (SI) is assigned to branches. Roles: `head_office`, `nbg`, `zonal`, `branch`, `si`. Each user sees only data inside their scope. Enforce this with RLS, not just UI filtering.

## Build in this order

Complete each step, make sure the app still runs, then move to the next.

### Step 1: Project setup
- Scaffold the Vite React TS project, configure Tailwind, routing, and a Supabase client module.
- Create `.env.example`, a clean folder structure (`src/pages`, `src/components`, `src/lib`, `src/hooks`, `src/types`), and a `supabase/migrations` and `supabase/functions` folder.
- Write a `README.md` with setup steps that never mention Docker.

### Step 2: Database schema and security
Create SQL migrations for:
- Enums: `user_role`, `device_status` (`ok`, `fault`, `system_off`), `ticket_status` (`open`, `resolved`), `email_status` (`pending`, `sent`, `failed`).
- Tables: `profiles`, `nbgs`, `zones`, `branches`, `branch_si_assignments`, `devices`, `device_status_log`, `tickets`, `ticket_events`, `email_outbox`. Use the structure described in PRD section 9.
- A sequence-backed human-readable ticket number like `SW-000123`.
- Helper SQL functions (`security definer`, stable) such as `current_role()` and `branch_in_scope(branch_id)` used by RLS.
- RLS policies on every table:
  - HO: read everything; write `branch_si_assignments` and user management.
  - NBG / Zonal / Branch: read only branches, devices, and tickets within their scope.
  - SI: read tickets and devices for branches they are actively assigned to; update only those tickets (to resolve).
  - Nobody can delete tickets.
- Indexes on `tickets(branch_id, status)`, `tickets(created_at)`, `devices(branch_id, status)`.
- A seed file with a realistic sample: 2 NBGs, 4 zones, 12 branches, 40 devices, one user per role, a mix of device statuses, and a few tickets at different ages and escalation levels.

### Step 3: Automation (database functions and schedules)
- `generate_tickets()`: creates a ticket for every device in `fault` or `system_off` whose `status_since` is 24 hours or older, has no open ticket, and whose branch has an active SI. Link the current SI. Insert a `ticket_events` row. Must be idempotent.
- `escalate_tickets()`: for open tickets, set `escalation_level` to 1 at 24h, 2 at 48h, 3 at 72h after creation (never skipping or repeating a level), insert a `ticket_events` row, and insert one `email_outbox` row per level with the right subject and body (warning, second warning, final warning).
- Schedule both with `pg_cron` every 5 minutes.
- Edge Function `send-emails`: reads pending rows from `email_outbox`, sends them through an email provider API (read the API key from Edge Function secrets), and marks each row `sent` or `failed`. Schedule it every 5 minutes with `pg_cron` + `pg_net`.
- Edge Function `device-status`: authenticated HTTPS endpoint that accepts `{ serial, status }`, updates the device, resets `status_since` only when the status actually changes, and writes to `device_status_log`.
- Edge Function `invite-user`: HO-only; creates a user with a role and scope using the admin API and returns success. The service-role key stays inside the function.

### Step 4: Auth and app shell
- Email/password login page, session handling, protected routes, and logout.
- Load the user's profile and role after login; redirect to the dashboard.
- App shell with a responsive sidebar and top bar. Sidebar items by role:
  - All: Dashboard, Tickets, Devices
  - HO only: **Assign SI**, Insights, Users

### Step 5: Dashboard
- Five widgets: Open Tickets, Today's Open Tickets, Today's Resolved Tickets, Resolved Tickets, Escalated Tickets.
- Counts come from a single database function or view scoped by RLS. "Today" uses the Asia/Kolkata time zone.
- Each widget is clickable and routes to the Tickets page with the matching filter preset.
- Show a hierarchy-aware breakdown below the widgets: for HO, by NBG; for NBG, by zone; for Zonal, by branch; for Branch, by device.

### Step 6: Tickets
- Tickets list with filters (status, escalation level, branch, device, date range), search by ticket number, sorting, and pagination.
- Opening **Open Tickets** shows active tickets for the branch and its devices; **Resolved Tickets** shows closed ones.
- Ticket detail page: device, branch, assigned SI, age, escalation level badge, and the full activity timeline.
- SI and HO can add a note and mark the ticket **Resolved**. Record who and when. All others see read-only.

### Step 7: Assign SI (HO only)
- A page reachable from the side menu tab **Assign SI**.
- Table of all branches showing current SI or an "SI not assigned" badge.
- Assign or reassign an SI from a dropdown of SI users; deactivate the old assignment and keep history.
- Block access for non-HO users both in the route guard and through RLS.

### Step 8: Head Office insights
- Insights page with a segmented control: **NBG-wise**, **Zone-wise**, **Branch-wise**.
- Each view shows a table of open, resolved, and escalated counts, with drill-down from NBG to its zones to their branches.
- Simple bar chart using plain SVG or CSS (no heavy chart library).

### Step 9: Reports
- **Print** button using `window.print()` with a print stylesheet that hides navigation and shows the dashboard or list exactly as filtered.
- **Download PDF** button using `html2canvas` + `jspdf` on the main content area, with title, date, and the current user's role in the header.
- Both appear on the Dashboard, Tickets, and Insights pages.

### Step 10: Quality pass
- Loading, empty, and error states on every data view.
- Responsive from 360px to wide desktop; keyboard accessible; sufficient colour contrast.
- Write RLS test queries (SQL script) proving each role sees only its scope and that a non-HO user cannot write to `branch_si_assignments`.
- Update `README.md` with: Supabase project setup, running migrations, setting Edge Function secrets, deploying functions, running the app, deploying the frontend, and how to simulate a device fault using the `device-status` endpoint.

## Visual direction

Clean, professional, data-dense but calm. Light theme, generous spacing, one primary accent colour, and distinct semantic colours: green (resolved / ok), amber (Level 1), orange (Level 2), red (Level 3 / fault), grey (system off). Use consistent cards, rounded corners, and clear typography. Status and escalation must never rely on colour alone; always include a text label or icon.

## Definition of done

- All five roles can log in and see only their own scope.
- A device left in `fault` for 24h produces exactly one ticket; escalation reaches Levels 1 to 3 at 24h, 48h, and 72h with one email each.
- HO can assign SIs; branches without an SI do not generate tickets.
- Dashboard widgets, filters, insights, print, and PDF all work.
- The project runs with `npm install` and `npm run dev` against a hosted Supabase project, with no Docker involved.

Start with Step 1 and proceed in order. After each step, briefly summarise what was built and what is next.
