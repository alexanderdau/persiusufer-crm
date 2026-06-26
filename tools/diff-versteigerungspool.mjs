// Scrapt versteigerungspool.de (alle Amtsgerichte) und vergleicht gegen unsere
// zvg_akte: welche aktiven Fälle hat versteigerungspool, die wir NICHT haben?
// Match per (Gerichtsname normalisiert, az_norm). Reiner Lesezugriff.
// Ausgabe -> tools/.versteigerungspool-diff.json
import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n").filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const DB = env.SUPABASE_URL || "https://ujiiaqvwpnniaasdhyrb.supabase.co";
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SRK, Authorization: `Bearer ${SRK}` };
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BASE = "https://versteigerungspool.de";

function azNorm(az) {
  const s = az.toLowerCase().replace(/\s+/g, "");
  const m = s.match(/^0*(\d+)k0*(\d+)[-/](\d+)$/);
  if (!m) return s.replace(/\//g, "-");
  let [, p, n, y] = m; if (y.length === 4) y = y.slice(2);
  return `${p}k${n}-${y}`;
}
const courtNorm = (n) =>
  n.toLowerCase()
    .replace(/^amtsgericht\s+/, "")
    .replace(/^berlin\s*-?\s*/, "")      // VP: "Berlin-Charlottenburg" -> "charlottenburg"
    .replace(/\(.*?\)/g, " ")            // "(Bayern)", "(Saale)"
    .replace(/vollstreckungsgericht/g, " ")
    .replace(/[^a-zäöüß]/g, "");         // nur Buchstaben: "Baden-Baden" -> "badenbaden"

async function get(url) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9" } });
      if (r.ok) return await r.text();
    } catch { /* retry */ }
  }
  return "";
}

function stripText(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}

// Listings aus einer Gerichtsseite extrahieren.
// Gericht-Klasse OHNE Ziffern -> kann nicht über ein vorheriges Listing spannen.
// VKW optional (manche: "siehe Gutachten").
const LISTING_RE = /Amtsgericht\s+([A-Za-zÄÖÜäöüß.\-() ]+?):\s*(\d{1,3}\s?K\s?\d{1,4}\/\d{2,4})\s+Versteigerungstermin:\s*([\d.]+)(?:[,\s]*([\d:]+)\s*Uhr)?(?:\s+Verkehrswert:\s*(ab\s*)?([\d.]+,\d{2}|siehe Gutachten))?/g;
function parseListings(text) {
  const out = [];
  let m;
  LISTING_RE.lastIndex = 0;
  while ((m = LISTING_RE.exec(text))) {
    out.push({
      gericht: m[1].trim(),
      az: m[2].replace(/\s+/g, " ").trim(),
      termin: m[3],
      vkw: m[6] || "—",
      ab: !!m[5],
    });
  }
  return out;
}

async function scrapeCourt(path, land) {
  const seen = new Map();
  for (let page = 1; page <= 20; page++) {
    const url = `${BASE}${path}?page=${page}`;
    const html = await get(url);
    if (!html) break;
    const items = parseListings(stripText(html));
    let neu = 0;
    for (const it of items) {
      const key = courtNorm(it.gericht) + "|" + azNorm(it.az);
      if (!seen.has(key)) { it.land = land; seen.set(key, it); neu++; }
    }
    if (neu === 0) break; // keine neuen -> Ende der Paginierung
  }
  return [...seen.values()];
}

async function loadOurSet() {
  // companies (Amtsgerichte) id -> court_norm
  const comp = new Map();
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${DB}/rest/v1/companies?select=id,name&sector=eq.Amtsgericht&limit=1000&offset=${off}`, { headers: H });
    const rows = await r.json(); if (!Array.isArray(rows) || !rows.length) break;
    for (const c of rows) if (c.name) comp.set(c.id, courtNorm(c.name));
    if (rows.length < 1000) break;
  }
  // aktive akten -> Set(court_norm|az_norm) UND Set der von uns abgedeckten Gerichte
  const set = new Set();
  const ourCourts = new Set();
  const nowIso = new Date().toISOString();
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${DB}/rest/v1/zvg_akte?select=az_norm,ag_company_id,termin,status&termin=gt.${nowIso}&status=neq.aufgehoben&limit=1000&offset=${off}`, { headers: H });
    const rows = await r.json(); if (!Array.isArray(rows) || !rows.length) break;
    for (const a of rows) {
      if (!a.az_norm) continue;
      const cn = comp.get(a.ag_company_id);
      if (cn) { set.add(cn + "|" + a.az_norm); ourCourts.add(cn); }
    }
    if (rows.length < 1000) break;
  }
  return { set, ourCourts };
}

async function pool(items, n, fn) {
  const res = []; let i = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      res.push(...(await fn(items[idx])));
      if (++done % 40 === 0) console.log(`  ... ${done}/${items.length} Gerichte`);
    }
  }));
  return res;
}

console.log("Lade unsere aktiven Akten ...");
const { set: ourSet, ourCourts } = await loadOurSet();
console.log(`Unsere aktiven Akten (Gericht|az_norm): ${ourSet.size}, abgedeckte Gerichte: ${ourCourts.size}`);

console.log("Hole Gerichts-Index ...");
const idx = await get(`${BASE}/amtsgerichte/bundeslaender`);
// Bundesland je Gerichts-Pfad: Index ist nach <h3 id="bundesland"> gegliedert.
const pathToLand = {};
for (const sec of idx.split(/<h3 id="/).slice(1)) {
  const slug = sec.slice(0, sec.indexOf('"'));
  const land = (sec.match(/alt="([^"]+)"/)?.[1] || slug).trim();
  for (const p of sec.match(/\/amtsgerichte\/[a-z0-9._-]+\.\d+\/zwangsversteigerungen/gi) || [])
    if (!pathToLand[p]) pathToLand[p] = land;
}
const courts = [...new Set((idx.match(/\/amtsgerichte\/[a-z0-9._-]+\.\d+\/zwangsversteigerungen/gi) || []))];
console.log(`${courts.length} Gerichte, ${new Set(Object.values(pathToLand)).size} Bundesländer. Scrape ...`);

const all = await pool(courts, 8, (p) => scrapeCourt(p, pathToLand[p] || "?"));
console.log(`\nGesamt-Listings auf versteigerungspool: ${all.length}`);

// Klassifikation je Listing (Match per Gericht+AZ — kollisionsfest)
const have = [], missUncovered = [], missCovered = [];
for (const it of all) {
  const cn = courtNorm(it.gericht);
  if (ourSet.has(cn + "|" + azNorm(it.az))) have.push(it);
  else if (ourCourts.has(cn)) missCovered.push(it); // Gericht decken wir ab, dieser Fall fehlt
  else missUncovered.push(it);                       // Gericht haben wir gar nicht
}
const missing = [...missCovered, ...missUncovered];

const byCourt = {};
for (const m of missing) (byCourt[m.gericht] ??= []).push(`${m.az} · ${m.termin} · ${m.ab ? "ab " : ""}${m.vkw} €`);

// pro Bundesland: gesamt vs. fehlend
const byLand = {};
for (const it of all) {
  const L = (byLand[it.land] ??= { gesamt: 0, fehlen: 0 });
  L.gesamt++;
}
for (const m of missing) byLand[m.land].fehlen++;

console.log("\n===== ERGEBNIS =====");
console.log(`Listings gesamt:                  ${all.length}`);
console.log(`Haben wir (Gericht+AZ):           ${have.length}`);
console.log(`FEHLEN uns gesamt:                ${missing.length}`);
console.log(`  davon an Gerichten, die wir abdecken: ${missCovered.length}`);
console.log(`  davon an Gerichten OHNE Abdeckung:     ${missUncovered.length}`);

console.log("\n===== FEHLEND PRO BUNDESLAND =====");
for (const [land, v] of Object.entries(byLand).sort((a, b) => b[1].fehlen - a[1].fehlen))
  console.log(`  ${land.padEnd(24)} ${String(v.fehlen).padStart(4)} / ${v.gesamt}`);

const top = Object.entries(byCourt).sort((a, b) => b[1].length - a[1].length).slice(0, 12);
console.log("\nTop-Gerichte mit fehlenden Fällen:");
for (const [g, list] of top) console.log(`  ${g}: ${list.length}`);
writeFileSync("tools/.versteigerungspool-diff.json", JSON.stringify({ gesamt: all.length, haben: have.length, fehlen: missing.length, fehlen_abgedeckte_gerichte: missCovered.length, fehlen_unabgedeckte_gerichte: missUncovered.length, nach_bundesland: byLand, nach_gericht: byCourt }, null, 2));
console.log("\nDetails -> tools/.versteigerungspool-diff.json");
