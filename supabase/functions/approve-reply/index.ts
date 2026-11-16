import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Fallback only. The live URL comes from public.service_config -- see
// resolveWebhookUrl() and migration 20260909140000 for why. This env secret is
// whatever `supabase secrets set` last managed to write, which on a machine
// without a CLI token can be months stale.
const N8N_WEBHOOK_URL_FALLBACK = Deno.env.get("N8N_WEBHOOK_URL") ?? "";
const N8N_WEBHOOK_SECRET = Deno.env.get("N8N_WEBHOOK_SECRET")!;

/**
 * The Cloudflare quick tunnel that exposes local n8n rotates several times a
 * day, and each rotation mints a brand-new hostname. Storing that in
 * `supabase secrets` means it can only be refreshed with a Supabase CLI access
 * token -- and when that token is missing, tunnel-sync.ps1 logs
 * "supabase secrets set -> Unauthorized" and carries on, leaving this function
 * calling a hostname that no longer resolves. Every approval then fails with a
 * 502 and nothing surfaces it.
 *
 * So the current URL lives in the database, which tunnel-sync.ps1 can write
 * with the service-role key it already has. Read it per request (this is a
 * single indexed primary-key lookup, and correctness matters more here than
 * shaving a few milliseconds off an action a human just clicked).
 *
 * Falls back to the env secret if the row is missing, so a fresh deploy works
 * before the first tunnel rotation writes the row.
 */
async function resolveWebhookUrl(
  admin: ReturnType<typeof createClient>,
): Promise<{ url: string; source: "database" | "env" }> {
  const { data, error } = await admin
    .from("service_config")
    .select("value")
    .eq("key", "n8n_webhook_url")
    .maybeSingle();

  if (error || !data?.value) {
    return { url: N8N_WEBHOOK_URL_FALLBACK, source: "env" };
  }
  return { url: data.value, source: "database" };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user?.email) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { email_log_id?: number; final_response?: string; refinement_prompts?: string[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  const { email_log_id, final_response, refinement_prompts } = body;
  if (!email_log_id || typeof final_response !== "string") {
    return json({ error: "email_log_id and final_response are required" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: row, error: rowErr } = await admin
    .from("email_logs")
    .select("id, client_email, status, message_id")
    .eq("id", email_log_id)
    .single();

  if (rowErr || !row) {
    return json({ error: "not found" }, 404);
  }
  if (row.client_email !== user.email) {
    return json({ error: "forbidden" }, 403);
  }
  if (row.status !== "pending_review") {
    return json({ error: "already actioned" }, 409);
  }

  const { error: updateErr } = await admin
    .from("email_logs")
    .update({ final_response })
    .eq("id", email_log_id);
  if (updateErr) {
    return json({ error: updateErr.message }, 500);
  }

  const { url: webhookUrl, source: webhookSource } = await resolveWebhookUrl(admin);
  if (!webhookUrl) {
    return json({
      error: "no n8n webhook URL configured",
      detail:
        "service_config.n8n_webhook_url is empty and N8N_WEBHOOK_URL is unset. Start scripts/tunnel-sync.ps1, which writes the current URL on every rotation.",
    }, 500);
  }

  let n8nResp: Response;
  try {
    n8nResp = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": N8N_WEBHOOK_SECRET,
      },
      body: JSON.stringify({ row_id: email_log_id, refinement_prompts: refinement_prompts ?? [] }),
    });
  } catch (err) {
    // n8n unreachable (tunnel down / DNS / timeout). Return a readable, CORS'd
    // error instead of letting the throw bubble up — an unhandled throw yields a
    // response with no CORS headers, which the browser reports as the opaque
    // "Failed to send a request to the Edge Function".
    //
    // Name the URL and where it came from. The failure this replaces was a
    // stale env secret pointing at a dead tunnel, and the old message ("is the
    // local tunnel up?") sent you to check a tunnel that was in fact perfectly
    // healthy — just not the one being called.
    return json({
      error: "could not reach n8n",
      detail: `tried ${webhookUrl} (from ${webhookSource}): ${String(err).slice(0, 160)}`,
      hint: webhookSource === "env"
        ? "This URL came from the stale N8N_WEBHOOK_URL secret because service_config had no row. Run scripts/tunnel-sync.ps1 to publish the live URL."
        : "The tunnel this URL points at is not answering. Check scripts/logs/tunnel-sync.log.",
    }, 502);
  }

  if (!n8nResp.ok) {
    return json({ error: "n8n webhook failed", status: n8nResp.status }, 502);
  }

  return json({ ok: true });
});
