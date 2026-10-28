import { serve } from "https://deno.land/std@0.178.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import {
  bearerToken,
  isUuid,
  likeTerm,
  parsePagination,
  parseStatus,
  routePath,
  searchParts,
} from "./lib.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const ingestApiKey = Deno.env.get("TICKETS_API_KEY") ?? "";

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});
// Fresh client per auth call: a shared GoTrue client would keep the last
// session in memory across concurrent requests.
function newAuthClient() {
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const TICKET_SELECT = `
  id, ticket_number, branch_id, device_id, si_user_id, status, escalation_level,
  created_at, updated_at, resolved_at, resolved_by, resolution_note,
  branches ( id, name, code, zones ( id, name, nbgs ( id, name ) ) ),
  devices ( id, serial_number, type ),
  si_user:profiles!tickets_si_user_id_fkey ( id, name, email )
`;

const TICKET_DETAIL_SELECT = `
  id, ticket_number, branch_id, device_id, si_user_id, status, escalation_level,
  created_at, updated_at, resolved_at, resolved_by, resolution_note,
  branches ( id, name, code, zones ( id, name, nbgs ( id, name ) ) ),
  devices ( id, serial_number, type, status, status_since ),
  si_user:profiles!tickets_si_user_id_fkey ( id, name, email ),
  resolver:profiles!tickets_resolved_by_fkey ( name, email ),
  ticket_events (
    id, ticket_id, event_type, actor_id, actor_role, note, created_at,
    actor:profiles!ticket_events_actor_id_fkey ( name, email )
  ),
  email_outbox ( id, subject, status, sent_at, created_at, error )
`;

const SORTABLE = new Set([
  "created_at",
  "updated_at",
  "ticket_number",
  "escalation_level",
  "status",
]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function methodNotAllowed(allow: string): Response {
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...CORS, Allow: allow, "Content-Type": "application/json" },
  });
}

async function readJsonObject(
  req: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function loadProfile(id: string) {
  const { data } = await admin
    .from("profiles")
    .select("id, email, name, role, nbg_id, zone_id, branch_id, created_at")
    .eq("id", id)
    .maybeSingle();
  return data;
}

// Validates the Supabase JWT and returns a client scoped to that user, so RLS
// applies to every read. Returns null for a missing, expired or invalid token.
async function userDb(req: Request) {
  const token = bearerToken(req.headers.get("Authorization"));
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

// ============================================================
// Authentication
// ============================================================

async function login(req: Request): Promise<Response> {
  const body = await readJsonObject(req);
  if (!body) return json({ error: "Body must be a JSON object" }, 400);

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return json({ error: "email and password are required" }, 400);
  }

  const { data, error } = await newAuthClient().auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    return json({ error: "Invalid email or password" }, 401);
  }

  const profile = await loadProfile(data.user.id);
  if (!profile) {
    return json({ error: "Profile not found" }, 403);
  }

  return json({
    access_token: data.session.access_token,
    token_type: "Bearer",
    expires_in: data.session.expires_in,
    refresh_token: data.session.refresh_token,
    user: profile,
  });
}

async function refresh(req: Request): Promise<Response> {
  const body = await readJsonObject(req);
  if (!body) return json({ error: "Body must be a JSON object" }, 400);

  const refreshToken = typeof body.refresh_token === "string"
    ? body.refresh_token
    : "";
  if (!refreshToken) {
    return json({ error: "refresh_token is required" }, 400);
  }

  const { data, error } = await newAuthClient().auth.refreshSession({
    refresh_token: refreshToken,
  });
  if (error || !data.session) {
    return json({ error: "Invalid or expired refresh token" }, 401);
  }

  return json({
    access_token: data.session.access_token,
    token_type: "Bearer",
    expires_in: data.session.expires_in,
    refresh_token: data.session.refresh_token,
  });
}

async function me(req: Request): Promise<Response> {
  const token = bearerToken(req.headers.get("Authorization"));
  if (!token) return json({ error: "Missing Bearer token" }, 401);

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return json({ error: "Invalid or expired token" }, 401);
  }

  const profile = await loadProfile(data.user.id);
  if (!profile) return json({ error: "Profile not found" }, 403);

  return json({ user: profile });
}

async function logout(req: Request): Promise<Response> {
  const token = bearerToken(req.headers.get("Authorization"));
  if (!token) return json({ error: "Missing Bearer token" }, 401);

  // "local" revokes only this session, not every device the user is signed in on.
  const { error } = await admin.auth.admin.signOut(token, "local");
  if (error) return json({ error: error.message }, 400);

  return json({ ok: true });
}

// ============================================================
// Tickets
// ============================================================

async function listTickets(req: Request, url: URL): Promise<Response> {
  const db = await userDb(req);
  if (!db) return json({ error: "Missing or invalid Bearer token" }, 401);

  const params = url.searchParams;
  const { page, limit, from, to } = parsePagination(
    params.get("page"),
    params.get("limit"),
  );

  const status = parseStatus(params.get("status"));
  if (status === null) {
    return json({ error: "status must be open or resolved" }, 400);
  }

  const branchId = params.get("branch_id");
  if (branchId && !isUuid(branchId)) {
    return json({ error: "branch_id must be a UUID" }, 400);
  }

  const deviceId = params.get("device_id");
  if (deviceId && !isUuid(deviceId)) {
    return json({ error: "device_id must be a UUID" }, 400);
  }

  const deviceSerial = params.get("device_serial")?.trim();

  const escalation = params.get("escalation_level");
  if (escalation !== null && escalation !== "") {
    const level = Number(escalation);
    if (!Number.isInteger(level) || level < 0 || level > 3) {
      return json(
        { error: "escalation_level must be an integer from 0 to 3" },
        400,
      );
    }
  }

  let query = db.from("tickets").select(TICKET_SELECT, { count: "exact" });

  if (status) query = query.eq("status", status);
  if (branchId) query = query.eq("branch_id", branchId);
  if (deviceId) query = query.eq("device_id", deviceId);
  if (escalation !== null && escalation !== "") {
    query = query.eq("escalation_level", Number(escalation));
  }
  if (params.get("escalated") === "true") {
    query = query.gt("escalation_level", 0);
  }

  const dateFilters = [
    ["from", "created_at", "gte"],
    ["to", "created_at", "lte"],
    ["resolved_from", "resolved_at", "gte"],
    ["resolved_to", "resolved_at", "lte"],
  ] as const;

  for (const [name, column, op] of dateFilters) {
    const raw = params.get(name);
    if (!raw) continue;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      return json({ error: `${name} must be an ISO date` }, 400);
    }
    query = op === "gte"
      ? query.gte(column, date.toISOString())
      : query.lte(column, date.toISOString());
  }

  if (deviceSerial) {
    // shortcut: at most 100 matching serials per filter; use a DB search if needed.
    const { data: matchedDevices, error: deviceError } = await db
      .from("devices")
      .select("id")
      .ilike("serial_number", likeTerm(deviceSerial))
      .limit(100);
    if (deviceError) return json({ error: deviceError.message }, 500);

    const ids = (matchedDevices ?? []).map((row) => row.id);
    if (ids.length === 0) {
      return json({ data: [], page, limit, total: 0, totalPages: 0 });
    }
    query = query.in("device_id", ids);
  }

  const term = params.get("search")?.trim();
  if (term) {
    // shortcut: resolves at most 50 matching branches/devices per search; use a
    // database search function if larger result sets are needed.
    const like = likeTerm(term);
    const [{ data: branches }, { data: devices }] = await Promise.all([
      db.from("branches").select("id").or(
        `name.ilike.${like},code.ilike.${like}`,
      ).limit(50),
      db.from("devices").select("id").ilike("serial_number", like).limit(50),
    ]);
    query = query.or(
      searchParts(
        term,
        (branches ?? []).map((row) => row.id),
        (devices ?? []).map((row) => row.id),
      ),
    );
  }

  const sortParam = params.get("sort") ?? "created_at";
  query = query
    .order(SORTABLE.has(sortParam) ? sortParam : "created_at", {
      ascending: params.get("order") === "asc",
    })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) return json({ error: error.message }, 500);

  const total = count ?? 0;
  return json({
    data: data ?? [],
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

async function getTicket(req: Request, id: string): Promise<Response> {
  if (!isUuid(id)) return json({ error: "Invalid ticket id" }, 400);

  const db = await userDb(req);
  if (!db) return json({ error: "Missing or invalid Bearer token" }, 401);

  const { data, error } = await db
    .from("tickets")
    .select(TICKET_DETAIL_SELECT)
    .eq("id", id)
    .order("created_at", { referencedTable: "ticket_events", ascending: true })
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: "Ticket not found" }, 404);

  return json({ data });
}

async function ticketStats(req: Request): Promise<Response> {
  const db = await userDb(req);
  if (!db) return json({ error: "Missing or invalid Bearer token" }, 401);

  const { data, error } = await db.rpc("dashboard_counts");
  if (error) return json({ error: error.message }, 500);

  const counts: Record<string, number> = {};
  for (
    const row of (data ?? []) as Array<
      { widget: string; value: number | string }
    >
  ) {
    counts[row.widget] = Number(row.value);
  }

  const open = counts.open ?? 0;
  const resolved = counts.resolved ?? 0;
  return json({
    total: open + resolved,
    open,
    resolved,
    escalated: counts.escalated ?? 0,
    today_open: counts.today_open ?? 0,
    today_resolved: counts.today_resolved ?? 0,
  });
}

async function listBranches(req: Request): Promise<Response> {
  const db = await userDb(req);
  if (!db) return json({ error: "Missing or invalid Bearer token" }, 401);

  const { data, error } = await db
    .from("branches")
    .select("id, name, code")
    .order("name");
  if (error) return json({ error: error.message }, 500);

  return json({ data: data ?? [] });
}

interface BreakdownRow {
  branch_id: string;
  branch_name: string;
  zone_name: string;
  nbg_name: string;
  device_id: string | null;
  device_serial: string | null;
  open_count: number | string;
  resolved_count: number | string;
  escalated_count: number | string;
}

async function ticketBreakdown(req: Request): Promise<Response> {
  const db = await userDb(req);
  if (!db) return json({ error: "Missing or invalid Bearer token" }, 401);

  const { data, error } = await db.rpc("ticket_breakdown");
  if (error) return json({ error: error.message }, 500);

  return json({
    data: ((data ?? []) as BreakdownRow[]).map((row) => ({
      branch_id: row.branch_id,
      branch_name: row.branch_name,
      zone_name: row.zone_name,
      nbg_name: row.nbg_name,
      device_id: row.device_id,
      device_serial: row.device_serial,
      open: Number(row.open_count),
      resolved: Number(row.resolved_count),
      escalated: Number(row.escalated_count),
    })),
  });
}

// Machine ingest uses TICKETS_API_KEY; a Head Office JWT is also accepted.
async function authorizeIngest(req: Request): Promise<Response | null> {
  if (ingestApiKey && req.headers.get("x-api-key") === ingestApiKey) {
    return null;
  }

  const token = bearerToken(req.headers.get("Authorization"));
  if (!token) {
    return json({ error: "Provide x-api-key or a Bearer token" }, 401);
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return json({ error: "Invalid or expired token" }, 401);
  }

  const profile = await loadProfile(data.user.id);
  if (profile?.role !== "head_office") {
    return json({ error: "Head Office token or API key required" }, 403);
  }

  return null;
}

async function createTicket(req: Request): Promise<Response> {
  const denied = await authorizeIngest(req);
  if (denied) return denied;

  const body = await readJsonObject(req);
  if (!body) return json({ error: "Body must be a JSON object" }, 400);

  const branchId = body.branch_id;
  if (typeof branchId !== "string" || !isUuid(branchId)) {
    return json({ error: "branch_id is required and must be a UUID" }, 400);
  }

  const deviceId = body.device_id;
  if (deviceId != null && (typeof deviceId !== "string" || !isUuid(deviceId))) {
    return json({ error: "device_id must be a UUID" }, 400);
  }

  const siInput = body.si_user_id;
  if (siInput != null && (typeof siInput !== "string" || !isUuid(siInput))) {
    return json({ error: "si_user_id must be a UUID" }, 400);
  }

  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > 2000) {
    return json({ error: "note cannot exceed 2000 characters" }, 400);
  }

  const { data: branch, error: branchError } = await admin
    .from("branches")
    .select("id")
    .eq("id", branchId)
    .maybeSingle();
  if (branchError) return json({ error: branchError.message }, 500);
  if (!branch) return json({ error: "Branch not found" }, 404);

  if (deviceId) {
    const { data: device, error } = await admin
      .from("devices")
      .select("id, branch_id")
      .eq("id", deviceId)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!device) return json({ error: "Device not found" }, 404);
    if (device.branch_id !== branchId) {
      return json({ error: "Device does not belong to the given branch" }, 400);
    }
  }

  let siUserId = typeof siInput === "string" ? siInput : null;
  if (siUserId) {
    const { data: si } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", siUserId)
      .maybeSingle();
    if (!si || si.role !== "si") {
      return json({ error: "si_user_id must reference an SI user" }, 400);
    }
  } else {
    const { data: assignment } = await admin
      .from("branch_si_assignments")
      .select("si_user_id")
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .maybeSingle();
    siUserId = assignment?.si_user_id ?? null;
  }

  const { data: ticket, error: insertError } = await admin
    .from("tickets")
    .insert({
      branch_id: branchId,
      device_id: (deviceId as string | undefined) ?? null,
      si_user_id: siUserId,
      status: "open",
    })
    .select()
    .single();
  if (insertError) return json({ error: insertError.message }, 500);

  const { error: eventError } = await admin.from("ticket_events").insert({
    ticket_id: ticket.id,
    event_type: "created",
    note: note || "Received via API",
  });
  // The ticket already exists; do not return an error that invites a duplicate retry.
  if (eventError) {
    console.error("ticket_events insert failed:", eventError.message);
  }

  return json({ data: ticket }, 201);
}

// ============================================================
// Health
// ============================================================

async function health(): Promise<Response> {
  const started = performance.now();
  const { error } = await admin.from("tickets").select("id").limit(1);

  return json(
    {
      status: error ? "degraded" : "ok",
      database: error ? "unreachable" : "ok",
      latencyMs: Math.round(performance.now() - started),
      time: new Date().toISOString(),
    },
    error ? 503 : 200,
  );
}

// ============================================================
// Router
// ============================================================

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);
  const path = routePath(url.pathname);

  if (path === "/health") {
    return req.method === "GET" ? health() : methodNotAllowed("GET");
  }

  if (path === "/auth/login") {
    return req.method === "POST" ? login(req) : methodNotAllowed("POST");
  }

  if (path === "/auth/refresh") {
    return req.method === "POST" ? refresh(req) : methodNotAllowed("POST");
  }

  if (path === "/auth/me") {
    return req.method === "GET" ? me(req) : methodNotAllowed("GET");
  }

  if (path === "/auth/logout") {
    return req.method === "POST" ? logout(req) : methodNotAllowed("POST");
  }

  if (path === "/tickets/stats") {
    return req.method === "GET" ? ticketStats(req) : methodNotAllowed("GET");
  }

  if (path === "/tickets/breakdown") {
    return req.method === "GET"
      ? ticketBreakdown(req)
      : methodNotAllowed("GET");
  }

  if (path === "/branches") {
    return req.method === "GET" ? listBranches(req) : methodNotAllowed("GET");
  }

  if (path === "/tickets") {
    if (req.method === "GET") return listTickets(req, url);
    if (req.method === "POST") return createTicket(req);
    return methodNotAllowed("GET, POST");
  }

  const detail = path.match(/^\/tickets\/([^/]+)$/);
  if (detail) {
    return req.method === "GET"
      ? getTicket(req, detail[1])
      : methodNotAllowed("GET");
  }

  return json({ error: "Not found" }, 404);
}

serve(async (req) => {
  try {
    return await handle(req);
  } catch (err) {
    console.error(err);
    return json({ error: "Internal server error" }, 500);
  }
});
