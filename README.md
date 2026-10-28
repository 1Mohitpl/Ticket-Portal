# S-Watch 360 Desk

Device monitoring, automatic service ticketing, and SI escalation for bank branches.

## Stack

- React 18 + TypeScript (Vite), Tailwind CSS, React Router, TanStack Query, `@supabase/supabase-js`
- Backend: Supabase only (Postgres, Auth, Row Level Security, Edge Functions, `pg_cron`, `pg_net`)
- PDF export: `jspdf` + `html2canvas`

No Docker anywhere. Runs against a hosted Supabase project.

## Prerequisites

- Node.js 20+
- A hosted Supabase project

## Setup

1. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
2. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from your Supabase project settings (API section). The client also accepts `VITE_SUPABASE_ANON_KEY` for existing local setups.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Apply the database migrations to your hosted project:
   - Open the SQL editor in your Supabase dashboard, or
   - Run `npx supabase db push` against your linked remote project.
   Migrations live in `supabase/migrations/` and seed data in `supabase/migrations/0003_seed.sql`.
5. Deploy Edge Functions:
   ```bash
   npx supabase functions deploy device-status
   npx supabase functions deploy send-emails
   npx supabase functions deploy invite-user
   npx supabase functions deploy api --no-verify-jwt
   ```
6. Set Edge Function secrets (from Supabase dashboard → Edge Function → Settings):
   - `SENDGRID_API_KEY` (or your email provider key) for `send-emails`
   - `TICKETS_API_KEY` (a long random string) for machine ticket ingestion through `api`
7. Enable `pg_cron` and `pg_net` extensions in your Supabase project (SQL editor):
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   ```
8. Run the app:
   ```bash
   npm run dev
   ```
   Open http://localhost:5173

## Simulating a device fault

Use the authenticated `device-status` Edge Function:
```bash
curl -X POST https://<project>.supabase.co/functions/v1/device-status \
  -H "Authorization: Bearer <user-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"serial": "SN-0001", "status": "fault"}'
```
Leave a device in `fault` for 24 hours (backdate `status_since` via SQL for testing) and the `generate_tickets()` cron job (every 5 minutes) creates a ticket.

## Ticket API (Edge Function `api`)

The `api` function is the REST surface for the portal and external systems. Reads require a
Supabase JWT and are scoped by the existing RLS policies. Writes accept a Head Office JWT or an
`x-api-key` header.

Base URL: `https://<project-ref>.supabase.co/functions/v1/api`

Deploy it with the platform JWT check disabled, because the function verifies tokens itself
(`/auth/login` and `/health` must stay reachable without a token):

```bash
npx supabase functions deploy api --no-verify-jwt
npx supabase secrets set TICKETS_API_KEY=<long-random-secret>
```

### Authentication (JWT)

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | `{ email, password }` → access token, refresh token, profile |
| POST | `/auth/refresh` | `{ refresh_token }` → new access token |
| GET | `/auth/me` | Current profile (Bearer) |
| POST | `/auth/logout` | Revoke the session (Bearer) |

Send the access token on every data request: `Authorization: Bearer <access_token>`. Tokens are
normal Supabase Auth JWTs, so the same RLS policies that protect the app protect the API.

### Data endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/tickets` | List, filter, search and paginate tickets |
| GET | `/tickets/:id` | Ticket detail with activity timeline and email history |
| GET | `/tickets/stats` | Total, open, resolved, escalated and today's counts |
| GET | `/tickets/breakdown` | Scoped open/resolved/escalated counts per branch and device |
| GET | `/branches` | Branches visible to the caller (filter dropdown) |
| POST | `/tickets` | Receive a ticket (`x-api-key` or Head Office Bearer) |
| GET | `/health` | Database health check (public) |

`/tickets` query parameters: `status` (`open`/`resolved`, case-insensitive), `escalation_level`
(0–3), `escalated` (`true` for any level above 0), `branch_id`, `device_id`, `device_serial`
(partial serial match), `from` / `to` (ISO dates on `created_at`), `resolved_from` / `resolved_to`
(ISO dates on `resolved_at`), `search` (ticket number, branch name or code, device serial), `page`
(default 1), `limit` (default 20, max 100), `sort` (`created_at`, `updated_at`, `ticket_number`,
`escalation_level`, `status`) and `order` (`asc`/`desc`). List responses return
`{ data, page, limit, total, totalPages }`.

```bash
# 1. Get a JWT
curl -X POST https://<project>.supabase.co/functions/v1/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ho@swatch.example","password":"SWatch123!"}'

# 2. Read scoped tickets
curl "https://<project>.supabase.co/functions/v1/api/tickets?status=open&page=1&limit=20" \
  -H "Authorization: Bearer <access_token>"

# 3. Push a ticket from an external system
curl -X POST https://<project>.supabase.co/functions/v1/api/tickets \
  -H "x-api-key: <TICKETS_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"branch_id":"33333333-3333-3333-3333-333333333301","device_id":"d0000001-0000-0000-0000-000000000002","note":"ATM offline reported by monitoring"}'
```

`POST /tickets` requires `branch_id`; `device_id` must belong to that branch; `si_user_id` defaults
to the branch's active SI. Ticket numbers come from the existing sequence.

The React app uses this API for login/session, the dashboard, the ticket list and ticket detail.
Ticket notes and resolution still go through the existing Supabase RPCs. Apply migration
`0005_ticket_breakdown.sql` with the other migrations; the dashboard breakdown depends on it.

Unit tests for the API helpers:

```bash
cd supabase/functions/api
deno test
```

## Demo accounts

Seeded in `supabase/migrations/0003_seed.sql`: one user per role (`head_office`, `nbg`, `zonal`, `branch`, `si`). These shared credentials are for local/demo use only; replace them before production.

| Role | Email |
| --- | --- |
| Head Office | `ho@swatch.example` |
| NBG | `nbg@swatch.example` |
| Zonal | `zonal@swatch.example` |
| Branch | `branch@swatch.example` |
| SI | `si@swatch.example` |

Password for each demo account: `SWatch123!`.

## Create a ticket through the API

The Supabase REST RPC endpoint accepts a JSON body. The caller must have a valid Supabase Auth access token and permission to the branch (Head Office users can access all branches).

```bash
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/create_ticket_api" \
  -H "apikey: ${VITE_SUPABASE_PUBLISHABLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"p_branch_code":"BA","p_note":"ATM is not dispensing cash","p_device_serial":"SN-ATM-001"}'
```

`p_branch_code` is required. `p_note` and `p_device_serial` are optional; a supplied device serial must belong to the branch. The response includes the created ticket ID and ticket number. Obtain the access token by signing in through Supabase Auth; never use a service-role key in a client.

## Build & deploy

```bash
npm run build
```
Deploy the `dist/` folder to any static host (Vercel, Netlify). No Docker involved.

## Project structure

- `src/pages` — route pages
- `src/components` — shared components (layout, route guards)
- `src/lib` — Supabase client
- `src/hooks` — `useAuth`
- `src/types` — TypeScript types
- `supabase/migrations` — SQL schema, RLS, seed
- `supabase/functions` — Edge Functions
