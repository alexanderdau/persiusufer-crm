import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  let body: { zid?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const { zid, email } = body;
  if (!zid || !email) {
    return new Response(JSON.stringify({ error: "Missing zid or email" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  // Basic email syntax check
  if (!/^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(email)) {
    return new Response(JSON.stringify({ error: "Invalid email format" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  // zid must be numeric
  if (!/^\d+$/.test(zid)) {
    return new Response(JSON.stringify({ error: "Invalid zid format" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // POST an zvg.com
  const zvgUrl = `https://www.zvg.com/objekt/${zid}/show/notify`;
  const formData = new URLSearchParams();
  formData.set("email", email);

  let zvgResp: Response;
  try {
    zvgResp = await fetch(zvgUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "persiusufer-crm/1.0",
      },
      body: formData.toString(),
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: `zvg.com fetch failed: ${e}` }),
      { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // zvg.com gibt 200 mit SPA-Shell zurück, ob erfolgreich oder nicht.
  // Wir nehmen Status 200-299 als Erfolg.
  const ok = zvgResp.status >= 200 && zvgResp.status < 300;

  // Bei Erfolg: notify_subscribed_at + notify_email in DB merken
  if (ok) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: dbError } = await supabase
      .from("zvg_akte")
      .update({
        notify_subscribed_at: new Date().toISOString(),
        notify_email: email,
      })
      .eq("zid", zid);
    if (dbError) {
      console.error("DB update error:", dbError);
      // zvg.com hat OK gegeben — wir behalten den Erfolg, loggen den DB-Fehler
    }
  }

  return new Response(
    JSON.stringify({
      success: ok,
      zvg_status: zvgResp.status,
      message: ok
        ? `Benachrichtigung für ${email} bei zvg.com angefordert. Du musst sie noch per Klick in der zvg.com-Bestätigungsmail aktivieren.`
        : `zvg.com hat HTTP ${zvgResp.status} zurückgegeben.`,
    }),
    {
      status: ok ? 200 : 502,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    }
  );
});
