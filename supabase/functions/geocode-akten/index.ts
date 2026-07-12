import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TOKEN = "geo-9f2k4r8v";
const UA = "persiusufer-crm/1.0";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// Deutschland-Bounding-Box (mit kleinem Puffer)
const DE_LAT_MIN = 47.2,
  DE_LAT_MAX = 55.1,
  DE_LON_MIN = 5.8,
  DE_LON_MAX = 15.1;
const THROTTLE_MS = 1100; // Nominatim: max 1 req/s

// state_abbr -> Bundesland-Name (für Query + Ergebnis-Validierung)
const LAND: Record<string, string> = {
  BW: "Baden-Württemberg",
  BY: "Bayern",
  BE: "Berlin",
  BB: "Brandenburg",
  HB: "Bremen",
  HH: "Hamburg",
  HE: "Hessen",
  MV: "Mecklenburg-Vorpommern",
  NI: "Niedersachsen",
  NW: "Nordrhein-Westfalen",
  RP: "Rheinland-Pfalz",
  SL: "Saarland",
  SN: "Sachsen",
  ST: "Sachsen-Anhalt",
  SH: "Schleswig-Holstein",
  TH: "Thüringen",
};

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
const validPlz = (p: any) =>
  typeof p === "string" && /^\d{5}$/.test(p.trim()) && p.trim() !== "00000";
// Bundesland-Namen locker vergleichen (Sonderzeichen/Groß-Klein egal)
const landEq = (a?: string | null, b?: string | null) =>
  !!a &&
  !!b &&
  a.toLowerCase().replace(/[^a-zäöüß]/g, "") ===
    b.toLowerCase().replace(/[^a-zäöüß]/g, "");

type GeoResult = {
  lat: number;
  lon: number;
  precision: string;
  state: string | null;
  postcode: string | null;
};
type GeoOutcome = GeoResult | null | "error";

async function geocodeOne(query: string): Promise<GeoOutcome> {
  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=de&addressdetails=1&viewbox=${DE_LON_MIN},${DE_LAT_MAX},${DE_LON_MAX},${DE_LAT_MIN}&bounded=1`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "de" },
    });
    if (!r.ok) return "error";
    const arr = await r.json();
    if (!Array.isArray(arr)) return "error";
    for (const hit of arr) {
      const lat = parseFloat(hit.lat),
        lon = parseFloat(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const land = (hit.address?.country_code ?? "").toLowerCase();
      if (land && land !== "de") continue;
      if (!insideDe(lat, lon)) continue;
      const rank = parseInt(hit.place_rank ?? "0") || 0;
      const type = (hit.type ?? hit.class ?? "").toString();
      return {
        lat,
        lon,
        precision: precisionFromRank(rank, type),
        state: hit.address?.state ?? null,
        postcode: hit.address?.postcode ?? null,
      };
    }
    return null;
  } catch {
    return "error";
  }
}

// Echten Ort aus objekt_ort ziehen (auch aus "Straße, 00000 Ort" / "Ort, Ortsteil").
function ortAusFeld(objekt_ort: string): string {
  const m = objekt_ort.match(/\d{5}\s+(.+)$/); // Teil nach PLZ = Ort
  if (m) return m[1].trim();
  return objekt_ort.split(",")[0].trim();
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("token") !== TOKEN)
    return new Response("forbidden", { status: 403 });
  const batch = parseInt(url.searchParams.get("batch") ?? "30");
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: kandidaten } = await sb
    .from("zvg_akte")
    .select(
      "zid, objekt_strasse, objekt_hausnummer, objekt_plz, objekt_ort, state_abbr, ag_company_id",
    )
    .is("objekt_lat", null)
    .not("objekt_ort", "is", null)
    .limit(batch);

  const stats = {
    processed: 0,
    geocoded: 0,
    amtsgericht_fallback: 0,
    plz_ergaenzt: 0,
    no_match: 0,
    errors: 0,
    by_precision: {} as Record<string, number>,
  };
  if (!kandidaten || kandidaten.length === 0)
    return new Response(JSON.stringify({ done: true, ...stats }), {
      headers: { "Content-Type": "application/json" },
    });

  // Gerichts-Koordinaten für den Fallback laden.
  const compIds = [
    ...new Set(kandidaten.map((a: any) => a.ag_company_id).filter(Boolean)),
  ];
  const courtGeo = new Map<number, { lat: number; lon: number }>();
  if (compIds.length) {
    const { data: comps } = await sb
      .from("companies")
      .select("id, lat, lon")
      .in("id", compIds);
    for (const c of comps ?? [])
      if (c.lat != null && c.lon != null)
        courtGeo.set(c.id, { lat: c.lat, lon: c.lon });
  }

  for (const a of kandidaten) {
    stats.processed++;
    const land = LAND[a.state_abbr] ?? "";
    const strasse = a.objekt_strasse ?? "";
    const hnr = a.objekt_hausnummer ?? "";
    const strasseMitHnr = hnr && strasse ? `${strasse} ${hnr}` : strasse;
    const ort = a.objekt_ort ? ortAusFeld(a.objekt_ort) : "";
    const plz = validPlz(a.objekt_plz) ? a.objekt_plz.trim() : "";
    const suffix = land ? `, ${land}, Deutschland` : ", Deutschland";
    const queries = [
      strasseMitHnr && plz && ort
        ? `${strasseMitHnr}, ${plz} ${ort}${suffix}`
        : null,
      strasse && plz && ort ? `${strasse}, ${plz} ${ort}${suffix}` : null,
      strasseMitHnr && ort ? `${strasseMitHnr}, ${ort}${suffix}` : null,
      plz && ort ? `${plz} ${ort}${suffix}` : null,
      ort ? `${ort}${suffix}` : null,
    ].filter(Boolean) as string[];

    let result: GeoResult | null = null;
    let hadError = false;
    for (const q of queries) {
      const outcome = await geocodeOne(q);
      await new Promise((r) => setTimeout(r, THROTTLE_MS));
      if (outcome === "error") {
        hadError = true;
        break;
      }
      if (!outcome) continue;
      // BUNDESLAND-ZWANG: Treffer außerhalb des Gerichts-Bundeslands verwerfen.
      if (land && outcome.state && !landEq(outcome.state, land)) continue;
      result = outcome;
      if (outcome.precision !== "region" && outcome.precision !== "city") break; // präzise genug
    }

    if (result) {
      const patch: any = {
        objekt_lat: result.lat,
        objekt_lon: result.lon,
        geocoding_precision: result.precision,
        geocoding_at: new Date().toISOString(),
      };
      if (!validPlz(a.objekt_plz) && validPlz(result.postcode)) {
        patch.objekt_plz = result.postcode;
        stats.plz_ergaenzt++;
      }
      await sb.from("zvg_akte").update(patch).eq("zid", a.zid);
      stats.geocoded++;
      stats.by_precision[result.precision] =
        (stats.by_precision[result.precision] || 0) + 1;
    } else if (hadError) {
      stats.errors++; // transient -> objekt_lat bleibt NULL -> nächster Lauf
    } else {
      // Kein valider Treffer im Bundesland -> Fallback: Amtsgericht-Standort, sichtbar geflaggt.
      const cg = courtGeo.get(a.ag_company_id);
      if (cg) {
        await sb
          .from("zvg_akte")
          .update({
            objekt_lat: cg.lat,
            objekt_lon: cg.lon,
            geocoding_precision: "amtsgericht",
            geocoding_at: new Date().toISOString(),
          })
          .eq("zid", a.zid);
        stats.amtsgericht_fallback++;
      } else {
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
  }

  return new Response(JSON.stringify(stats, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
