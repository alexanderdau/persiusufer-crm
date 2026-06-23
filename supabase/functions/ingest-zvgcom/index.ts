import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Komplett-Ingest zvg.com (alle BL, fehlende Akten). Einmalig ausgefuehrt 2026-06-22 (149 Akten).
// Deaktiviert; im Dashboard loeschbar. Dauerhaft via marktscan_zvg_v2.py (alle BL) abdecken.
Deno.serve(() => new Response(JSON.stringify({status:"disabled"}), {status:410, headers:{"Content-Type":"application/json"}}));
