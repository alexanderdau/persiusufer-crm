import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Feasibility-Test (Portal-Erreichbarkeit) — erledigt 2026-06-22. Deaktiviert; im Dashboard löschbar.
Deno.serve(() => new Response(JSON.stringify({status:"disabled"}),{status:410,headers:{"Content-Type":"application/json"}}));
