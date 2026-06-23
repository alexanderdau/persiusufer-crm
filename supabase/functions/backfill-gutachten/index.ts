import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Einmal-Backfill bereits ausgeführt (z8k29-25 am 2026-06-22). Function deaktiviert.
// Kann im Supabase-Dashboard unter Edge Functions vollständig gelöscht werden.
Deno.serve((_req: Request) => {
  return new Response(JSON.stringify({ status: "disabled", note: "One-shot backfill already executed; safe to delete." }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  });
});
