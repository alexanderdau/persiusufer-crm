// Backfill: lädt Bekanntmachungs-PDFs (volltext IS NULL) aus dem Storage,
// extrahiert Text per pdftotext und schreibt zvg_akte_dokumente.volltext.
// Gratis (kein Haiku). Echte Scans (kein Text) bleiben volltext=NULL ->
// Haiku-Vision-Fallback separat. Idempotent, parallel.
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const URL = env.SUPABASE_URL || "https://ujiiaqvwpnniaasdhyrb.supabase.co";
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SRK, Authorization: `Bearer ${SRK}` };
const TMP = mkdtempSync(join(tmpdir(), "bekbf-"));
const TEXT_MIN = 300;

async function listDocs() {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(
      `${URL}/rest/v1/zvg_akte_dokumente?art=eq.bekanntmachung&volltext=is.null&select=zid,storage_path&order=zid&limit=1000&offset=${off}`,
      { headers: H },
    );
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function one(doc, idx) {
  try {
    const r = await fetch(
      `${URL}/storage/v1/object/zvg-documents/${doc.storage_path}`,
      { headers: H },
    );
    if (!r.ok) return "error";
    const buf = Buffer.from(await r.arrayBuffer());
    const f = join(TMP, `w${idx % 24}.pdf`);
    writeFileSync(f, buf);
    let txt = "";
    try {
      txt = execFileSync("pdftotext", ["-layout", f, "-"], {
        maxBuffer: 50 * 1024 * 1024,
      }).toString();
    } catch {
      txt = "";
    }
    if (txt.replace(/\s/g, "").length <= TEXT_MIN) return "scan"; // -> Haiku-Fallback
    const up = await fetch(
      `${URL}/rest/v1/zvg_akte_dokumente?zid=eq.${encodeURIComponent(doc.zid)}&art=eq.bekanntmachung`,
      {
        method: "PATCH",
        headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ volltext: txt, volltext_am: new Date().toISOString() }),
      },
    );
    return up.ok ? "text" : "error";
  } catch {
    return "error";
  }
}

async function pool(items, n, fn) {
  let i = 0, done = 0;
  const counts = { text: 0, scan: 0, error: 0 };
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        counts[await fn(items[idx], idx)]++;
        if (++done % 200 === 0)
          console.log(`  ... ${done}/${items.length} (text ${counts.text}, scan ${counts.scan}, err ${counts.error})`);
      }
    }),
  );
  return counts;
}

console.log("Liste offene Bekanntmachungen (volltext IS NULL) ...");
const docs = await listDocs();
console.log(`${docs.length} zu verarbeiten.`);
const c = await pool(docs, 8, one);
console.log("\n===== BACKFILL FERTIG =====");
console.log(`Text gespeichert: ${c.text}`);
console.log(`Scans (offen für Haiku): ${c.scan}`);
console.log(`Fehler: ${c.error}`);
