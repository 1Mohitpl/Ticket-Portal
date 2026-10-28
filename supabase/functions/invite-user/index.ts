import { serve } from "https://deno.land/std@0.178.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

interface InviteBody {
  email: string;
  role: "head_office" | "nbg" | "zonal" | "branch" | "si";
  scope_id?: string | null;
  scope_type?: "nbg" | "zone" | "branch" | null;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  // Validate caller identity and HO role
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization" }), { status: 401 });
  }
  const token = authHeader.replace(/^Bearer\s+/, "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!callerProfile || callerProfile.role !== "head_office") {
    return new Response(JSON.stringify({ error: "Head Office only" }), { status: 403 });
  }

  let body: InviteBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }
  const { email, role, scope_id, scope_type } = body;
  if (!email || !role) {
    return new Response(JSON.stringify({ error: "email and role are required" }), { status: 400 });
  }

  const nbg_id = scope_type === "nbg" ? scope_id : null;
  const zone_id = scope_type === "zone" ? scope_id : null;
  const branch_id = scope_type === "branch" ? scope_id : null;

  // Create the user via admin API
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: "SWatch123!",
    email_confirm: true,
    user_metadata: { role },
  });
  if (createErr || !created.user) {
    return new Response(
      JSON.stringify({ error: createErr?.message ?? "Failed to create user" }),
      { status: 400 },
    );
  }

  // Create the profile
  const { error: profileErr } = await supabase.from("profiles").insert({
    id: created.user.id,
    email,
    name: email.split("@")[0],
    role,
    nbg_id,
    zone_id,
    branch_id,
  });
  if (profileErr) {
    // Best-effort cleanup: remove the auth user if profile insert fails
    await supabase.auth.admin.deleteUser(created.user.id);
    return new Response(JSON.stringify({ error: profileErr.message }), { status: 400 });
  }

  return new Response(
    JSON.stringify({ ok: true, user: { id: created.user.id, email, role } }),
    { headers: { "Content-Type": "application/json" } },
  );
});
