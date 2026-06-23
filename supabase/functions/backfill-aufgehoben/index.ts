import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Backfill aufgehobener zvg.com-Akten. Komplettscan-Lauf 2026-06-22 abgeschlossen.
// Deaktiviert; im Dashboard loeschbar. Logik gehoert in den Marktscan (alle BL).
Deno.serve(() => new Response(JSON.stringify({status:"disabled"}), {status:410, headers:{"Content-Type":"application/json"}}));
