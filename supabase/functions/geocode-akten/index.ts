import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TOKEN = "geo-9f2k4r8v";
const UA = "persiusufer-crm/1.0";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// Deutschland-Bounding-Box (mit kleinem Puffer)
const DE_LAT_MIN = 47.2;
const DE_LAT_MAX = 55.1;
const DE_LON_MIN = 5.8;
const DE_LON_MAX = 15.1;

// Nominatim Usage-Policy: max. 1 Anfrage/Sekunde.
const THROTTLE_MS = 1100;

function insideDe(lat: number, lon: number): boolean {
  return (
    lat >= DE_LAT_MIN &&
    lat <= DE_LAT_MAX &&
    lon >= DE_LON_MIN &&
    lon <= DE_LON_MAX
  );
}

function precisionFromRank(rank: number, type: string): string {
  if (rank >= 30 || type === "house" || type === "building") return "house";
  if (rank >= 26 || type === "residential" || type === "highway")
    return "street";
  if (rank >= 20 || type === "postcode" || type === "suburb") return "postcode";
  if (rank >= 16 || type === "city" || type === "town" || type === "village")
    return "city";
  return "region";
}

type GeoResult = { lat: number; lon: number; precision: string };
// "error" = transienter Fehler (HTTP 429/5xx, Netzwerk, Parse) → NICHT als no-match werten.
// null     = Nominatim hat geantwortet, aber kein brauchbarer Treffer = echtes no-match.
type GeoOutcome = GeoResult | null | "error";

async function geocodeOne(query: string): Promise<GeoOutcome> {
  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=3&countrycodes=de&addressdetails=1&viewbox=${DE_LON_MIN},${DE_LAT_MAX},${DE_LON_MAX},${DE_LAT_MIN}&bounded=1`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "de" },
    });
    if (!r.ok) return "error";
    const arr = await r.json();
    if (!Array.isArray(arr)) return "error";
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
  } catch {
    return "error";
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("token") !== TOKEN)
    return new Response("forbidden", { status: 403 });
  const batch = parseInt(url.searchParams.get("batch") ?? "30");
  const sb = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const { data: kandidaten } = await sb
    .from("zvg_akte")
    .select("zid, objekt_strasse, objekt_hausnummer, objekt_plz, objekt_ort")
    .is("objekt_lat", null)
    .not("objekt_ort", "is", null)
    .limit(batch);

  const stats = {
    processed: 0,
    geocoded: 0,
    no_match: 0,
    errors: 0,
    by_precision: {} as Record<string, number>,
  };
  if (!kandidaten || kandidaten.length === 0)
    return new Response(JSON.stringify({ done: true, ...stats }), {
      headers: { "Content-Type": "application/json" },
    });

  for (const a of kandidaten) {
    stats.processed++;
    const strasse = a.objekt_strasse ?? "";
    const hnr = a.objekt_hausnummer ?? "";
    const strasseMitHnr = hnr && strasse ? `${strasse} ${hnr}` : strasse;
    // 'Ort, Ortsteil' — Komma + Ortsteil können Nominatim verwirren → nur Hauptort.
    const ort = (a.objekt_ort ?? "").split(",")[0].trim();
    const queries = [
      strasseMitHnr && a.objekt_plz && ort
        ? `${strasseMitHnr}, ${a.objekt_plz} ${ort}, Deutschland`
        : null,
      strasse && a.objekt_plz && ort
        ? `${strasse}, ${a.objekt_plz} ${ort}, Deutschland`
        : null,
      a.objekt_plz && ort ? `${a.objekt_plz} ${ort}, Deutschland` : null,
      ort ? `${ort}, Deutschland` : null,
    ].filter(Boolean) as string[];

    let result: GeoResult | null = null;
    let hadError = false;
    for (const q of queries) {
      const outcome = await geocodeOne(q);
      // Immer drosseln, AUCH nach einem Treffer — sonst < 1 req/s zur nächsten Akte (→ 429-Welle).
      await new Promise((r) => setTimeout(r, THROTTLE_MS));
      if (outcome === "error") {
        hadError = true;
        break;
      }
      if (outcome) {
        result = outcome;
        if (outcome.precision !== "region") break; // präzise genug
      }
      // outcome === null → nächsten Fallback versuchen
    }

    if (result) {
      await sb
        .from("zvg_akte")
        .update({
          objekt_lat: result.lat,
          objekt_lon: result.lon,
          geocoding_precision: result.precision,
          geocoding_at: new Date().toISOString(),
        })
        .eq("zid", a.zid);
      stats.geocoded++;
      stats.by_precision[result.precision] =
        (stats.by_precision[result.precision] || 0) + 1;
    } else if (hadError) {
      // Transienter Fehler: NICHTS schreiben → objekt_lat bleibt NULL → nächster Lauf versucht erneut.
      stats.errors++;
    } else {
      // Echtes no-match (Nominatim hat geantwortet, kein Treffer).
      await sb
        .from("zvg_akte")
        .update({
          objekt_lat: -1,
          objekt_lon: -1,
          geocoding_precision: "none",
          geocoding_at: new Date().toISOString(),
        })
        .eq("zid", a.zid);
      stats.no_match++;
    }
  }

  return new Response(JSON.stringify(stats, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
