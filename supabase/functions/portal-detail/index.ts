import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Detail-Enrichment für zvg-portal.de, serverlos. Holt pro Akte die Detailseite
// (showZvg) und speichert portal_detail_text + leitet is_teilung ab. Zugriff
// braucht: Browser-Header (inkl. Accept-Language) + vorherige Suche je Bundesland
// (etabliert die Session) + Referer + die AKTUELLE zvg_id (per az_norm aus dem
// Live-Listing, da die gespeicherte ID bei Termin-Verlegung veraltet).
// Abgelaufene Termine sind vom Portal entfernt -> daher laufend cachen.

const TOKEN = "pdetail-5m2x8k4q";
const BASE = "https://www.zvg-portal.de";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const AC = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "de-DE,de;q=0.9",
};
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const STATE_TO_LAND: Record<string, string> = {
  BW: "bw",
  BY: "by",
  BE: "be",
  BB: "br",
  HB: "hb",
  HH: "hh",
  HE: "he",
  MV: "mv",
  NI: "ni",
  NW: "nw",
  RP: "rp",
  SL: "sl",
  SN: "sn",
  ST: "st",
  SH: "sh",
  TH: "th",
};

function azNormV2(az: string): string {
  const s = az.toLowerCase().trim().replace(/ /g, "");
  const m = s.match(/^0*(\d+)k0*(\d+)[-/](\d+)$/);
  if (!m) return s.replace(/\//g, "-");
  let [, p, n, y] = m;
  if (y.length === 4) y = y.slice(2);
  return `${p}k${n}-${y}`;
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&szlig;/g, "ß")
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&sup2;/g, "²")
    .replace(/&sup3;/g, "³")
    .replace(/&euro;/g, "€")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#128;/g, "€")
    .replace(/&#\d+;/g, " ")
    .trim();
}

// "Informationen zum Gläubiger: {…}" bis zum nächsten Feld-Marker.
function extractGlaeubiger(text: string): string | null {
  const i = text.indexOf("Informationen zum Gläubiger:");
  if (i < 0) return null;
  const rest = text.slice(i + "Informationen zum Gläubiger:".length);
  const g = rest
    .split(
      /Gericht: Internetseite des Gerichtes|Hinweis: Die Wertgrenzen|GeoServer/,
    )[0]
    .trim();
  return g || null;
}

function parseDetail(
  html: string,
): { text: string; isTeilung: boolean; glaeubiger: string | null } | null {
  const start = html.indexOf("letzte Aktualisierung:");
  if (start < 0) return null;
  const tr = html.lastIndexOf("<tr", start);
  const begin = tr >= 0 ? tr : start;
  const anchor = Math.max(
    html.indexOf("Exposee", start),
    html.indexOf("amtliche Bekanntmachung", start),
    html.indexOf("Ort der Versteigerung", start),
  );
  let end = html.indexOf("</table>", anchor > 0 ? anchor : start);
  if (end < 0) end = html.length;
  const text = unescapeHtml(html.slice(begin, end).replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  if (!text) return null;
  return {
    text,
    isTeilung: /aufhebung der gemeinschaft/i.test(text),
    glaeubiger: extractGlaeubiger(text),
  };
}

async function get(url: string, referer?: string): Promise<string> {
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      ...AC,
      ...(referer ? { Referer: referer } : {}),
    },
  });
  return await r.text();
}

// Bundesland-Suche (leeres ger_id + all=1) -> {az_norm: zvg_id}, mehrdeutige raus.
async function searchLand(land: string): Promise<Map<string, string>> {
  const form = new URLSearchParams({
    ger_name: "",
    order_by: "2",
    land_abk: land,
    ger_id: "",
    az1: "",
    az2: "",
    az3: "",
    az4: "",
    art: "",
    obj: "",
    str: "",
    hnr: "",
    plz: "",
    ort: "",
    ortsteil: "",
    vtermin: "",
    btermin: "",
  });
  const r = await fetch(BASE + "/index.php?button=Suchen&all=1", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: BASE + "/index.php?button=Termine%20suchen",
      ...AC,
    },
    body: form.toString(),
  });
  const html = await r.text();
  const pairs = new Map<string, string>();
  const cnt = new Map<string, number>();
  for (const blob of html
    .split("<a target=blank_ href=index.php?button=showZvg")
    .slice(1)) {
    const mid = blob.match(/zvg_id=(\d+)&land_abk=/);
    const maz = blob.match(/<nobr>([\d\sK\/]+?)&nbsp;\(Detailansicht\)/);
    if (mid && maz) {
      const k = azNormV2(maz[1].replace(/&nbsp;/g, " "));
      cnt.set(k, (cnt.get(k) ?? 0) + 1);
      pairs.set(k, mid[1]);
    }
  }
  for (const [k, c] of cnt) if (c > 1) pairs.delete(k);
  return pairs;
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get("token") !== TOKEN)
    return new Response("forbidden", { status: 403 });
  const limit = parseInt(u.searchParams.get("limit") || "120");
  const t0 = Date.now();
  const budgetMs = 110000;

  // Kandidaten via RPC: zukünftiger Termin + (Detail fehlt ODER Aktualisierungs-
  // datum hat sich seit dem Cachen geändert). So werden nur neue/geänderte
  // Detailseiten geladen, nicht alle.
  const { data: cand } = await supabase.rpc("zvg_detail_candidates", {
    p_limit: limit,
  });

  const stats = {
    laender: 0,
    fetched: 0,
    updated: 0,
    teilung: 0,
    gone: 0,
    empty: 0,
    errors: 0,
  };
  if (!cand || !cand.length)
    return new Response(JSON.stringify({ done: true, ...stats }), {
      headers: { "Content-Type": "application/json" },
    });

  const groups = new Map<string, any[]>();
  for (const r of cand as any[]) {
    const land = r.zvg_portal_land_abk || STATE_TO_LAND[r.state_abbr];
    if (!land) continue;
    (groups.get(land) ?? groups.set(land, []).get(land)!).push(r);
  }

  await get(BASE + "/index.php");
  await get(BASE + "/index.php?button=Termine%20suchen");

  outer: for (const [land, rows] of groups) {
    stats.laender++;
    let live: Map<string, string>;
    try {
      live = await searchLand(land);
    } catch (_) {
      stats.errors++;
      continue;
    }
    for (const r of rows) {
      if (Date.now() - t0 > budgetMs) break outer;
      const zvg = live.get(r.az_norm);
      if (!zvg) {
        stats.gone++;
        continue;
      }
      try {
        const html = await get(
          BASE + `/index.php?button=showZvg&zvg_id=${zvg}&land_abk=${land}`,
          BASE + "/index.php?button=Suchen",
        );
        stats.fetched++;
        const d = parseDetail(html);
        if (!d) {
          stats.empty++;
          continue;
        }
        const { error } = await supabase
          .from("zvg_akte")
          .update({
            portal_detail_text: d.text,
            is_teilung: d.isTeilung,
            glaeubiger: d.glaeubiger,
            portal_detail_updated: r.last_updated,
          })
          .eq("zid", r.zid);
        if (error) stats.errors++;
        else {
          stats.updated++;
          if (d.isTeilung) stats.teilung++;
        }
      } catch (_) {
        stats.errors++;
      }
    }
  }

  return new Response(JSON.stringify({ done: false, ...stats }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
