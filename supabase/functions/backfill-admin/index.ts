import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CRON_SQL_6WORKERS = `
SELECT net.http_get(url := 'https://ujiiaqvwpnniaasdhyrb.supabase.co/functions/v1/backfill-portal-dokumente?token=backfill-portal-7f3k9q2v&batch=15&w=a', timeout_milliseconds := 90000);
SELECT net.http_get(url := 'https://ujiiaqvwpnniaasdhyrb.supabase.co/functions/v1/backfill-portal-dokumente?token=backfill-portal-7f3k9q2v&batch=15&w=b', timeout_milliseconds := 90000);
SELECT net.http_get(url := 'https://ujiiaqvwpnniaasdhyrb.supabase.co/functions/v1/backfill-portal-dokumente?token=backfill-portal-7f3k9q2v&batch=15&w=c', timeout_milliseconds := 90000);
SELECT net.http_get(url := 'https://ujiiaqvwpnniaasdhyrb.supabase.co/functions/v1/backfill-portal-dokumente?token=backfill-portal-7f3k9q2v&batch=15&w=d', timeout_milliseconds := 90000);
SELECT net.http_get(url := 'https://ujiiaqvwpnniaasdhyrb.supabase.co/functions/v1/backfill-portal-dokumente?token=backfill-portal-7f3k9q2v&batch=15&w=e', timeout_milliseconds := 90000);
SELECT net.http_get(url := 'https://ujiiaqvwpnniaasdhyrb.supabase.co/functions/v1/backfill-portal-dokumente?token=backfill-portal-7f3k9q2v&batch=15&w=f', timeout_milliseconds := 90000);
`;

Deno.serve(async (req: Request) => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, authorization, apikey" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: CORS });

  let body: { action?: string };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad_json" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }); }
  const action = body.action;
  if (!action) return new Response(JSON.stringify({ error: "missing_action" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (action === "status") {
    // Backfill-Status
    const { data: status } = await sb.rpc("backfill_status");
    const { data: cronJobs } = await sb.from("cron.job" as any).select("jobname, schedule, active").like("jobname", "backfill-portal%").catch(() => ({ data: null })) as any;
    return new Response(JSON.stringify({ status: status?.[0] ?? null, cron_active: !!(cronJobs && cronJobs.length > 0 && cronJobs.some((j: any) => j.active)) }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }

  if (action === "start_backfill") {
    // Reset no_docs flag (damit alle nochmal probiert werden) - optional je nach reset_flag
    const resetNoDocs = (body as any).reset_no_docs === true;
    if (resetNoDocs) {
      await sb.rpc("backfill_reset_no_docs");
    }
    // Cron einrichten — über RPC, weil Edge Function keine cron.schedule direkt darf
    const { data, error } = await sb.rpc("backfill_admin_start");
    if (error) return new Response(JSON.stringify({ error: "start_failed", details: error.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ ok: true, action: "started", reset_no_docs: resetNoDocs, message: "Backfill läuft jetzt: 6 Worker × jede Minute" }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }

  if (action === "stop_backfill") {
    const { error } = await sb.rpc("backfill_admin_stop");
    if (error) return new Response(JSON.stringify({ error: "stop_failed", details: error.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ ok: true, action: "stopped" }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }

  if (action === "reset_no_docs") {
    const { data, error } = await sb.rpc("backfill_reset_no_docs");
    if (error) return new Response(JSON.stringify({ error: "reset_failed", details: error.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ ok: true, action: "reset_no_docs", reset_count: data }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }

  if (action === "run_once") {
    // Einmal-Run, ohne Cron einzurichten
    const calls: any[] = [];
    for (const w of ["a", "b", "c", "d", "e", "f"]) {
      try {
        const r = await fetch(`https://ujiiaqvwpnniaasdhyrb.supabase.co/functions/v1/backfill-portal-dokumente?token=backfill-portal-7f3k9q2v&batch=15&w=${w}`, { headers: { "Authorization": req.headers.get("authorization") ?? "" } });
        calls.push({ worker: w, status: r.status });
      } catch (e) { calls.push({ worker: w, error: String(e) }); }
    }
    return new Response(JSON.stringify({ ok: true, action: "run_once", calls }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ error: "unknown_action", action }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
});
