import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Lädt die amtliche Bekanntmachung (Terminmitteilung-PDF) von zvg-portal.de für
// Portal-Akten herunter -> Storage zvg-documents/{zid}/bekanntmachung.pdf +
// Eintrag in zvg_akte_dokumente (art='bekanntmachung', source='zvg-portal.de').
// Der showAnhang-Link (file_id) steckt im Listing; die BL-Suche primed die
// Session, danach lädt showAnhang das PDF. Idempotent (nur fehlende), je BL eine
// Suche, budget-gedeckelt -> backfill über mehrere Läufe.

const TOKEN = "panhang-4t7p2x9k";
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

function azNormV2(az: string) {
  const s = az
    .toLowerCase()
    .trim()
    .replace(/&nbsp;/g, " ")
    .replace(/ /g, "");
  const m = s.match(/^0*(\d+)k0*(\d+)[-/](\d+)$/);
  if (!m) return s.replace(/\//g, "-");
  let [, p, n, y] = m;
  if (y.length === 4) y = y.slice(2);
  return `${p}k${n}-${y}`;
}

// BL-Suche -> {az_norm: {zvg_id, file_id, land}}; mehrdeutige az_norm raus.
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
  const map = new Map<string, any>();
  const cnt = new Map<string, number>();
  for (const blob of html
    .split("<a target=blank_ href=index.php?button=showZvg")
    .slice(1)) {
    const mAz = blob.match(/<nobr>([\d\sK\/]+?)&nbsp;\(Detailansicht\)/);
    const mAnh = blob.match(
      /\?button=showAnhang&land_abk=(\w+)&file_id=(\d+)&zvg_id=(\d+)/,
    );
    if (!mAz || !mAnh) continue;
    const k = azNormV2(mAz[1]);
    cnt.set(k, (cnt.get(k) ?? 0) + 1);
    map.set(k, { land: mAnh[1], file_id: mAnh[2], zvg_id: mAnh[3] });
  }
  for (const [k, c] of cnt) if (c > 1) map.delete(k);
  return map;
}

async function loadAll(table: string, select: string) {
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
  const limit = parseInt(u.searchParams.get("limit") || "120");
  const t0 = Date.now();
  const budgetMs = 110000;

  // Schon vorhandene Bekanntmachungen (idempotent überspringen).
  const bek = new Set<string>();
  for (let off = 0; ; off += 1000) {
    const { data } = await supabase
      .from("zvg_akte_dokumente")
      .select("zid")
      .eq("art", "bekanntmachung")
      .range(off, off + 999);
    if (!data || !data.length) break;
    for (const d of data as any[]) bek.add(d.zid);
    if (data.length < 1000) break;
  }
  const akten = (
    await loadAll(
      "zvg_akte",
      "zid,az_norm,state_abbr,zvg_portal_id,termin,status",
    )
  ).filter(
    (a: any) =>
      a.zvg_portal_id != null &&
      a.status !== "aufgehoben" &&
      a.az_norm &&
      a.state_abbr &&
      a.termin &&
      new Date(a.termin) > new Date() &&
      !bek.has(a.zid),
  );

  const groups = new Map<string, any[]>();
  for (const a of akten)
    (
      groups.get(a.state_abbr) ??
      groups.set(a.state_abbr, []).get(a.state_abbr)!
    ).push(a);

  await fetch(BASE + "/index.php", {
    headers: { "User-Agent": UA, ...AC },
  }).then((r) => r.text());
  await fetch(BASE + "/index.php?button=Termine%20suchen", {
    headers: { "User-Agent": UA, ...AC },
  }).then((r) => r.text());

  const st: Record<string, number> = {
    laender: 0,
    kandidaten: akten.length,
    geladen: 0,
    kein_link: 0,
    fehler: 0,
  };

  outer: for (const [state, rows] of groups) {
    const land = STATE_TO_LAND[state];
    if (!land) continue;
    let map: Map<string, any>;
    try {
      map = await searchLand(land);
    } catch (_) {
      st.fehler++;
      continue;
    }
    st.laender++;
    for (const a of rows) {
      if (st.geladen >= limit || Date.now() - t0 > budgetMs) break outer;
      const hit = map.get(a.az_norm);
      if (!hit) {
        st.kein_link++;
        continue;
      }
      try {
        // showAnhang braucht vorher die geladene Detailseite (showZvg) als Kontext.
        const detUrl =
          BASE +
          `/index.php?button=showZvg&zvg_id=${hit.zvg_id}&land_abk=${hit.land}`;
        await fetch(detUrl, {
          headers: {
            "User-Agent": UA,
            Referer: BASE + "/index.php?button=Suchen",
            ...AC,
          },
        }).then((r) => r.text());
        const pr = await fetch(
          BASE +
            `/index.php?button=showAnhang&land_abk=${hit.land}&file_id=${hit.file_id}&zvg_id=${hit.zvg_id}`,
          {
            headers: {
              "User-Agent": UA,
              Referer: detUrl,
              ...AC,
            },
          },
        );
        const ct = pr.headers.get("content-type") || "";
        const buf = new Uint8Array(await pr.arrayBuffer());
        if (!ct.includes("pdf") || buf.length < 1000) {
          st.fehler++;
          continue;
        }
        const path = `${a.zid}/bekanntmachung.pdf`;
        const up = await supabase.storage
          .from("zvg-documents")
          .upload(path, buf, {
            contentType: "application/pdf",
            upsert: true,
          });
        const { error } = up.error
          ? { error: null }
          : await supabase.from("zvg_akte_dokumente").upsert(
              {
                zid: a.zid,
                art: "bekanntmachung",
                titel: "Amtliche Bekanntmachung (Terminmitteilung)",
                storage_path: path,
                bucket: "zvg-documents",
                mime_type: "application/pdf",
                size_bytes: buf.length,
                source: "zvg-portal.de",
              },
              { onConflict: "zid,storage_path", ignoreDuplicates: true },
            );
        if (up.error) {
          st.fehler++;
          continue;
        }
        if (error) st.fehler++;
        else st.geladen++;
      } catch (_) {
        st.fehler++;
      }
    }
  }
  return new Response(JSON.stringify(st, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
