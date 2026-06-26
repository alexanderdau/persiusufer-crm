// Lädt ALLE Bekanntmachungs-PDFs aus dem Storage und misst die Textebene
// (pdftotext). Klassifiziert Text-PDF vs. Scan. Reiner Diagnose-Lauf, keine
// DB-Schreibzugriffe. Ergebnis -> tools/.bekanntmachung-text-report.json
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
const TMP = mkdtempSync(join(tmpdir(), "bek-"));
const TEXT_MIN = 300; // nicht-Whitespace-Zeichen -> als Text-PDF werten

async function listDocs() {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(
      `${URL}/rest/v1/zvg_akte_dokumente?art=eq.bekanntmachung&select=zid,storage_path&order=zid&limit=1000&offset=${off}`,
      { headers: H },
    );
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function checkOne(doc, idx) {
  try {
    const r = await fetch(
      `${URL}/storage/v1/object/zvg-documents/${doc.storage_path}`,
      { headers: H },
    );
    if (!r.ok) return { zid: doc.zid, kind: "error", reason: `http_${r.status}`, chars: 0 };
    const buf = Buffer.from(await r.arrayBuffer());
    const f = join(TMP, `w${idx % 32}.pdf`);
    writeFileSync(f, buf);
    let txt = "";
    try {
      txt = execFileSync("pdftotext", ["-layout", f, "-"], {
        maxBuffer: 50 * 1024 * 1024,
      }).toString();
    } catch {
      txt = "";
    }
    const chars = txt.replace(/\s/g, "").length;
    const kind = chars > TEXT_MIN ? "text" : "scan";
    const glaeub = /informationen zum gläubiger|ansprechpartner des gläubigers/i.test(txt);
    return { zid: doc.zid, kind, chars, bytes: buf.length, glaeub };
  } catch (e) {
    return { zid: doc.zid, kind: "error", reason: String(e).slice(0, 80), chars: 0 };
  }
}

async function pool(items, n, fn) {
  const res = new Array(items.length);
  let i = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        res[idx] = await fn(items[idx], idx);
        if (++done % 200 === 0) console.log(`  ... ${done}/${items.length}`);
      }
    }),
  );
  return res;
}

console.log("Liste Bekanntmachungen ...");
const docs = await listDocs();
console.log(`${docs.length} Dokumente. Prüfe Textebene ...`);
const results = await pool(docs, 12, checkOne);

const text = results.filter((r) => r.kind === "text");
const scan = results.filter((r) => r.kind === "scan");
const err = results.filter((r) => r.kind === "error");
const glaeubInText = text.filter((r) => r.glaeub).length;

console.log("\n===== ERGEBNIS =====");
console.log(`Gesamt:        ${results.length}`);
console.log(`Text-PDF:      ${text.length}`);
console.log(`Scan (Vision): ${scan.length}`);
console.log(`Fehler:        ${err.length}`);
console.log(`Text-PDFs mit explizitem Gläubiger-Abschnitt: ${glaeubInText}`);
writeFileSync(
  "tools/.bekanntmachung-text-report.json",
  JSON.stringify(
    { gesamt: results.length, text: text.length, scan: scan.length, error: err.length, glaeubInText, scans: scan.map((s) => s.zid), errors: err },
    null,
    2,
  ),
);
console.log("Report -> tools/.bekanntmachung-text-report.json");
