import { serve } from "https://deno.land/std@0.178.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  // Validate caller identity
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization" }), { status: 401 });
  }
  const token = authHeader.replace(/^Bearer\s+/, "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
  }
  const callerId = user.id;

  let body: { serial: string; status: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }
  const { serial, status } = body;
  if (!serial || !["ok", "fault", "system_off"].includes(status)) {
    return new Response(
      JSON.stringify({ error: "serial and status (ok|fault|system_off) are required" }),
      { status: 400 },
    );
  }

  // Load device (service role bypasses RLS; we enforce scope via profile below)
  const { data: device, error: devErr } = await supabase
    .from("devices")
    .select("id, branch_id, status, status_since")
    .eq("serial_number", serial)
    .single();
  if (devErr || !device) {
    return new Response(JSON.stringify({ error: "Device not found" }), { status: 404 });
  }

  // Enforce scope: caller must be HO, or have scope over the device's branch
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, branch_id, nbg_id, zone_id")
    .eq("id", callerId)
    .single();
  if (!profile) {
    return new Response(JSON.stringify({ error: "Profile not found" }), { status: 403 });
  }

  let inScope = false;
  if (profile.role === "head_office") inScope = true;
  else if (profile.role === "branch" && profile.branch_id === device.branch_id) inScope = true;
  else if (profile.role === "zonal" || profile.role === "nbg") {
    const { data: branch } = await supabase
      .from("branches")
      .select("zone_id")
      .eq("id", device.branch_id)
      .single();
    const { data: zone } = branch ? await supabase
      .from("zones")
      .select("nbg_id")
      .eq("id", branch.zone_id)
      .single() : { data: null };
    if (profile.role === "zonal" && zone && branch.zone_id === profile.zone_id) inScope = true;
    if (profile.role === "nbg" && zone && zone.nbg_id === profile.nbg_id) inScope = true;
  }
  // SI scope handled via assignments; devices reporting is not SI-scoped here.
  if (!inScope && profile.role !== "si") {
    return new Response(JSON.stringify({ error: "Not in scope for this device" }), { status: 403 });
  }

  const statusChanged = device.status !== status;
  const now = new Date().toISOString();

  // Update device: reset status_since only when status actually changes
  const { error: updErr } = await supabase
    .from("devices")
    .update({
      status,
      status_since: statusChanged ? now : device.status_since,
      last_seen: now,
    })
    .eq("id", device.id);
  if (updErr) {
    return new Response(JSON.stringify({ error: updErr.message }), { status: 500 });
  }

  // Write to status log
  await supabase
    .from("device_status_log")
    .insert({ device_id: device.id, previous_status: device.status, new_status: status });

  return new Response(
    JSON.stringify({ ok: true, serial, status, statusChanged }),
    { headers: { "Content-Type": "application/json" } },
  );
});
