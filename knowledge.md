# Project knowledge

## What this project is
S-Watch 360 Desk is a React-based device-monitoring and service-ticketing dashboard for bank branches, including SI escalation. It uses a hosted Supabase project for data, authentication, access control, and backend automation; it is not a locally containerized app.

## Where code lives
- `src/App.tsx`, `src/main.tsx` — application routing and bootstrap; TanStack Query is provided at the root.
- `src/pages/` — feature pages: dashboard, devices, tickets, insights, users, SI assignment, and auth.
- `src/components/` — shared UI and layout, including protected route handling.
- `src/hooks/useAuth.ts` — authentication hook.
- `src/lib/supabase.ts` — Supabase client, configured from Vite environment variables.
- `src/types/` — shared TypeScript types.
- `src/index.css` — global styles and Tailwind CSS entry.
- `supabase/migrations/` — database schema, policies, cron setup, and seed data.
- `supabase/functions/` — `device-status`, `send-emails`, and `invite-user` Edge Functions.

## Setup and commands
Prerequisites: Node.js 20+ and a hosted Supabase project.

```bash
cp .env.example .env   # Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev            # Vite development server, normally http://localhost:5173
npm run lint           # oxlint
npm run build          # TypeScript project build, then Vite production build to dist/
npm run preview        # Preview the production build
```
There is no test script configured in `package.json`. Apply `supabase/migrations/` to the hosted database (Supabase SQL editor or linked `npx supabase db push`) and deploy the three functions with `npx supabase functions deploy <function-name>`. Configure `SENDGRID_API_KEY` (or the selected email provider key) as an Edge Function secret. `pg_cron` and `pg_net` are used by the scheduled ticket-generation flow and must be enabled in Supabase.

## Conventions and gotchas
- Follow the existing TypeScript/React patterns and formatting (no semicolons in current TSX examples); use the project's Vite/Tailwind setup.
- Use the existing Supabase client and TanStack Query integration rather than introducing another data layer. The client supports `VITE_SUPABASE_PUBLISHABLE_KEY` and the legacy `VITE_SUPABASE_ANON_KEY`; without credentials, the UI shows a setup screen.
- Authorization and data access depend on Supabase Auth and database Row Level Security; preserve role checks and policies when changing routes or queries.
- Backend workflows live in SQL migrations and Supabase Edge Functions, not in a separate application server. Device faults can generate tickets after remaining in fault state for 24 hours; the cron job checks every five minutes.
- PDF export uses the existing `jspdf` and `html2canvas` dependencies. Do not add dependencies without a need; no automated test command is currently provided.
- Deploy the built `dist/` directory to a static host. Database migrations, function deployment, and required secrets are separate hosted-Supabase setup steps.
