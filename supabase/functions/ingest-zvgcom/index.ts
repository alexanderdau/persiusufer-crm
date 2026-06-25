import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─────────────────────────── Konfiguration ───────────────────────────
// Server-seitiger zvg.com-Ingester (Pendant zu portal-ingest für zvg-portal.de).
// Quelle der Fachlogik: workspace/Grundstücke/Versteigerungen/marktscan_zvg_v2.py
// AZ-Normalisierung IDENTISCH zu portal-ingest, damit UNIQUE(az_norm, ag_company_id)
// Cross-Portal-Akten matcht statt dupliziert.

const TOKEN = Deno.env.get("INGEST_ZVGCOM_TOKEN") ?? "";
const BASE = "https://www.zvg.com";
const GETJSON = (bl: number) =>
  `${BASE}/v2024/termine.prg?act=getGridJson&id_b=${bl}&sort=a`;
const DETAIL = `${BASE}/v2024/termine.prg`;
const UA = "persiusufer-zvgcom/1.0";
const DOCUMENTS_BUCKET = "zvg-documents";
const BILDER_BUCKET = "zvg-bilder";

// Die 9 von zvg.com bedienten Bundesländer: id_b → state_abbr (Reihenfolge = Round-Robin)
const BL_TO_STATE: Record<number, string> = {
  2: "HH",
  3: "BE",
  4: "BW",
  5: "BB",
  6: "MV",
  8: "SH",
  9: "NI",
  10: "ST",
  12: "TH",
};
const BL_IDS = [2, 3, 4, 5, 6, 8, 9, 10, 12];

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ─────────────────────────── AZ / Parsing ───────────────────────────
// azNormV2/azCanon/azJahr 1:1 aus portal-ingest (Cross-Portal-Match).
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
function parseTermin(date?: string, time?: string) {
  if (!date || !time) return null;
  const m = date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const t = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m || !t) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${t[1].padStart(2, "0")}:${t[2]}:00+02:00`;
}
function parseAufnahmetag(s?: string) {
  if (!s) return null;
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
function splitOrtsteil(city?: string): [string | null, string | null] {
  if (!city) return [null, null];
  const m = city.match(/^(.+?)\s+OT\s+(.+)$/);
  return m ? [m[1].trim(), m[2].trim()] : [city, null];
}

// ─────────────────────────── HTTP (zvg.com) ───────────────────────────
async function getJson(url: string): Promise<any> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) {
      await r.arrayBuffer();
      return null;
    }
    return await r.json();
  } catch (_) {
    return null;
  }
}
async function getBytes(url: string): Promise<Uint8Array | null> {
  try {
    if (!url.startsWith("http")) url = BASE + url;
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) {
      await r.arrayBuffer();
      return null;
    }
    return new Uint8Array(await r.arrayBuffer());
  } catch (_) {
    return null;
  }
}
async function uploadStorage(
  bucket: string,
  path: string,
  content: Uint8Array,
  ctype: string,
) {
  const { error } = await supabase.storage.from(bucket).upload(path, content, {
    contentType: ctype,
    upsert: true,
    cacheControl: "3600",
  });
  return !error;
}
async function downloadUpload(
  srcUrl: string | undefined | null,
  bucket: string,
  dest: string,
  ctype: string,
) {
  if (!srcUrl) return null;
  const content = await getBytes(srcUrl);
  if (!content) return null;
  return (await uploadStorage(bucket, dest, content, ctype)) ? dest : null;
}
async function upsertDokument(
  zid: string,
  art: string,
  titel: string,
  storage_path: string,
  reihenfolge: number,
) {
  const { error } = await supabase
    .from("zvg_akte_dokumente")
    .upsert(
      {
        zid,
        art,
        titel,
        storage_path,
        bucket: DOCUMENTS_BUCKET,
        mime_type: "application/pdf",
        source: "zvg.com",
        reihenfolge,
      },
      { onConflict: "zid,storage_path" },
    );
  if (error) console.error("upsertDokument", zid, storage_path, error.message);
}

// ─────────────────────────── Akte → DB-Row ───────────────────────────
const SLIM_KEYS = [
  "id",
  "img",
  "az",
  "title",
  "street",
  "plz",
  "city",
  "vwert",
  "date",
  "time",
  "ag",
  "dateAdded",
  "gpreis",
  "gutachten",
  "gericht",
  "terminAufgehoben",
  "active",
];

function toRowBasic(a: any, agLookup: Map<string, number>, stateAbbr: string) {
  const az = a.az,
    ag = a.ag;
  if (!az || !ag) return null;
  const agId = agLookup.get(ag);
  if (!agId) return { __unknownAg: ag } as any;
  const title = a.title || "";
  const isTeilung =
    title.includes("Aufhebung der Gemeinschaft") || title.includes("Teilungs");
  const [ort, ortsteil] = splitOrtsteil(a.city);
  const slim: any = {};
  for (const k of SLIM_KEYS) slim[k] = a[k] ?? null;
  slim.source = "zvg.com";
  return {
    zid: String(a.id),
    az,
    az_norm: azNormV2(az),
    az_jahr: azJahr(az),
    ag_company_id: agId,
    ag_name_raw: ag,
    art: isTeilung ? "Teilungsversteigerung" : "Zwangsversteigerung",
    is_teilung: isTeilung,
    termin: parseTermin(a.date, a.time),
    termin_jahr: a.date ? parseInt(String(a.date).split(".").pop()!) : null,
    vkw_eur: a.vwert ?? null,
    gpreis_eur: a.gpreis ?? null,
    gutachten_url: a.gutachten || null,
    obj_titel: title,
    objekt_strasse: a.street ?? null,
    objekt_plz: a.plz ?? null,
    objekt_ort: ort,
    objekt_ortsteil: ortsteil,
    state_abbr: stateAbbr,
    raw_json: slim,
    _termin_aufgehoben: a.terminAufgehoben === 1,
  } as any;
}

// Detail-Fetch: getJSON/getGerichtID/getPDF/getPic/getGalleryPics → Felder + Storage.
async function enrichDetails(row: any) {
  const zid = row.zid;
  const j = await getJson(`${DETAIL}?act=getJSON&id=${zid}`);
  const g = await getJson(`${DETAIL}?act=getGerichtID&id=${zid}`);
  const p = await getJson(`${DETAIL}?act=getPDF&id=${zid}`);
  const pic = await getJson(`${DETAIL}?act=getPic&id=${zid}`);
  const gal = await getJson(`${DETAIL}?act=getGalleryPics&id=${zid}`);
  row.detail_json = {
    getJSON: j,
    getGerichtID: g,
    getPDF: p,
    getPic: pic,
    getGalleryPics: gal,
  };
  row.detail_fetched_at = new Date().toISOString();

  if (j && typeof j === "object") {
    row.objektart = ((j.Objektart || "") as string).trim() || null;
    if (j.Objektanschrift) row.objekt_anschrift = j.Objektanschrift;
    if (j.Saal) row.saal = j.Saal;
    if (j.Versteigerungsort)
      row.versteigerungsort_override = j.Versteigerungsort;
  }
  if (g && typeof g === "object") {
    row.aufnahmetag = parseAufnahmetag(g.aufnahmetag);
    if (!row.obj_titel && g.titel) row.obj_titel = g.titel;
  }
  if (p && typeof p === "object") {
    const docs: [string, string, string, string, number][] = [
      ["expose", "expose", "Exposé", "expose.pdf", 10],
      ["pdf", "anordnung", "Versteigerungsanordnung", "anordnung.pdf", 20],
      ["hinweis", "biethinweis", "Biethinweise (AG)", "biethinweis.pdf", 30],
      ["glaeubiger", "glaeubiger", "Gläubiger", "glaeubiger.pdf", 40],
    ];
    for (const [src, art, titel, fname, reihenfolge] of docs) {
      const saved = await downloadUpload(
        p[src],
        DOCUMENTS_BUCKET,
        `${zid}/${fname}`,
        "application/pdf",
      );
      if (saved) {
        row[`${art}_path`] = saved;
        await upsertDokument(zid, art, titel, saved, reihenfolge);
      }
    }
  }
  if (row.gpreis_eur === 0 && row.gutachten_url) {
    const saved = await downloadUpload(
      row.gutachten_url,
      DOCUMENTS_BUCKET,
      `${zid}/gutachten.pdf`,
      "application/pdf",
    );
    if (saved)
      await upsertDokument(zid, "gutachten", "Gutachten (kostenlos)", saved, 5);
  }
  if (pic && typeof pic === "object" && pic.path) {
    const saved = await downloadUpload(
      pic.path,
      BILDER_BUCKET,
      `${zid}/cover.jpg`,
      "image/jpeg",
    );
    if (saved) row.cover_bild_path = saved;
  }
  if (gal && typeof gal === "object" && Array.isArray(gal.data)) {
    const paths: string[] = [];
    for (let i = 0; i < gal.data.length; i++) {
      const saved = await downloadUpload(
        gal.data[i],
        BILDER_BUCKET,
        `${zid}/gallery_${i + 1}.jpg`,
        "image/jpeg",
      );
      if (saved) paths.push(saved);
    }
    if (paths.length) row.bilder_paths = paths;
  }
  return row;
}

// ─────────────────────────── Handler ───────────────────────────
Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (!TOKEN || u.searchParams.get("token") !== TOKEN)
    return new Response("forbidden", { status: 403 });
  const batch = parseInt(u.searchParams.get("batch") || "2"); // BLs pro Aufruf
  const budgetMs = parseInt(u.searchParams.get("budget_ms") || "100000");
  const t0 = Date.now();

  // AG-Lookup: companies(sector=Amtsgericht), key = Name ohne "Amtsgericht "
  const agLookup = new Map<string, number>();
  {
    const { data } = await supabase
      .from("companies")
      .select("id,name")
      .eq("sector", "Amtsgericht");
    for (const c of data ?? [])
      agLookup.set((c.name as string).replace(/^Amtsgericht /, ""), c.id);
  }
  if (!agLookup.size)
    return new Response(JSON.stringify({ error: "no ags" }), { status: 200 });

  // Match-Map az_norm|ag_company_id → zid  +  zidSet
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

  // Cursor-State (Round-Robin über die 9 BL)
  const { data: st } = await supabase
    .from("zvgcom_ingest_state")
    .select("cursor")
    .eq("id", 1)
    .single();
  const startCursor =
    (((st?.cursor ?? 0) % BL_IDS.length) + BL_IDS.length) % BL_IDS.length;

  const stats = {
    bls: [] as string[],
    cases_seen: 0,
    inserted: 0,
    updated: 0,
    enriched: 0,
    aufgehoben: 0,
    unknown_ag: 0,
    disappeared: 0,
    errors: 0,
  };
  const scannedZids = new Set<string>();
  const scannedStates: string[] = [];
  const aufgehobenExisting: string[] = [];

  let idx = startCursor;
  for (let n = 0; n < batch && n < BL_IDS.length; n++) {
    const bl = BL_IDS[idx];
    const stateAbbr = BL_TO_STATE[bl];
    scannedStates.push(stateAbbr);
    stats.bls.push(stateAbbr);
    const akten = (await getJson(GETJSON(bl))) || [];

    for (const a of akten) {
      const row = toRowBasic(a, agLookup, stateAbbr);
      if (!row) continue;
      if (row.__unknownAg) {
        stats.unknown_ag++;
        continue;
      }
      stats.cases_seen++;
      const newZid = row.zid;
      const existingZid =
        (row.az_norm && matchMap.get(row.az_norm + "|" + row.ag_company_id)) ||
        (zidSet.has(newZid) ? newZid : null);
      scannedZids.add(newZid);
      if (existingZid) scannedZids.add(existingZid);

      try {
        if (existingZid) {
          // UPDATE: nur volatile Felder; User-Felder unangetastet.
          const patch: any = {
            vkw_eur: row.vkw_eur,
            gpreis_eur: row.gpreis_eur,
            gutachten_url: row.gutachten_url,
            obj_titel: row.obj_titel,
            termin: row.termin,
            termin_jahr: row.termin_jahr,
            raw_json: row.raw_json,
            last_seen: new Date().toISOString(),
          };
          const { error } = await supabase
            .from("zvg_akte")
            .update(patch)
            .eq("zid", existingZid);
          if (error) stats.errors++;
          else stats.updated++;
          if (row._termin_aufgehoben) aufgehobenExisting.push(existingZid);
        } else {
          // NEU: Details holen (budgetabhängig), dann inserten.
          if (Date.now() - t0 < budgetMs) {
            try {
              await enrichDetails(row);
              stats.enriched++;
            } catch (_) {
              stats.errors++;
            }
          }
          const ins: any = {};
          for (const [k, v] of Object.entries(row))
            if (!k.startsWith("_") && k !== "__unknownAg") ins[k] = v;
          ins.first_seen = new Date().toISOString();
          ins.last_seen = new Date().toISOString();
          ins.status = row._termin_aufgehoben ? "aufgehoben" : "neu";
          if (row._termin_aufgehoben)
            ins.stop_reason = "Termin aufgehoben (zvg.com terminAufgehoben=1)";
          const { error } = await supabase.from("zvg_akte").insert(ins);
          if (error) stats.errors++;
          else {
            stats.inserted++;
            matchMap.set(row.az_norm + "|" + row.ag_company_id, newZid);
            zidSet.add(newZid);
          }
        }
      } catch (_) {
        stats.errors++;
      }
    }
    idx = (idx + 1) % BL_IDS.length;
  }

  // Termin-Aufhebungen für bestehende Akten (nur status=neu)
  if (aufgehobenExisting.length) {
    const { error } = await supabase
      .from("zvg_akte")
      .update({
        status: "aufgehoben",
        stop_reason: "Termin aufgehoben (zvg.com terminAufgehoben=1)",
      })
      .in("zid", aufgehobenExisting)
      .eq("status", "neu");
    if (!error) stats.aufgehoben += aufgehobenExisting.length;
  }

  // Disappeared: zvg.com-Akten (zid !~ '^p') in gescannten BL, status=neu, >48h nicht gesehen,
  // diesen Lauf nicht im Listing → aufgehoben. Portal-Akten bleiben unberührt.
  if (scannedStates.length) {
    const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { data: cand } = await supabase
      .from("zvg_akte")
      .select("zid")
      .eq("status", "neu")
      .lt("last_seen", cutoff)
      .in("state_abbr", scannedStates)
      .not("zid", "like", "p%");
    const gone = (cand ?? [])
      .map((r: any) => r.zid)
      .filter((z: string) => !scannedZids.has(z));
    if (gone.length) {
      const { error } = await supabase
        .from("zvg_akte")
        .update({
          status: "aufgehoben",
          stop_reason: "Termin nicht mehr auf zvg.com (Marktscan)",
        })
        .in("zid", gone);
      if (!error) stats.disappeared = gone.length;
    }
  }

  await supabase
    .from("zvgcom_ingest_state")
    .update({
      cursor: idx,
      last_run: new Date().toISOString(),
      last_stats: stats as any,
    })
    .eq("id", 1);

  return new Response(
    JSON.stringify(
      { start_cursor: startCursor, next_cursor: idx, ...stats },
      null,
      2,
    ),
    { headers: { "Content-Type": "application/json" } },
  );
});
