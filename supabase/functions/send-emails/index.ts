import { serve } from "https://deno.land/std@0.178.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const emailSendUrl = Deno.env.get("EMAIL_SEND_URL") || "";
const emailApiKey = Deno.env.get("EMAIL_API_KEY") || "";

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

interface EmailRow {
  id: string;
  ticket_id: string;
  to_email: string;
  subject: string;
  body: string;
}

async function sendOne(email: EmailRow): Promise<{ ok: boolean; error?: string }> {
  if (!emailSendUrl || !emailApiKey) {
    return { ok: false, error: "EMAIL_SEND_URL/EMAIL_API_KEY not configured" };
  }
  try {
    const res = await fetch(emailSendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${emailApiKey}`,
      },
      body: JSON.stringify({
        to: email.to_email,
        subject: email.subject,
        body: email.body,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

serve(async (req) => {
  // Validate caller identity via JWT (anon key from pg_cron, or a user token).
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization" }), { status: 401 });
  }
  const token = authHeader.replace(/^Bearer\s+/, "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
  }

  // Fetch pending emails using service role (bypasses RLS)
  const { data: emails, error: fetchError } = await supabase
    .from("email_outbox")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const email of emails ?? []) {
    const result = await sendOne(email as EmailRow);
    await supabase
      .from("email_outbox")
      .update({
        status: result.ok ? "sent" : "failed",
        error: result.error ?? null,
        sent_at: result.ok ? new Date().toISOString() : null,
      })
      .eq("id", email.id);
    results.push({ id: email.id, ...result });
  }

  return new Response(
    JSON.stringify({ processed: results.length, results }),
    { headers: { "Content-Type": "application/json" } },
  );
});
