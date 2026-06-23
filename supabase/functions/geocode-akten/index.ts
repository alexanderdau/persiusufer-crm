import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TOKEN = "geo-9f2k4r8v";
const UA = "persiusufer-crm/1.0";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// Deutschland-Bounding-Box (mit kleinem Puffer)
const DE_LAT_MIN = 47.20;
const DE_LAT_MAX = 55.10;
const DE_LON_MIN = 5.80;
const DE_LON_MAX = 15.10;

function insideDe(lat: number, lon: number): boolean {
  return lat >= DE_LAT_MIN && lat <= DE_LAT_MAX && lon >= DE_LON_MIN && lon <= DE_LON_MAX;
}

function precisionFromRank(rank: number, type: string): string {
  if (rank >= 30 || type === "house" || type === "building") return "house";
  if (rank >= 26 || type === "residential" || type === "highway") return "street";
  if (rank >= 20 || type === "postcode" || type === "suburb") return "postcode";
  if (rank >= 16 || type === "city" || type === "town" || type === "village") return "city";
  return "region";
}

async function geocodeOne(query: string) {
  // viewbox = DE-Bounds als zusätzliches Hint plus bounded=1 als Hard-Limit
  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=3&countrycodes=de&addressdetails=1&viewbox=${DE_LON_MIN},${DE_LAT_MAX},${DE_LON_MAX},${DE_LAT_MIN}&bounded=1`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "de" } });
    if (!r.ok) return null;
    const arr = await r.json();
    if (!Array.isArray(arr)) return null;
    for (const hit of arr) {
      const lat = parseFloat(hit.lat);
      const lon = parseFloat(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      // Doppel-Sicherheit: Land muss DE sein, und Coords müssen innerhalb DE-Box liegen
      const land = (hit.address?.country_code ?? "").toLowerCase();
      if (land && land !== "de") continue;
      if (!insideDe(lat, lon)) continue;
      const rank = parseInt(hit.place_rank ?? "0") || 0;
      const type = (hit.type ?? hit.class ?? "").toString();
      return { lat, lon, precision: precisionFromRank(rank, type) };
    }
    return null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("token") !== TOKEN) return new Response("forbidden", { status: 403 });
  const batch = parseInt(url.searchParams.get("batch") ?? "30");
  const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: kandidaten } = await sb
    .from("zvg_akte")
    .select("zid, objekt_strasse, objekt_hausnummer, objekt_plz, objekt_ort")
    .is("objekt_lat", null)
    .not("objekt_ort", "is", null)
    .limit(batch);

  const stats = { processed: 0, geocoded: 0, no_match: 0, errors: 0, by_precision: {} as Record<string, number> };
  if (!kandidaten || kandidaten.length === 0) return new Response(JSON.stringify({ done: true, ...stats }), { headers: { "Content-Type": "application/json" } });

  for (const a of kandidaten) {
    stats.processed++;
    const strasse = a.objekt_strasse ?? "";
    const hnr = a.objekt_hausnummer ?? "";
    const strasseMitHnr = hnr && strasse ? `${strasse} ${hnr}` : strasse;
    // Spezialbehandlung: 'Ort, Ortsteil' — Komma + Ortsteil können Nominatim verwirren
    // Wenn ort ein Komma enthält, splitten und nur den Hauptort nutzen
    const ort = (a.objekt_ort ?? "").split(",")[0].trim();
    const queries = [
      strasseMitHnr && a.objekt_plz && ort ? `${strasseMitHnr}, ${a.objekt_plz} ${ort}, Deutschland` : null,
      strasse && a.objekt_plz && ort ? `${strasse}, ${a.objekt_plz} ${ort}, Deutschland` : null,
      a.objekt_plz && ort ? `${a.objekt_plz} ${ort}, Deutschland` : null,
      ort ? `${ort}, Deutschland` : null,
    ].filter(Boolean) as string[];

    let result: any = null;
    for (const q of queries) {
      result = await geocodeOne(q);
      if (result && result.precision !== "region") break;
      await new Promise((r) => setTimeout(r, 1100));
    }

    if (result) {
      await sb.from("zvg_akte").update({
        objekt_lat: result.lat,
        objekt_lon: result.lon,
        geocoding_precision: result.precision,
        geocoding_at: new Date().toISOString(),
      }).eq("zid", a.zid);
      stats.geocoded++;
      stats.by_precision[result.precision] = (stats.by_precision[result.precision] || 0) + 1;
    } else {
      await sb.from("zvg_akte").update({
        objekt_lat: -1, objekt_lon: -1,
        geocoding_precision: "none",
        geocoding_at: new Date().toISOString(),
      }).eq("zid", a.zid);
      stats.no_match++;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return new Response(JSON.stringify(stats, null, 2), { headers: { "Content-Type": "application/json" } });
});
