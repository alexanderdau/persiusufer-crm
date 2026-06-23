import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.replace(",", ".").replace(/[^\d.\-]/g, "");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const toInt = (v: unknown) =>
  toNum(v) === null ? null : Math.round(toNum(v)!);
const toBool = (v: unknown): boolean | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    if (["true", "ja", "yes", "1"].includes(s)) return true;
    if (["false", "nein", "no", "0"].includes(s)) return false;
  }
  if (typeof v === "number") return v !== 0;
  return null;
};
const toStr = (v: unknown, max = 500): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const normName = (n: string | null | undefined): string => {
  if (!n) return "";
  return n
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, "")
    .replace(/\s+(an der|an|am|im|auf|in|bei|ob der|ob)\s+.+$/, "")
    .trim();
};
const BAUBARKEIT_VALID = ["EFH", "DHH", "EFH/EW", "MFH", "gemischt"];
const normOneBaubarkeit = (raw: unknown): string | null => {
  const s = toStr(raw);
  if (!s) return null;
  const up = s.toUpperCase().replace(/\s+/g, "");
  for (const v of BAUBARKEIT_VALID) if (v.toUpperCase() === up) return v;
  const low = s.toLowerCase();
  if (low.includes("mehrfamilien")) return "MFH";
  if (low.includes("doppelhaus")) return "DHH";
  if (low.includes("einlieger")) return "EFH/EW";
  if (low.includes("einfamilien")) return "EFH";
  if (low.includes("gemischt") || low.includes("mehrere")) return "gemischt";
  return null;
};
const normBaubarkeitArr = (v: unknown): string[] | null => {
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  const set = new Set<string>();
  for (const x of arr) {
    const n = normOneBaubarkeit(x);
    if (n) set.add(n);
  }
  return set.size === 0 ? null : [...set].sort();
};
const normErschl = (v: unknown): string | null => {
  const s = toStr(v);
  if (!s) return null;
  const low = s.toLowerCase();
  if (low.includes("voll")) return "voll";
  if (low.includes("teil")) return "teilweise";
  if (low.includes("un")) return "unerschlossen";
  return null;
};
const splitName = (full: string): { first: string; last: string } => {
  const parts = full
    .replace(/\s{2,}/g, " ")
    .trim()
    .split(" ");
  if (parts.length === 1) return { first: "", last: parts[0] };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (!ANTHROPIC_KEY)
    return json({ error: "ANTHROPIC_API_KEY fehlt in Supabase-Secrets" }, 500);
  let body: { kid?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const kid = Number(body.kid);
  if (!kid) return json({ error: "kid required" }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: row, error: e1 } = await sb
    .from("kleinanzeigen_grundstueck")
    .select(
      "kid,title,beschreibung,flaeche_qm,ort,ortsteil,strasse,anbieter_name,anbieter_objekt_id,kontakt_id",
    )
    .eq("kid", kid)
    .single();
  if (e1 || !row)
    return json({ error: "akte nicht gefunden", details: e1?.message }, 404);

  const prompt = `Du bist Immobilien-Investor. Analysiere folgendes Inserat eines Brandenburger Baugrundstücks und gib NUR valides JSON zurück, kein Fließtext, keine Markdown-Backticks.

Titel: ${row.title ?? ""}
Anbieter laut Plattform: ${row.anbieter_name ?? "unbekannt"}
Bekannter Ort: ${row.ort ?? ""}${row.ortsteil ? " (OT " + row.ortsteil + ")" : ""}
Grundstücksfläche: ${row.flaeche_qm ?? "unbekannt"} m² (GESAMTE Parzelle, NICHT Grundfläche)
Beschreibung: ${(row.beschreibung ?? "").slice(0, 6000)}

Glossar:
- §30 BauGB = qualifizierter B-Plan -> bpl_vorhanden=true
- §34 BauGB = unbeplanter Innenbereich / Einfügungsgebot -> paragraph_34=true
- §35 BauGB = Außenbereich -> paragraph_35=true (in der Regel auch bauerwartungsland=true)
- GRZ = Grundflächenzahl. GRUNDFLÄCHE(GR)=Fläche×GRZ — NIE gleich Grundstücksfläche! Ohne GRZ nicht setzen.
- Baufeld=B-Plan-Bereich. WFL=Wohnfläche. Bauträgerfrei=jeder Bauträger. Erbbaurecht/Erbpacht=Grundstück auf Zeit gegen Erbbauzins.

Felder (alle optional):
- bauerwartungsland, grz (float), gfz (float), vollgeschosse (int)
- bpl_vorhanden, bpl_nummer, paragraph_34, paragraph_35 (bool/string)
- erschliessung ("voll"|"teilweise"|"unerschlossen")
- teilbar, bautraegerfrei, erbbaurecht (bool)
- provision_satz_pct (float)
- baubarkeit_typ (string[]) aus "EFH","DHH","EFH/EW","MFH","gemischt"
- grundflaeche_qm (nur mit GRZ), baufeld_qm, wohnflaeche_qm (float)
- ortsteil (string, NUR wenn != Ort)
- strasse (string): Straßenname falls im Fließtext
- gemarkung, flur, flurstueck (string)
- anbieter_objekt_id (string)
- bebaubarkeit_kurz (string, max 200 Zeichen)
- risiken (string[])

Kontaktdaten (nur wenn explizit):
- kontakt_name, kontakt_email, kontakt_phone, kontakt_firma

Nur das JSON-Objekt.`;

  let aiJson: Record<string, unknown> = {};
  let usage: any = null;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1400,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await resp.json();
    if (!resp.ok)
      return json(
        { error: "anthropic-call fehlgeschlagen", details: data },
        502,
      );
    usage = data.usage;
    const text: string = data.content?.[0]?.text ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m)
      return json({ error: "KI hat kein JSON", raw: text.slice(0, 500) }, 502);
    aiJson = JSON.parse(m[0]);
  } catch (e) {
    return json({ error: "anthropic-call exception", details: String(e) }, 500);
  }

  const patch: Record<string, unknown> = {
    ki_analyse_at: new Date().toISOString(),
  };
  let changed = 0;
  const setIf = (k: string, v: unknown) => {
    if (v !== null && v !== undefined) {
      patch[k] = v;
      changed++;
    }
  };
  setIf("bauerwartungsland", toBool(aiJson.bauerwartungsland));
  setIf("grz", toNum(aiJson.grz));
  setIf("gfz", toNum(aiJson.gfz));
  setIf("vollgeschosse", toInt(aiJson.vollgeschosse));
  setIf("bpl_vorhanden", toBool(aiJson.bpl_vorhanden));
  setIf("bpl_nummer", toStr(aiJson.bpl_nummer, 80));
  setIf("paragraph_34", toBool(aiJson.paragraph_34));
  setIf("paragraph_35", toBool(aiJson.paragraph_35));
  setIf("erschliessung", normErschl(aiJson.erschliessung));
  setIf("teilbar", toBool(aiJson.teilbar));
  setIf("bautraegerfrei", toBool(aiJson.bautraegerfrei));
  setIf("erbbaurecht", toBool(aiJson.erbbaurecht));
  setIf("provision_satz_pct", toNum(aiJson.provision_satz_pct));
  setIf("baubarkeit_typ", normBaubarkeitArr(aiJson.baubarkeit_typ));
  setIf("grundflaeche_qm", toNum(aiJson.grundflaeche_qm));
  setIf("baufeld_qm", toNum(aiJson.baufeld_qm));
  setIf("wohnflaeche_qm", toNum(aiJson.wohnflaeche_qm));
  setIf("bebaubarkeit_kurz", toStr(aiJson.bebaubarkeit_kurz, 200));
  setIf("gemarkung", toStr(aiJson.gemarkung, 60));
  setIf("flur", toStr(aiJson.flur, 30));
  setIf("flurstueck", toStr(aiJson.flurstueck, 60));
  const objIdKi = toStr(aiJson.anbieter_objekt_id, 60);
  if (!row.anbieter_objekt_id && objIdKi) {
    patch["anbieter_objekt_id"] = objIdKi;
    changed++;
  }
  if (Array.isArray(aiJson.risiken)) {
    const arr = aiJson.risiken
      .map((x: unknown) => toStr(x, 80))
      .filter((x): x is string => !!x);
    if (arr.length > 0) {
      patch["risiken"] = arr;
      changed++;
    }
  }
  const ortsteilKi = toStr(aiJson.ortsteil, 60);
  if (!row.ortsteil && ortsteilKi) {
    if (normName(ortsteilKi) !== normName(row.ort ?? "")) {
      patch["ortsteil"] = ortsteilKi;
      changed++;
    }
  }
  const strasseKi = toStr(aiJson.strasse, 120);
  if (!row.strasse && strasseKi && /[A-Za-zÄÖÜäöüß]{3,}/.test(strasseKi)) {
    patch["strasse"] = strasseKi;
    changed++;
  }

  const flaeche = row.flaeche_qm ? Number(row.flaeche_qm) : null;
  const grzVal =
    typeof patch["grz"] === "number" ? (patch["grz"] as number) : null;
  let gr = patch["grundflaeche_qm"] as number | undefined;
  if (gr !== undefined) {
    if (flaeche && gr >= flaeche * 0.95) {
      delete patch["grundflaeche_qm"];
      gr = undefined;
      changed--;
    } else if (!grzVal) {
      delete patch["grundflaeche_qm"];
      gr = undefined;
      changed--;
    }
  }
  if (gr === undefined && flaeche && grzVal && grzVal > 0 && grzVal < 1) {
    const calc = Number((flaeche * grzVal).toFixed(2));
    if (calc < flaeche * 0.95) {
      patch["grundflaeche_qm"] = calc;
      changed++;
    }
  }

  let contact_info: any = null;
  const k_name = toStr(aiJson.kontakt_name, 80);
  const k_email = toStr(aiJson.kontakt_email, 120)?.toLowerCase() ?? null;
  const k_phone = toStr(aiJson.kontakt_phone, 40);
  const k_firma = toStr(aiJson.kontakt_firma, 120);
  if ((k_name || k_email || k_phone) && !row.kontakt_id) {
    let existing: any = null;
    if (k_email) {
      const { data } = await sb
        .from("contacts")
        .select("id")
        .filter("email_jsonb", "cs", JSON.stringify([{ email: k_email }]))
        .limit(1);
      if (data && data.length > 0) existing = data[0];
    }
    if (!existing && k_name) {
      const { first, last } = splitName(k_name);
      const q = sb.from("contacts").select("id").eq("last_name", last);
      if (first) q.eq("first_name", first);
      const { data } = await q.limit(1);
      if (data && data.length > 0) existing = data[0];
    }
    let contact_id: number | null = existing?.id ?? null;
    if (!contact_id) {
      const { first, last } = k_name
        ? splitName(k_name)
        : { first: "", last: "Anbieter" };
      const insertData: any = {
        first_name: first,
        last_name: last || k_email?.split("@")[0] || "Anbieter",
        email_jsonb: k_email ? [{ email: k_email, type: "Work" }] : null,
        phone_jsonb: k_phone ? [{ number: k_phone, type: "Work" }] : null,
        background: `Aus kleinanzeigen.de-Inserat ${kid}${k_firma ? " — " + k_firma : ""}`,
        kleinanzeigen_kid: kid,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        tags: ["kleinanzeigen-anbieter"],
      };
      const { data: ins, error: ie } = await sb
        .from("contacts")
        .insert(insertData)
        .select("id")
        .single();
      if (!ie && ins) contact_id = ins.id;
      contact_info = {
        created: true,
        contact_id,
        name: k_name,
        email: k_email,
        phone: k_phone,
      };
    } else {
      contact_info = {
        existing: true,
        contact_id,
        name: k_name,
        email: k_email,
      };
    }
    if (contact_id) {
      patch["kontakt_id"] = contact_id;
      changed++;
    }
  }

  const { error: e2 } = await sb
    .from("kleinanzeigen_grundstueck")
    .update(patch)
    .eq("kid", kid);
  if (e2)
    return json({ error: "db-update fail", details: e2.message, patch }, 500);

  return json({ ok: true, changed, patch, usage, contact_info });
});
