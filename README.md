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
   ```
6. Set Edge Function secrets (from Supabase dashboard → Edge Function → Settings):
   - `SENDGRID_API_KEY` (or your email provider key) for `send-emails`
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
