// Ingest A1: versteigerungspool.de -> zvg_akte (nur Fälle, die wir noch NICHT
// haben). Dedupe per (Gericht, az_norm) gegen Bestand + Unique-Constraint.
// Holt je neuem Fall die Detailseite (Termin/VKW/Versteigerungsart + Original-
// TAB.pdf). STANDARD: Dry-Run (keine Schreibzugriffe). Mit --execute werden
// Akten eingefügt, TAB.pdf in Storage geladen + per pdftotext zu Text.
//
//   node tools/ingest-versteigerungspool.mjs           # Dry-Run
//   node tools/ingest-versteigerungspool.mjs --execute # schreibt
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXECUTE = process.argv.includes("--execute");
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const DB = env.SUPABASE_URL || "https://ujiiaqvwpnniaasdhyrb.supabase.co";
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SRK, Authorization: `Bearer ${SRK}` };
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BASE = "https://versteigerungspool.de";
const TMP = mkdtempSync(join(tmpdir(), "vping-"));
const LAND_ABBR = { "Baden-Württemberg": "BW", Bayern: "BY", Berlin: "BE", Brandenburg: "BB", Bremen: "HB", Hamburg: "HH", Hessen: "HE", "Mecklenburg-Vorpommern": "MV", Niedersachsen: "NI", "Nordrhein-Westfalen": "NW", "Rheinland-Pfalz": "RP", Saarland: "SL", Sachsen: "SN", "Sachsen-Anhalt": "ST", "Schleswig-Holstein": "SH", Thüringen: "TH" };

function azNorm(az) { const s = az.toLowerCase().replace(/\s+/g, ""); const m = s.match(/^0*(\d+)k0*(\d+)[-/](\d+)$/); if (!m) return s.replace(/\//g, "-"); let [, p, n, y] = m; if (y.length === 4) y = y.slice(2); return `${p}k${n}-${y}`; }
const courtNorm = (n) => n.toLowerCase().replace(/^amtsgericht\s+/, "").replace(/^berlin\s*-?\s*/, "").replace(/\(.*?\)/g, " ").replace(/vollstreckungsgericht/g, " ").replace(/[^a-zäöüß]/g, "");
const validPlz = (p) => !!p && /^\d{5}$/.test(String(p).trim()) && String(p).trim() !== "00000";
const strip = (h) => h.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&euro;/g, "€").replace(/\s+/g, " ");
async function get(url) { for (let t = 0; t < 3; t++) { try { const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9" } }); if (r.ok) return await r.text(); } catch { /**/ } } return ""; }
async function pool(items, n, fn) { const res = []; let i = 0, done = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const idx = i++; const r = await fn(items[idx]); if (r != null) res.push(...(Array.isArray(r) ? r : [r])); if (++done % 40 === 0) console.log(`  ... ${done}/${items.length}`); } })); return res; }

// Namens-Varianten -> Company-ID (verhindert Dublett-Companies)
const OVERRIDE = { freiburg: 695, heidenheim: 701, ludwigshafen: 197 };

// ---- Bestand laden ----
// Dedup-Schlüssel:
//  - az_norm + PLZ  -> Objekt-Identität, gilt überall (entscheidend für Berlin,
//    wo dieselbe Abteilungs-Nr 30K/70K bei mehreren Gerichten für VERSCHIEDENE
//    Fälle vorkommt -> nur PLZ trennt sie).
//  - companyId + az_norm -> Fallback (Akten ohne PLZ), nur Nicht-Berlin
//    (Berliner Gerichts-Labels sind quellenabhängig unzuverlässig).
async function loadOur() {
  const byNorm = new Map();
  for (let off = 0; ; off += 1000) { const r = await fetch(`${DB}/rest/v1/companies?select=id,name&sector=eq.Amtsgericht&limit=1000&offset=${off}`, { headers: H }); const rows = await r.json(); if (!Array.isArray(rows) || !rows.length) break; for (const c of rows) if (c.name) byNorm.set(courtNorm(c.name), c.id); if (rows.length < 1000) break; }
  // WICHTIG: az frisch aus dem Roh-`az` normalisieren (DB hat zwei az_norm-
  // Formate: "1k9-24" UND "0001kk0009-2024" -> gespeichertes az_norm unbrauchbar).
  const azPlz = new Set(), compAz = new Set(), plzTermin = new Set();
  for (let off = 0; ; off += 1000) { const r = await fetch(`${DB}/rest/v1/zvg_akte?select=az,ag_company_id,objekt_plz,termin&limit=1000&offset=${off}`, { headers: H }); const rows = await r.json(); if (!Array.isArray(rows) || !rows.length) break; for (const a of rows) { if (!a.az) continue; const an = azNorm(a.az); compAz.add(a.ag_company_id + "|" + an); const p = a.objekt_plz && String(a.objekt_plz).trim(); if (validPlz(p)) { azPlz.add(an + "|" + p); if (a.termin) plzTermin.add(p + "|" + a.termin.slice(0, 10)); } } if (rows.length < 1000) break; }
  function matchCourt(gericht, land) {
    const n = courtNorm(gericht);
    if (byNorm.has(n)) return byNorm.get(n);
    if (OVERRIDE[n]) return OVERRIDE[n];
    if (n === "landau" && land === "Rheinland-Pfalz") return 537;
    const cand = [...byNorm.entries()].filter(([cn]) => cn.startsWith(n) || n.startsWith(cn));
    return cand.length === 1 ? cand[0][1] : null;
  }
  return { azPlz, compAz, plzTermin, matchCourt };
}

// ---- Gerichtsseite -> Cards {slug, gericht, az, land} ----
function parseCards(html, land) {
  const out = [];
  for (const seg of html.split(/<a href="\/zwangsversteigerungen\//).slice(1)) {
    const slugM = seg.match(/^([a-z0-9._-]+\.\d+)"/);
    // title="{Objektart} - Zwangsversteigerung in {PLZ} {Ort}"
    const tM = seg.match(/title="([^"]*?)\s*-\s*Zwangsversteigerung in\s*(\d{5})\s*([^"]*)"/i);
    const ca = strip(seg.slice(0, 1600)).match(/Amtsgericht\s+([A-Za-zÄÖÜäöüß.\-() ]+?):\s*(\d{1,3}\s?K\s?\d{1,4}\/\d{2,4})/);
    if (slugM && ca) out.push({ slug: slugM[1], gericht: ca[1].trim(), az: ca[2].replace(/\s+/g, " ").trim(), objektart: tM?.[1]?.trim() || null, plz: tM?.[2] || null, ort: tM?.[3]?.trim() || null, land });
  }
  return out;
}
async function scrapeCourt(path, land) {
  const seen = new Map();
  for (let page = 1; page <= 20; page++) { const html = await get(`${BASE}${path}?page=${page}`); if (!html) break; let neu = 0; for (const c of parseCards(html, land)) { const k = courtNorm(c.gericht) + "|" + azNorm(c.az); if (!seen.has(k)) { seen.set(k, c); neu++; } } if (!neu) break; }
  return [...seen.values()];
}

// ---- Detailseite -> Felder + TAB.pdf ----
function parseDetail(html, card) {
  const t = strip(html);
  const vkwM = t.match(/Verkehrswert\s*([\d.]+,\d{2})\s*€/);
  const terM = t.match(/Versteigerungstermin\s*([\d.]+),?\s*([\d:]+)?/);
  const artM = t.match(/Versteigerungsart\s*([A-Za-zäöüß ]+?)\s*(Wertgrenzen|Aktenzeichen|Amtliche)/);
  const objM = t.match(/handelt es sich um:?\s*([^.]{3,80})/i);
  const titleM = html.match(/title="([^"]*)\s*-\s*Zwangsversteigerung in\s*(\d{5})\s*([^"]*)"/i);
  const pdfM = html.match(/href="(https:\/\/upload\.immobilienpool\.de\/[^"]+\.pdf)"/i);
  let termin = null;
  if (terM) { const [d, m, y] = terM[1].split("."); termin = `${y}-${m}-${d}T${(terM[2] || "00:00")}:00+02:00`; }
  const art = (artM?.[1] || "").toLowerCase();
  return {
    detailId: card.slug.split(".").pop(),
    objektart: titleM?.[1]?.trim() || objM?.[1]?.trim() || null,
    plz: titleM?.[2] || null,
    ort: titleM?.[3]?.trim() || null,
    termin,
    vkw: vkwM ? Number(vkwM[1].replace(/\./g, "").replace(",", ".")) : null,
    is_teilung: /teilung|aufhebung/.test(art),
    tabPdf: pdfM?.[1] || null,
  };
}

// ===== Lauf =====
console.log(EXECUTE ? "MODUS: EXECUTE (schreibt!)" : "MODUS: DRY-RUN");
console.log("Lade Bestand ...");
const { azPlz, compAz, plzTermin, matchCourt } = await loadOur();
console.log(`Dedup-Keys: az+PLZ ${azPlz.size}, Gericht+az ${compAz.size}, PLZ+Termin ${plzTermin.size}`);

const idx = await get(`${BASE}/amtsgerichte/bundeslaender`);
const pathToLand = {};
for (const sec of idx.split(/<h3 id="/).slice(1)) { const slug = sec.slice(0, sec.indexOf('"')); const land = (sec.match(/alt="([^"]+)"/)?.[1] || slug).trim(); for (const p of sec.match(/\/amtsgerichte\/[a-z0-9._-]+\.\d+\/zwangsversteigerungen/gi) || []) if (!pathToLand[p]) pathToLand[p] = land; }
const courts = [...new Set((idx.match(/\/amtsgerichte\/[a-z0-9._-]+\.\d+\/zwangsversteigerungen/gi) || []))];
console.log(`Scrape ${courts.length} Gerichtsseiten ...`);
const cards = await pool(courts, 8, (p) => scrapeCourt(p, pathToLand[p] || "?"));

let skippedBerlinNoPlz = 0;
const missingCards = cards.filter((c) => {
  c._abbr = LAND_ABBR[c.land] ?? "?";
  c._compId = matchCourt(c.gericht, c.land);
  // Berlin ohne valide PLZ -> dedup-unsicher (Gerichts-Label unzuverlässig) -> NICHT einfügen.
  if (c.land === "Berlin" && !validPlz(c.plz)) { skippedBerlinNoPlz++; return false; }
  const k1 = validPlz(c.plz) ? azPlz.has(azNorm(c.az) + "|" + c.plz) : false; // Objekt-Identität
  // Gericht+az_norm zusätzlich bei Nicht-Berlin (dort Gericht zuverlässig)
  const k2 = c.land !== "Berlin" && c._compId ? compAz.has(c._compId + "|" + azNorm(c.az)) : false;
  return !(k1 || k2);
});
console.log(`\nFehlende Fälle: ${missingCards.length} (Berlin ohne valide PLZ übersprungen: ${skippedBerlinNoPlz}). Hole Detailseiten ...`);

let rows = await pool(missingCards, 8, async (card) => {
  const html = await get(`${BASE}/zwangsversteigerungen/${card.slug}`);
  if (!html) return null;
  const d = parseDetail(html, card);
  return { card, d, compId: card._compId };
});

// Zusätzliches Netz: gleiche PLZ + gleicher Termin -> selbe Sache (az evtl. anders erfasst).
const beforeTermin = rows.length;
rows = rows.filter((r) => {
  const td = (r.d.termin || "").slice(0, 10);
  return !(validPlz(r.card.plz) && td && plzTermin.has(r.card.plz + "|" + td));
});
const removedByTermin = beforeTermin - rows.length;
console.log(`Per (PLZ+Termin) zusätzlich aussortiert: ${removedByTermin}`);

const matched = rows.filter((r) => r.compId);
const noCourt = rows.filter((r) => !r.compId);
const withPdf = rows.filter((r) => r.d.tabPdf);
const noTermin = rows.filter((r) => !r.d.termin);
const unmatchedCourts = [...new Set(noCourt.map((r) => r.card.gericht))];

console.log("\n===== DRY-RUN ERGEBNIS =====");
console.log(`Neue Fälle gesamt:        ${rows.length}`);
console.log(`  Gericht gematcht:       ${matched.length}`);
console.log(`  Gericht NICHT gematcht: ${noCourt.length}  (Companies anzulegen: ${unmatchedCourts.length})`);
console.log(`  mit TAB.pdf:            ${withPdf.length}`);
console.log(`  ohne Termin (parse?):  ${noTermin.length}`);
if (unmatchedCourts.length) console.log(`Nicht gematchte Gerichte: ${unmatchedCourts.slice(0, 20).join(", ")}`);
console.log("\nBeispiel-Zeilen:");
for (const r of matched.slice(0, 5)) console.log(`  vp${r.d.detailId} | ${r.card.gericht} | ${r.card.az} | ${r.d.termin} | VKW ${r.d.vkw ?? "—"} | ${r.d.objektart ?? "?"} ${r.d.plz ?? ""} | pdf:${r.d.tabPdf ? "ja" : "nein"}`);
writeFileSync("tools/.versteigerungspool-ingest.json", JSON.stringify({ neu: rows.length, matched: matched.length, noCourt: noCourt.length, unmatchedCourts, rows: rows.map((r) => ({ zid: "vp" + r.d.detailId, az: r.card.az, gericht: r.card.gericht, compId: r.compId, land: r.card.land, plz: r.card.plz, ort: r.card.ort, objektart: r.card.objektart, termin: r.d.termin, vkw: r.d.vkw, is_teilung: r.d.is_teilung, tabPdf: r.d.tabPdf, slug: r.card.slug })) }, null, 2));
console.log("\nDetails -> tools/.versteigerungspool-ingest.json");

if (!EXECUTE) { console.log("\n(Dry-Run — keine Schreibzugriffe. Mit --execute ausführen.)"); process.exit(0); }

// ===== EXECUTE =====
console.log("\n>>> EXECUTE: schreibe Akten + lade TAB.pdf ...");
let ins = 0, pdf = 0, txt = 0, skip = 0, err = 0;
for (const r of matched) {
  const zid = "vp" + r.d.detailId;
  const row = {
    zid, az: r.card.az, az_norm: azNorm(r.card.az), ag_company_id: r.compId,
    state_abbr: LAND_ABBR[r.card.land] ?? null, status: "neu", termin: r.d.termin,
    vkw_eur: r.d.vkw, quellen: ["versteigerungspool.de"], is_teilung: r.d.is_teilung,
    obj_titel: r.card.objektart || r.d.objektart,
    objekt_plz: r.card.plz || r.d.plz, objekt_ort: r.card.ort || r.d.ort,
    objektart: r.card.objektart || r.d.objektart,
    first_seen: new Date().toISOString(),
    raw_json: { source: "versteigerungspool.de", slug: r.card.slug, plz: r.card.plz, ort: r.card.ort, ...r.d },
  };
  // Insert mit Konflikt-Ignorieren (Gericht+az_norm bzw. zid Unique)
  const resp = await fetch(`${DB}/rest/v1/zvg_akte?on_conflict=ag_company_id,az_norm`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
  if (resp.status === 409) { skip++; continue; }
  if (!resp.ok) { err++; continue; }
  ins++;
  // TAB.pdf -> Storage + Doc + Text
  if (r.d.tabPdf) {
    try {
      const pr = await fetch(r.d.tabPdf, { headers: { "User-Agent": UA } });
      if (pr.ok) {
        const buf = Buffer.from(await pr.arrayBuffer());
        if (buf.length > 1000) {
          const path = `${zid}/bekanntmachung.pdf`;
          const up = await fetch(`${DB}/storage/v1/object/zvg-documents/${path}`, { method: "POST", headers: { ...H, "Content-Type": "application/pdf", "x-upsert": "true" }, body: buf });
          if (up.ok) {
            pdf++;
            await fetch(`${DB}/rest/v1/zvg_akte_dokumente`, { method: "POST", headers: { ...H, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ zid, art: "bekanntmachung", titel: "Amtliche Bekanntmachung (Terminsbestimmung)", storage_path: path, bucket: "zvg-documents", mime_type: "application/pdf", size_bytes: buf.length, source: "versteigerungspool.de" }) });
            const f = join(TMP, "x.pdf"); writeFileSync(f, buf);
            let text = ""; try { text = execFileSync("pdftotext", ["-layout", f, "-"], { maxBuffer: 50 * 1024 * 1024 }).toString(); } catch { /**/ }
            if (text.replace(/\s/g, "").length > 300) { txt++; await fetch(`${DB}/rest/v1/zvg_akte_dokumente?zid=eq.${zid}&art=eq.bekanntmachung`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ volltext: text, volltext_am: new Date().toISOString() }) }); await fetch(`${DB}/rest/v1/zvg_akte?zid=eq.${zid}`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ bekanntmachung_text: text, bekanntmachung_text_am: new Date().toISOString() }) }); }
          }
        }
      }
    } catch { /**/ }
  }
  if (ins % 25 === 0) console.log(`  ... eingefügt ${ins}, pdf ${pdf}, text ${txt}`);
}
console.log(`\nFERTIG: eingefügt ${ins}, übersprungen(Dublette) ${skip}, Fehler ${err}, PDF ${pdf}, Text ${txt}`);
