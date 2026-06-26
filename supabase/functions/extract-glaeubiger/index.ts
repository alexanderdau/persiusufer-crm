import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Extrahiert je Forderungsversteigerung die GLÄUBIGER-Felder (name, typ,
// sachbearbeiter, telefon, az, email) per Haiku. Quelle: bevorzugt das
// Portal-Feld zvg_akte.glaeubiger (Text, billig); fehlt es, die amtliche
// Bekanntmachungs-PDF (dort steht der Gläubiger immer). Idempotenter Batch
// (nur glaeubiger_extrahiert_am IS NULL), Token-Auth, ~110s-Budget,
// kleine Parallelität -> über mehrere Läufe drainen.

const TOKEN = "pglaeub-9q2m4x7t";
const MODEL = "claude-haiku-4-5-20251001";
const MAX_PDF_BYTES = 2_500_000;
const CONCURRENCY = 5;

const SYSTEM_PROMPT = `Du extrahierst aus deutschem Zwangsversteigerungs-Text die KONTAKTDATEN DES GLÄUBIGERS (betreibende Partei). Quelle ist entweder das Portal-Feld "Informationen zum Gläubiger" oder eine amtliche Bekanntmachung/Terminmitteilung (dort ist der betreibende Gläubiger genannt, teils nur über eine Kanzlei als Vertreter).

Gib AUSSCHLIESSLICH JSON zurück, ohne Vor-/Nachtext:
{
  "name": String|null,            // Name des Gläubigers als Entität, OHNE Anschrift/Telefon/Az. Wenn nur eine Kanzlei als Vertreter genannt ist und der dahinterliegende Gläubiger im Text erkennbar ist, nenne den Gläubiger; sonst die Kanzlei.
  "typ": "bank"|"oeffentlich"|"weg"|"versicherung"|"anwalt"|"insolvenz"|"privat"|"unbekannt",
  "sachbearbeiter": String|null,  // Ansprechpartner/Sachbearbeiter (Person), z.B. "Frau Richter"
  "telefon": String|null,         // Telefonnummer des Gläubigers/Ansprechpartners
  "az": String|null,              // Aktenzeichen/Geschäftszeichen DES GLÄUBIGERS (NICHT des Gerichts)
  "email": String|null,
  "volltext": String|null         // NUR wenn ein PDF/Bild-Dokument vorliegt: wörtliche, vollständige Transkription des gesamten Dokumenttextes (alle Seiten), normalisiert (Zeilenumbrüche erhalten). Bei reinem Text-Input: null.
}

Typ-Regeln:
- "bank": Bank/Sparkasse/Volksbank/Raiffeisen/Bausparkasse/Landesbank/Bankhaus/Hypothekenbank.
- "oeffentlich": Stadt/Gemeinde/Landkreis/Verbandsgemeinde/Finanzamt/Justizkasse/Landeskasse/Gerichtskasse/Zollamt/öffentliche Kasse/Behörde.
- "weg": Wohnungseigentümergemeinschaft / Eigentümergemeinschaft / Hausverwaltung.
- "versicherung": Versicherung/Lebensversicherung.
- "anwalt": NUR eine Kanzlei/Rechtsanwalt als Vertreter erkennbar, dahinterliegender Gläubiger NICHT bestimmbar.
- "insolvenz": Insolvenzverwalter.
- "privat": benannte Privatperson oder Firma (GmbH/AG/KG) ohne öffentlich/Bank/Versicherung.
- "unbekannt": Gläubiger hat Daten nicht offengelegt ("nicht zugestimmt"), oder es sind keine verwertbaren Angaben vorhanden.

Strikt: Erfinde nichts. Nur was wörtlich im Text steht. Fehlt etwas -> null. Bei "unbekannt" alle Kontaktfelder null.`;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function setCreditBlocked(msg: string) {
  await supabase.from("app_anthropic_status").upsert({
    id: 1,
    credit_blocked_at: new Date().toISOString(),
    last_error: msg.slice(0, 300),
    updated_at: new Date().toISOString(),
  });
}
async function clearCreditBlocked() {
  await supabase
    .from("app_anthropic_status")
    .update({ credit_blocked_at: null, updated_at: new Date().toISOString() })
    .eq("id", 1);
}

async function loadAll(table: string, select: string, apply?: (q: any) => any) {
  const out: any[] = [];
  for (let off = 0; ; off += 1000) {
    let q = supabase.from(table).select(select);
    if (apply) q = apply(q);
    const { data } = await q.range(off, off + 999);
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

function parseJson(text: string): any | null {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : text);
  } catch {
    return null;
  }
}

async function callHaiku(
  apiKey: string,
  content: any[],
  maxTokens = 1024,
): Promise<any> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    return { error: `anthropic_${resp.status}: ${t.slice(0, 300)}` };
  }
  const j = await resp.json();
  const text = j?.content?.[0]?.text ?? "";
  const parsed = parseJson(text);
  if (!parsed) return { error: "json_parse_failed: " + text.slice(0, 200) };
  return { parsed };
}

const VALID_TYP = new Set([
  "bank",
  "oeffentlich",
  "weg",
  "versicherung",
  "anwalt",
  "insolvenz",
  "privat",
  "unbekannt",
]);

function clean(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s.slice(0, 300) : null;
}

type Outcome = "feld" | "pdf" | "text" | "failed" | "credit";

async function processAkte(
  apiKey: string,
  akte: { zid: string; az: string; glaeubiger: string | null },
  bek: { path: string; volltext: string | null } | null,
): Promise<Outcome> {
  let content: any[];
  let quelle: "feld_haiku" | "pdf_haiku" | "text_haiku";
  let maxTokens = 1024;
  let visionPdf = false; // Volltext anschließend am Dokument speichern?

  if (akte.glaeubiger && akte.glaeubiger.trim().length > 0) {
    // Beste, billigste Quelle: das Portal-Feld (reiner Text).
    quelle = "feld_haiku";
    content = [
      {
        type: "text",
        text: `Aktenzeichen ${akte.az}. Portal-Feld "Informationen zum Gläubiger":\n\n${akte.glaeubiger}`,
      },
    ];
  } else if (bek?.volltext && bek.volltext.trim().length > 0) {
    // Bekanntmachung wurde bereits transkribiert -> Text wiederverwenden, KEINE Vision.
    quelle = "text_haiku";
    content = [
      {
        type: "text",
        text: `Aktenzeichen ${akte.az}. Transkribierte amtliche Bekanntmachung:\n\n${bek.volltext}`,
      },
    ];
  } else if (bek?.path) {
    // Erstkontakt mit der Scan-PDF: ein Vision-Call liefert Volltext + Felder.
    quelle = "pdf_haiku";
    maxTokens = 4096;
    visionPdf = true;
    const { data: blob } = await supabase.storage
      .from("zvg-documents")
      .download(bek.path);
    if (!blob) return await markFailed(akte.zid, "download_failed");
    const arr = new Uint8Array(await blob.arrayBuffer());
    if (arr.length > MAX_PDF_BYTES || arr.length < 500)
      return await markFailed(akte.zid, "pdf_size");
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < arr.length; i += chunk)
      bin += String.fromCharCode.apply(
        null,
        Array.from(arr.subarray(i, i + chunk)),
      );
    content = [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: btoa(bin),
        },
        title: "Amtliche Bekanntmachung",
      },
      {
        type: "text",
        text: `Aktenzeichen ${akte.az}. Transkribiere die amtliche Bekanntmachung vollständig ("volltext") und extrahiere die Gläubiger-Kontaktdaten.`,
      },
    ];
  } else {
    return await markFailed(akte.zid, "no_source");
  }

  const r = await callHaiku(apiKey, content, maxTokens);
  if (r.error) {
    // Credit/Billing-Fehler ist kein Akten-Fehler -> nicht markieren, Batch abbrechen.
    if (
      /credit balance is too low|credit_balance|insufficient.*credit/i.test(
        r.error,
      )
    )
      return "credit";
    return await markFailed(akte.zid, r.error);
  }
  const p = r.parsed;
  const typ = VALID_TYP.has(p.typ) ? p.typ : "sonstige";

  // Volltext einmalig am Dokument cachen (nur beim Vision-Erstlauf).
  if (visionPdf && bek?.path) {
    const vt = typeof p.volltext === "string" ? p.volltext.trim() : "";
    if (vt.length > 0)
      await supabase
        .from("zvg_akte_dokumente")
        .update({ volltext: vt, volltext_am: new Date().toISOString() })
        .eq("zid", akte.zid)
        .eq("storage_path", bek.path);
  }

  await supabase
    .from("zvg_akte")
    .update({
      glaeubiger_name: clean(p.name),
      glaeubiger_typ: typ,
      glaeubiger_sachbearbeiter: clean(p.sachbearbeiter),
      glaeubiger_telefon: clean(p.telefon),
      glaeubiger_az: clean(p.az),
      glaeubiger_email: clean(p.email),
      glaeubiger_quelle: quelle,
      glaeubiger_extrahiert_am: new Date().toISOString(),
    })
    .eq("zid", akte.zid);
  return quelle === "feld_haiku"
    ? "feld"
    : quelle === "text_haiku"
      ? "text"
      : "pdf";
}

async function markFailed(zid: string, err: string): Promise<"failed"> {
  await supabase
    .from("zvg_akte")
    .update({
      glaeubiger_quelle: "failed:" + err.slice(0, 350),
      glaeubiger_extrahiert_am: new Date().toISOString(),
    })
    .eq("zid", zid);
  return "failed";
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get("token") !== TOKEN)
    return new Response("forbidden", { status: 403 });
  const limit = parseInt(u.searchParams.get("limit") || "80");
  // Standard: NUR das Portal-Feld auswerten — die amtliche Bekanntmachung nennt
  // den Gläubiger strukturell nicht (verifiziert). include_pdf=1 aktiviert die
  // Vision-Transkription der PDF (nur als Volltext-Cache, kein Gläubiger).
  const includePdf = u.searchParams.get("include_pdf") === "1";
  const t0 = Date.now();
  const budgetMs = 110000;

  const { data: cfg } = await supabase
    .from("app_anthropic_config")
    .select("api_key")
    .single();
  if (!cfg?.api_key)
    return new Response(
      JSON.stringify({ error: "anthropic_api_key_missing" }),
      {
        status: 500,
      },
    );
  const apiKey = cfg.api_key;

  // Bekanntmachungs-PDF je zid (inkl. ggf. schon transkribiertem Volltext).
  const bek = new Map<string, { path: string; volltext: string | null }>();
  for (const d of await loadAll(
    "zvg_akte_dokumente",
    "zid,storage_path,volltext",
    (q) => q.eq("art", "bekanntmachung"),
  ))
    if (!bek.has((d as any).zid))
      bek.set((d as any).zid, {
        path: (d as any).storage_path,
        volltext: (d as any).volltext ?? null,
      });

  // Kandidaten: Forderungsversteigerung, noch nicht extrahiert. Standard:
  // nur mit Portal-Feld (= einzige Gläubiger-Quelle). Mit include_pdf zusätzlich
  // PDF-only-Akten (Volltext-Cache).
  const akten = (
    await loadAll(
      "zvg_akte",
      "zid,az,glaeubiger,is_teilung,glaeubiger_extrahiert_am",
    )
  ).filter(
    (a: any) =>
      a.is_teilung !== true &&
      a.glaeubiger_extrahiert_am == null &&
      ((a.glaeubiger && a.glaeubiger.trim().length > 0) ||
        (includePdf && bek.has(a.zid))),
  );

  const offen = akten.length;
  const todo = akten.slice(0, limit);
  const st = {
    offen,
    verarbeitet: 0,
    feld: 0,
    pdf: 0,
    text: 0,
    failed: 0,
    credit_blocked: false,
  };

  let blocked = false;
  for (let i = 0; i < todo.length && !blocked; i += CONCURRENCY) {
    if (Date.now() - t0 > budgetMs) break;
    const chunk = todo.slice(i, i + CONCURRENCY);
    const res = await Promise.all(
      chunk.map((a: any) =>
        processAkte(apiKey, a, bek.get(a.zid) ?? null).catch(
          () => "failed" as const,
        ),
      ),
    );
    for (const r of res) {
      if (r === "credit") {
        blocked = true;
        continue;
      }
      st.verarbeitet++;
      if (r === "feld") st.feld++;
      else if (r === "pdf") st.pdf++;
      else if (r === "text") st.text++;
      else st.failed++;
    }
  }

  // Status für den UI-Banner: blockiert setzen bzw. bei Erfolg löschen.
  if (blocked) {
    await setCreditBlocked("Anthropic: credit balance too low");
    st.credit_blocked = true;
  } else if (st.feld + st.pdf + st.text > 0) {
    await clearCreditBlocked();
  }

  st.offen = offen - st.verarbeitet;
  return new Response(JSON.stringify(st, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
