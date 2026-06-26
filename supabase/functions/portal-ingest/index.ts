import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TOKEN = "pingest-7f3k9q2v";
const BASE = "https://www.zvg-portal.de";
const UA = "persiusufer-portal/1.0";
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
  if (!az) return null;
  const s = az.toLowerCase().trim().replace(/ /g, "");
  const m = s.match(/^0*(\d+)k0*(\d+)[-/](\d+)$/);
  if (!m) return s.replace(/\//g, "-");
  let [, p, n, y] = m;
  if (y.length === 4) y = y.slice(2);
  return `${p}k${n}-${y}`;
}
function azCanon(az: string) {
  if (!az) return null;
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
  let t = s
    .replace(/Euro/g, "")
    .replace(/€/g, "")
    .trim()
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const f = parseFloat(t);
  return isNaN(f) ? null : f;
}
// Währungsförmige Zahl: Tausenderpunkte (60.000 / 1.790.000,00 / 382.000,-)
// ODER Dezimalbetrag (3.380,00). KEINE blanken Ziffernläufe — die griffen sonst
// Zähler/Referenzen wie "lfd. Nr. 1" oder "Blatt 4001".
const VKW_NUM = /\d{1,3}(?:\.\d{3})+(?:,\d+|,-+)?|\d+,\d{2}/;
// Verkehrswert aus dem Zell-HTML ziehen. Robust gegen <b>WERT</b> (NRW),
// <b><p>WERT</p></b> (BB), Word-Tabellen-Paste (BY) und Mehrposten/Teilflächen.
// Bei "Gesamt(verkehrs)wert: X" wird X bevorzugt (Summe statt erster Position),
// sonst die erste währungsförmige Zahl. Hartnäckige Fälle bleiben über
// portal_listing_text/portal_detail_text der späteren Auswertung erhalten.
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
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    .trim();
}

// Gesamter Übersichtstext eines Eintrags: von AZ-Beginn bis zur amtlichen
// Bekanntmachung (Eintrags-Ende). Tags raus, lesbar normalisiert. Bewahrt den
// Rohinhalt (z. B. Mehrposten-Verkehrswerte, fehlende PLZ) für spätere Auswertung.
function listingText(blob: string) {
  const end = blob.indexOf("<!--Aktenzeichen--->");
  const entry = (end > 0 ? blob.slice(0, end) : blob)
    .replace(/^[^>]*>/, "") // Rest des <a …>-Tags entfernen
    .replace(/<[^>]+>/g, " ") // Tags entfernen
    .replace(/&#128;|&euro;/gi, "€");
  const txt = unescapeHtml(entry)
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return txt || null;
}

function parseListing(htmlText: string) {
  const parts = htmlText
    .split("<a target=blank_ href=index.php?button=showZvg")
    .slice(1);
  const out: any[] = [];
  for (const blob of parts) {
    const mId = blob.match(/zvg_id=(\d+)&land_abk=(\w+)>/);
    const mAz = blob.match(/<nobr>([\d\sK\/]+?)&nbsp;\(Detailansicht\)/);
    if (!mId || !mAz) continue;
    const mObj = blob.match(/<b>([^<]+?)<!--Lage--->:<\/b>\s*([^<]+?)<\/td>/);
    // Verkehrswert: Inhalt der Wert-Zelle bis zur nächsten strukturellen Zeile.
    // Strukturzeilen nutzen <TR> (groß); eingefügte Word-Tabellen nutzen <tr>
    // (klein) und werden so nicht als Grenze missverstanden. Greift bei
    // <b>WERT</b> (NRW), <b><p>WERT</p></b> (z. B. BB) und Tabellen-Paste (BY).
    const mVkw = blob.match(/Verkehrswert in[\s\S]*?<\/td>([\s\S]*?)<TR/);
    const mTer = blob.match(
      /colspan=2>([^<]+?, \d+\. \w+ \d{4}, \d+:\d+ Uhr)<\/td>/,
    );
    // letzte Aktualisierung: "(letzte Aktualisierung DD-MM-YYYY HH:MM)"
    const mUpd = blob.match(
      /letzte Aktualisierung (\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})/,
    );
    out.push({
      zvg_portal_id: parseInt(mId[1]),
      land_abk: mId[2],
      az_raw: unescapeHtml(mAz[1]),
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

async function portalSearch(land: string, gerId: string) {
  const form = new URLSearchParams({
    ger_name: "",
    order_by: "2",
    land_abk: land,
    ger_id: gerId,
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
    },
    body: form.toString(),
  });
  if (!r.ok) {
    await r.arrayBuffer();
    return null;
  }
  return new TextDecoder("utf-8").decode(await r.arrayBuffer());
}

async function upsertQuelle(zid: string, externeId: any) {
  const { error } = await supabase.from("zvg_akte_quelle").upsert(
    {
      zid,
      quelle: "zvg-portal.de",
      externe_id: externeId != null ? String(externeId) : null,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "zid,quelle" },
  );
  if (error) console.error("upsertQuelle", zid, error.message);
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get("token") !== TOKEN)
    return new Response("forbidden", { status: 403 });
  const batch = parseInt(u.searchParams.get("batch") || "25");
  const t0 = Date.now();
  const budgetMs = 90000;

  const { data: agsRaw } = await supabase
    .from("companies")
    .select("id,name,state_abbr,zvg_portal_ag_id")
    .eq("sector", "Amtsgericht")
    .not("zvg_portal_ag_id", "is", null);
  const ags = (agsRaw ?? [])
    .filter((a: any) => STATE_TO_LAND[a.state_abbr])
    .sort((a: any, b: any) => a.id - b.id);
  const n = ags.length;
  if (!n)
    return new Response(JSON.stringify({ error: "no ags" }), { status: 200 });

  // Match-Map: az_norm|ag_company_id → zid, plus zidSet für direkte zid-Treffer
  const matchMap = new Map<string, string>();
  const zidSet = new Set<string>();
  for (let off = 0; ; off += 1000) {
    const { data } = await supabase
      .from("zvg_akte")
      .select("zid,az_norm,ag_company_id")
      .range(off, off + 999);
    if (!data || !data.length) break;
    for (const r of data) {
      zidSet.add(r.zid);
      if (r.az_norm && r.ag_company_id)
        matchMap.set(r.az_norm + "|" + r.ag_company_id, r.zid);
    }
    if (data.length < 1000) break;
  }

  const { data: st } = await supabase
    .from("portal_ingest_state")
    .select("cursor")
    .eq("id", 1)
    .single();
  let start = (((st?.cursor ?? 0) % n) + n) % n;

  try {
    await (
      await fetch(BASE + "/", { headers: { "User-Agent": UA } })
    ).arrayBuffer();
    await (
      await fetch(BASE + "/index.php?button=Termine%20suchen", {
        headers: { "User-Agent": UA },
      })
    ).arrayBuffer();
  } catch (_) {
    /*ignore*/
  }

  const stats = {
    ags_processed: 0,
    cases_seen: 0,
    inserted: 0,
    updated: 0,
    skipped_existing: 0,
    errors: 0,
  };
  let idx = start;
  let processed = 0;
  const toInsert: any[] = [];
  const toUpdate: any[] = [];
  while (processed < batch && Date.now() - t0 < budgetMs) {
    const ag = ags[idx];
    const land = STATE_TO_LAND[ag.state_abbr];
    try {
      const htmlText = await portalSearch(land, ag.zvg_portal_ag_id);
      if (htmlText) {
        for (const c of parseListing(htmlText)) {
          stats.cases_seen++;
          const norm = azNormV2(c.az_raw);
          const newZid = "p" + c.zvg_portal_id;
          const existingZid =
            (norm && matchMap.get(norm + "|" + ag.id)) ||
            (zidSet.has(newZid) ? newZid : null);

          const lage = c.lage || "";
          const ma = lage.match(/^(.+?)\s*,\s*(\d{5})\s+(.+)$/);
          let plz = ma ? ma[2] : null;
          if (plz === "00000") plz = null;
          const portalFields: any = {
            zvg_portal_id: c.zvg_portal_id,
            objektart: c.objektart,
            objekt_strasse: ma ? ma[1].trim() : lage || null,
            objekt_plz: plz,
            objekt_ort: ma ? ma[3].trim() : null,
            vkw_eur_zvg_portal: c.vkw_eur,
            termin: c.termin,
            zvg_portal_land_abk: c.land_abk,
            last_seen: new Date().toISOString(),
          };

          if (existingZid) {
            // UPDATE: nur Portal-Felder, NULL-Werte nicht überschreiben außer bei vkw_eur_zvg_portal
            const updateRow: any = {
              zid: existingZid,
              vkw_eur_zvg_portal: c.vkw_eur,
              last_seen: new Date().toISOString(),
              _pid: c.zvg_portal_id,
              _last_updated: c.last_updated,
              _listing_text: c.listing_text,
            };
            // Termin nur updaten wenn aus Portal vorhanden
            if (c.termin) updateRow.termin = c.termin;
            if (c.objektart) updateRow.objektart_portal = c.objektart;
            // vkw_eur nur füllen wenn bisher NULL
            updateRow._fill_vkw_eur = c.vkw_eur;
            toUpdate.push(updateRow);
            stats.skipped_existing++;
          } else {
            toInsert.push({
              zid: newZid,
              zvg_portal_id: c.zvg_portal_id,
              az: azCanon(c.az_raw),
              az_norm: norm,
              az_jahr: azJahr(c.az_raw),
              ag_company_id: ag.id,
              ag_name_raw: ag.name.replace(/^Amtsgericht /, ""),
              art: "Zwangsversteigerung",
              is_teilung: false,
              objektart: c.objektart,
              objekt_strasse: ma ? ma[1].trim() : lage || null,
              objekt_plz: plz,
              objekt_ort: ma ? ma[3].trim() : null,
              vkw_eur: c.vkw_eur,
              termin: c.termin,
              state_abbr: ag.state_abbr,
              zvg_portal_land_abk: c.land_abk,
              zvg_portal_last_updated: c.last_updated,
              vkw_eur_zvg_portal: c.vkw_eur,
              portal_listing_text: c.listing_text,
              status: "neu",
              raw_json: {
                zvg_portal_id: c.zvg_portal_id,
                az: c.az_raw,
                ag: ag.name,
                objektart: c.objektart,
                lage: c.lage,
                vkw_eur: c.vkw_eur,
                termin: c.termin,
                source: "zvg-portal.de",
              },
              first_seen: new Date().toISOString(),
              last_seen: new Date().toISOString(),
            });
            matchMap.set(norm + "|" + ag.id, newZid);
            zidSet.add(newZid);
          }
        }
      }
      stats.ags_processed++;
    } catch (e) {
      stats.errors++;
    }
    idx = (idx + 1) % n;
    processed++;
    if (idx === start) break;
  }

  // Insert
  for (let i = 0; i < toInsert.length; i += 50) {
    const { error } = await supabase
      .from("zvg_akte")
      .insert(toInsert.slice(i, i + 50));
    if (error) {
      stats.errors++;
    } else stats.inserted += Math.min(50, toInsert.length - i);
  }
  // Quelle 'zvg-portal.de' für neue Akten (Trigger pflegt zvg_akte.quellen)
  for (const r of toInsert) await upsertQuelle(r.zid, r.zvg_portal_id);

  // Update existierender Akten: vkw_eur_zvg_portal + termin + vkw_eur (wenn NULL)
  // Wir machen das per RPC oder einzeln, damit die NULL-Logik für vkw_eur greift
  for (const u of toUpdate) {
    const fields: any = {
      vkw_eur_zvg_portal: u.vkw_eur_zvg_portal,
      last_seen: u.last_seen,
    };
    if (u.termin) fields.termin = u.termin;
    if (u._last_updated) fields.zvg_portal_last_updated = u._last_updated;
    if (u._listing_text) fields.portal_listing_text = u._listing_text;
    // vkw_eur nur füllen wenn aktuell NULL
    if (u._fill_vkw_eur != null) {
      const { data: cur } = await supabase
        .from("zvg_akte")
        .select("vkw_eur")
        .eq("zid", u.zid)
        .single();
      if (cur && cur.vkw_eur == null) fields.vkw_eur = u._fill_vkw_eur;
    }
    const { error } = await supabase
      .from("zvg_akte")
      .update(fields)
      .eq("zid", u.zid);
    if (error) stats.errors++;
    else stats.updated++;
    await upsertQuelle(u.zid, u._pid);
  }

  await supabase
    .from("portal_ingest_state")
    .update({
      cursor: idx,
      last_run: new Date().toISOString(),
      last_stats: stats as any,
    })
    .eq("id", 1);

  return new Response(
    JSON.stringify({ start, next_cursor: idx, n_ags: n, ...stats }, null, 2),
    { headers: { "Content-Type": "application/json" } },
  );
});
