import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Audit aufgehobener zvg.com-Akten (Dokument-Verfuegbarkeit). Einmalig ausgefuehrt 2026-06-22.
// Deaktiviert; im Dashboard loeschbar. Logik ggf. in den Marktscan integrieren.
Deno.serve(() => new Response(JSON.stringify({status:"disabled"}), {status:410, headers:{"Content-Type":"application/json"}}));
