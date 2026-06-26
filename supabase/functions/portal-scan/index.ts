import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Per-Bundesland-Listing-Scan: ~16 Suchen statt ~400 (eine je Bundesland,
// ger_id leer + all=1). Matching:
//   1. zvg_portal_id-Direkttreffer -> Update (Gericht bekannt, kein Detail)
//   2. az_norm im Bundesland eindeutig -> Update
//   3. neu/mehrdeutig -> Detailseite ("Ort der Versteigerung: Amtsgericht X")
//      -> echtes Gericht auflösen -> einfügen/zuordnen; nicht auflösbar -> skip
// Dublettensicher: das BL-Listing liefert KEINEN Gerichtsnamen (nur im Safari-
// DOM, nicht in den Bytes) -> mehrdeutige NIE blind per az_norm, immer per Detail.
// ?dry=1 schreibt nichts (Klassifikation + Stats). Token-Auth in URL.

const TOKEN = "pscan-6h4w8m3k";
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
const MONTHS: Record<string, number> = {
  Januar: 1,
  Februar: 2,
  März: 3,
  April: 4,
  Mai: 5,
  Juni: 6,
  Juli: 7,
  August: 8,
  September: 9,
  Oktober: 10,
  November: 11,
  Dezember: 12,
};

function azNormV2(az: string) {
  const s = az.toLowerCase().trim().replace(/ /g, "");
  const m = s.match(/^0*(\d+)k0*(\d+)[-/](\d+)$/);
  if (!m) return s.replace(/\//g, "-");
  let [, p, n, y] = m;
  if (y.length === 4) y = y.slice(2);
  return `${p}k${n}-${y}`;
}
function azCanon(az: string) {
  const m = az.trim().match(/^0*(\d+)\s*K\s*0*(\d+)\s*[-/]\s*(\d+)$/i);
  if (!m) return az.trim();
  let [, p, n, y] = m;
  if (y.length === 4) y = y.slice(2);
  return `${p} K ${n}-${y}`;
}
function azJahr(az: string) {
  const m = az.match(/[-/](\d{2,4})$/);
  if (!m) return null;
  let y = parseInt(m[1]);
  if (y < 100) y = y < 50 ? 2000 + y : 1900 + y;
  return y;
}
function parseVkw(s: string | null) {
  if (!s) return null;
  const t = s
    .replace(/Euro/g, "")
    .replace(/€/g, "")
    .trim()
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const f = parseFloat(t);
  return isNaN(f) ? null : f;
}
const VKW_NUM = /\d{1,3}(?:\.\d{3})+(?:,\d+|,-+)?|\d+,\d{2}/;
function parseVkwCell(cellHtml: string | null) {
  if (!cellHtml) return null;
  const txt = unescapeHtml(
    cellHtml.replace(/<[^>]+>/g, " ").replace(/&#128;|&euro;/gi, "€"),
  );
  const g = txt.match(
    new RegExp("Gesamt\\w*wert[:\\s]*(" + VKW_NUM.source + ")", "i"),
  );
  const m = g || txt.match(VKW_NUM);
  if (!m) return null;
  return parseVkw((g ? m[1] : m[0]).replace(/,-+$/, ""));
}
function parseTermin(s: string | null) {
  if (!s) return null;
  const m = s.match(
    /^[A-Za-zä]+,\s+(\d+)\.\s+(\w+)\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s+Uhr/,
  );
  if (!m) return null;
  const [, d, mn, y, h, mi] = m;
  const mo = MONTHS[mn];
  if (!mo) return null;
  const pad = (x: string) => x.padStart(2, "0");
  return `${y}-${pad(String(mo))}-${pad(d)}T${pad(h)}:${mi}:00+02:00`;
}
function unescapeHtml(s: string) {
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
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    .trim();
}
function listingText(blob: string) {
  const end = blob.indexOf("<!--Aktenzeichen--->");
  const entry = (end > 0 ? blob.slice(0, end) : blob)
    .replace(/^[^>]*>/, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#128;|&euro;/gi, "€");
  const txt = unescapeHtml(entry)
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return txt || null;
}

async function get(url: string, referer?: string) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      ...AC,
      ...(referer ? { Referer: referer } : {}),
    },
  });
  return await r.text();
}
async function searchLand(land: string) {
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
  const out: any[] = [];
  for (const blob of html
    .split("<a target=blank_ href=index.php?button=showZvg")
    .slice(1)) {
    const mId = blob.match(/zvg_id=(\d+)&land_abk=(\w+)/);
    const mAz = blob.match(/<nobr>([\d\sK\/]+?)&nbsp;\(Detailansicht\)/);
    if (!mId || !mAz) continue;
    const mObj = blob.match(/<b>([^<]+?)<!--Lage--->:<\/b>\s*([^<]+?)<\/td>/);
    const mVkw = blob.match(/Verkehrswert in[\s\S]*?<\/td>([\s\S]*?)<TR/);
    const mTer = blob.match(
      /colspan=2>([^<]+?, \d+\. \w+ \d{4}, \d+:\d+ Uhr)<\/td>/,
    );
    const mUpd = blob.match(
      /letzte Aktualisierung (\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})/,
    );
    const azRaw = unescapeHtml(mAz[1]);
    out.push({
      zvg_portal_id: parseInt(mId[1]),
      land_abk: mId[2],
      az_raw: azRaw,
      az_norm: azNormV2(azRaw),
      objektart: mObj ? unescapeHtml(mObj[1]) : null,
      lage: mObj ? unescapeHtml(mObj[2]) : null,
      vkw_eur: parseVkwCell(mVkw ? mVkw[1] : null),
      termin: mTer ? parseTermin(unescapeHtml(mTer[1])) : null,
      last_updated: mUpd
        ? `${mUpd[3]}-${mUpd[2]}-${mUpd[1]}T${mUpd[4]}:${mUpd[5]}:00+02:00`
        : null,
      listing_text: listingText(blob),
    });
  }
  return out;
}
async function courtFromDetail(
  zvgId: number,
  land: string,
): Promise<string | null> {
  const h = await get(
    BASE + `/index.php?button=showZvg&zvg_id=${zvgId}&land_abk=${land}`,
    BASE + "/index.php?button=Suchen",
  );
  const t = unescapeHtml(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  const m = t.match(/Ort der Versteigerung:\s*Amtsgericht\s+(.+?)\s*,/);
  return m ? m[1].trim() : null;
}

async function loadAll(table: string, select: string, filter = "") {
  const out: any[] = [];
  for (let off = 0; ; off += 1000) {
    const { data } = await supabase
      .from(table)
      .select(select)
      .range(off, off + 999);
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get("token") !== TOKEN)
    return new Response("forbidden", { status: 403 });
  const dry = !!u.searchParams.get("dry");
  const t0 = Date.now();
  const budgetMs = 110000;

  // Bestand: zvg_portal_id -> {zid, ag}, und state|az_norm -> [{zid, ag}]
  const akten = await loadAll(
    "zvg_akte",
    "zid,az_norm,ag_company_id,state_abbr,zvg_portal_id,zvg_portal_last_updated",
  );
  const byPid = new Map<number, any>();
  const byKey = new Map<string, any[]>();
  for (const a of akten) {
    if (a.zvg_portal_id != null) byPid.set(a.zvg_portal_id, a);
    if (a.az_norm && a.ag_company_id && a.state_abbr) {
      const k = a.state_abbr + "|" + a.az_norm;
      (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(a);
    }
  }
  // Gerichte: normalisierter Name -> {id, state}
  const comps = await loadAll("companies", "id,name,state_abbr", "");
  const byCourt = new Map<string, any>();
  for (const c of comps)
    if (c.name)
      byCourt.set(c.name.toLowerCase().replace(/\s+/g, " ").trim(), c);

  const st: Record<string, number> = {
    laender: 0,
    entries: 0,
    upd_pid: 0,
    upd_aznorm: 0,
    unchanged: 0,
    inserted: 0,
    upd_detail: 0,
    skipped_unresolved: 0,
    errors: 0,
  };
  const toInsert: any[] = [];

  outer: for (const [state, land] of Object.entries(STATE_TO_LAND)) {
    let entries: any[];
    try {
      entries = await searchLand(land);
    } catch (_) {
      st.errors++;
      continue;
    }
    st.laender++;
    for (const e of entries) {
      st.entries++;
      const norm = e.az_norm;
      const existing = byKey.get(state + "|" + norm) ?? [];
      // 1) zvg_portal_id-Direkttreffer
      const pidHit = byPid.get(e.zvg_portal_id);
      let target = pidHit ?? (existing.length === 1 ? existing[0] : null);

      if (!target) {
        // 3) neu/mehrdeutig -> Detail -> Gericht
        if (Date.now() - t0 > budgetMs) break outer;
        let court: string | null = null;
        try {
          court = await courtFromDetail(e.zvg_portal_id, land);
        } catch (_) {
          st.errors++;
        }
        const comp = court
          ? byCourt.get(
              ("amtsgericht " + court)
                .toLowerCase()
                .replace(/\s+/g, " ")
                .trim(),
            )
          : null;
        if (!comp || comp.state_abbr !== state) {
          st.skipped_unresolved++;
          continue;
        }
        const atCourt = existing.find((a: any) => a.ag_company_id === comp.id);
        if (atCourt) {
          target = atCourt;
          st.upd_detail++;
        } else {
          // einfügen
          if (!dry) toInsert.push(buildInsert(e, comp, state));
          st.inserted++;
          continue;
        }
      } else if (pidHit) {
        // unverändert (gleiche letzte Aktualisierung) -> kein Update nötig
        const a = pidHit.zvg_portal_last_updated,
          b = e.last_updated;
        const same = a && b ? Date.parse(a) === Date.parse(b) : !a && !b;
        if (same) {
          st.unchanged++;
          continue;
        }
        st.upd_pid++;
      } else {
        st.upd_aznorm++;
      }
      // Update
      if (!dry && target) {
        const fields: any = {
          vkw_eur_zvg_portal: e.vkw_eur,
          last_seen: new Date().toISOString(),
          zvg_portal_land_abk: e.land_abk,
          portal_listing_text: e.listing_text,
        };
        if (e.termin) fields.termin = e.termin;
        if (e.last_updated) fields.zvg_portal_last_updated = e.last_updated;
        const { data: cur } = await supabase
          .from("zvg_akte")
          .select("vkw_eur")
          .eq("zid", target.zid)
          .single();
        if (cur && cur.vkw_eur == null && e.vkw_eur != null)
          fields.vkw_eur = e.vkw_eur;
        await supabase.from("zvg_akte").update(fields).eq("zid", target.zid);
      }
    }
  }

  if (!dry && toInsert.length) {
    for (let i = 0; i < toInsert.length; i += 50) {
      await supabase.from("zvg_akte").insert(toInsert.slice(i, i + 50));
    }
  }
  return new Response(
    JSON.stringify({ dry, ...st, would_insert: toInsert.length }, null, 2),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
});

function buildInsert(e: any, comp: any, state: string) {
  const lage = e.lage || "";
  const ma = lage.match(/^(.+?)\s*,\s*(\d{5})\s+(.+)$/);
  let plz = ma ? ma[2] : null;
  if (plz === "00000") plz = null;
  return {
    zid: "p" + e.zvg_portal_id,
    zvg_portal_id: e.zvg_portal_id,
    az: azCanon(e.az_raw),
    az_norm: e.az_norm,
    az_jahr: azJahr(e.az_raw),
    ag_company_id: comp.id,
    ag_name_raw: comp.name.replace(/^Amtsgericht /, ""),
    art: "Zwangsversteigerung",
    is_teilung: false,
    objektart: e.objektart,
    objekt_strasse: ma ? ma[1].trim() : lage || null,
    objekt_plz: plz,
    objekt_ort: ma ? ma[3].trim() : null,
    vkw_eur: e.vkw_eur,
    termin: e.termin,
    state_abbr: state,
    zvg_portal_land_abk: e.land_abk,
    zvg_portal_last_updated: e.last_updated,
    vkw_eur_zvg_portal: e.vkw_eur,
    portal_listing_text: e.listing_text,
    status: "neu",
    raw_json: {
      zvg_portal_id: e.zvg_portal_id,
      az: e.az_raw,
      ag: comp.name,
      source: "zvg-portal.de",
    },
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
  };
}
