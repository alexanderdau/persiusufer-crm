// Claude Vision auf bis zu 12 Inseratsbilder — sucht Adress-Hinweise.
// v3: MAX_BILDER 6→12 (Lagepläne sind oft an Position 5-10), zusätzlich
//      Teilungsentwurf/Eigentümer/Vermessungsingenieur in Prompt + Output.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "kleinanzeigen-bilder";

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

const MAX_BILDER = 12;

async function fetchAsBase64(
  url: string,
): Promise<{ data: string; mime: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = "";
    const chunk = 32768;
    for (let i = 0; i < buf.length; i += chunk) {
      s += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    return {
      data: btoa(s),
      mime: r.headers.get("content-type") || "image/jpeg",
    };
  } catch {
    return null;
  }
}

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
      "kid,title,ort,ortsteil,bilder_paths,strasse,gemarkung,flur,flurstueck",
    )
    .eq("kid", kid)
    .single();
  if (e1 || !row) return json({ error: "akte nicht gefunden" }, 404);
  if (!row.bilder_paths || row.bilder_paths.length === 0)
    return json({ error: "keine Bilder vorhanden" }, 400);

  const paths = row.bilder_paths.slice(0, MAX_BILDER) as string[];
  const images: Array<{ data: string; mime: string }> = [];
  for (const p of paths) {
    const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p}`;
    const img = await fetchAsBase64(url);
    if (img) images.push(img);
  }
  if (images.length === 0)
    return json({ error: "konnte keine Bilder aus Storage laden" }, 500);

  const prompt = `Du analysierst Inserats-Bilder eines Brandenburger Baugrundstücks (Inserat ${kid}, Ort: ${row.ort ?? "unbekannt"}${row.ortsteil ? ", OT " + row.ortsteil : ""}).

Schau dir ALLE ${images.length} Bilder GENAU an — besonders auch die HINTEREN Bilder, weil dort oft Lagepläne/Katasterauszüge versteckt sind. Hochformat-Bilder im hinteren Teil sind FAST IMMER Lagepläne oder Teilungsentwürfe.

Besonders wertvolle Quellen:
- LAGEPLÄNE / TEILUNGSENTWÜRFE / KATASTERAUSZÜGE: enthalten praktisch IMMER Gemarkung, Flur, Flurstücksnummern, Straßennamen, Maße, Eigentümer, Vermessungsingenieur, AZ
- VERKAUFSSCHILDER VOR ORT: Telefonnummer, Firmenname, manchmal URL
- BRIEFKÄSTEN/HAUSSCHILDER: Hausnummer + Name
- NACHBARGEBÄUDE: Firmenschilder/Reklame mit Anschrift
- STRAßENSCHILDER: direkter Treffer
- Schornsteine/Antennen/markante Gebäude (eher schwach)

Antworte als JSON:

{
  "strasse_hinweis": "<Straßenname falls eindeutig zu erkennen — sonst null>",
  "hausnummer_hinweis": "<Hausnummer falls auf Briefkasten/Schild — sonst null>",
  "flurstueck_hinweis": "<Flurstücksnummer aus Kataster — sonst null>",
  "flur_hinweis": "<Flurnummer aus Kataster — sonst null>",
  "gemarkung_hinweis": "<Gemarkung aus Kataster — sonst null>",
  "eigentuemer_hinweis": "<Eigentümer-Name aus Lageplan/Teilungsentwurf — sonst null>",
  "vermesser_hinweis": "<Vermessungsingenieur Name+Tel falls aus Lageplan — sonst null>",
  "vermessung_az_hinweis": "<AZ des Vermessungsbüros falls auf Lageplan — sonst null>",
  "telefon_hinweis": "<Telefonnummer von Verkaufsschild — sonst null>",
  "firmenname_hinweis": "<Firmenname/Maklerfirma vom Verkaufsschild — sonst null>",
  "teilungsplan": "<falls Teilungsentwurf erkennbar: 'X Parzellen, davon Y verkauft' o.ä. — sonst null>",
  "sichtbare_hinweise": ["Liste aller konkreten Lese-Treffer aus den Bildern"],
  "bildtypen": ["Was für Bildtypen waren das (Außen, Lageplan, Kataster, Teilungsentwurf, Verkaufsschild, Visualisierung)"],
  "zusammenfassung": "<1-3 Sätze: was war zu sehen, was ist belastbar>"
}

WICHTIG:
- Nur was wirklich lesbar/sichtbar ist — nichts erfinden, nichts raten
- Bei Telefonnummern: nur deutsche Formate (030/, 033/, +49, 0152/, 0177/ etc.)
- Bei Straßen: vollständige Bezeichnung inkl. Suffix (Straße/Weg/Allee/Platz)

Nur JSON, keine Markdown-Backticks.`;

  const content: any[] = images.map((img) => ({
    type: "image",
    source: { type: "base64", media_type: img.mime, data: img.data },
  }));
  content.push({ type: "text", text: prompt });

  let aiText = "";
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
        max_tokens: 1500,
        messages: [{ role: "user", content }],
      }),
    });
    const data = await resp.json();
    if (!resp.ok)
      return json(
        { error: "anthropic-call fehlgeschlagen", details: data },
        502,
      );
    usage = data.usage;
    aiText = data.content?.[0]?.text ?? "";
  } catch (e) {
    return json({ error: "anthropic-call exception", details: String(e) }, 500);
  }

  let parsed: any = {};
  const m = aiText.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      // bleibt leer
    }
  }

  const lines: string[] = [];
  if (parsed.zusammenfassung) lines.push(parsed.zusammenfassung);
  if (parsed.bildtypen && parsed.bildtypen.length > 0)
    lines.push(`Bildtypen: ${parsed.bildtypen.join(", ")}`);
  if (parsed.sichtbare_hinweise && parsed.sichtbare_hinweise.length > 0)
    lines.push(
      "Lese-Treffer:\n  • " + parsed.sichtbare_hinweise.join("\n  • "),
    );
  if (parsed.strasse_hinweis)
    lines.push(
      `➤ Straße-Hinweis: ${parsed.strasse_hinweis}${parsed.hausnummer_hinweis ? " " + parsed.hausnummer_hinweis : ""}`,
    );
  if (parsed.flurstueck_hinweis)
    lines.push(`➤ Flurstück-Hinweis: ${parsed.flurstueck_hinweis}`);
  if (parsed.flur_hinweis) lines.push(`➤ Flur-Hinweis: ${parsed.flur_hinweis}`);
  if (parsed.gemarkung_hinweis)
    lines.push(`➤ Gemarkung-Hinweis: ${parsed.gemarkung_hinweis}`);
  if (parsed.eigentuemer_hinweis)
    lines.push(`➤ Eigentümer-Hinweis: ${parsed.eigentuemer_hinweis}`);
  if (parsed.teilungsplan) lines.push(`➤ Teilungsplan: ${parsed.teilungsplan}`);
  if (parsed.vermesser_hinweis)
    lines.push(`➤ Vermesser: ${parsed.vermesser_hinweis}`);
  if (parsed.vermessung_az_hinweis)
    lines.push(`➤ Vermessungs-AZ: ${parsed.vermessung_az_hinweis}`);
  if (parsed.telefon_hinweis)
    lines.push(`➤ Telefon-Hinweis: ${parsed.telefon_hinweis}`);
  if (parsed.firmenname_hinweis)
    lines.push(`➤ Firma-Hinweis: ${parsed.firmenname_hinweis}`);
  const analyseText = lines.join("\n") || aiText.slice(0, 500);

  // Patch: nur leere Felder befüllen, niemals User-Werte überschreiben
  const patch: Record<string, unknown> = {
    bild_analyse_text: analyseText,
    bild_analyse_at: new Date().toISOString(),
  };
  if (parsed.strasse_hinweis && !row.strasse) {
    let s = String(parsed.strasse_hinweis);
    if (parsed.hausnummer_hinweis) s += " " + parsed.hausnummer_hinweis;
    patch["bild_strasse_hinweis"] = s.slice(0, 120);
  }
  if (parsed.gemarkung_hinweis && !row.gemarkung)
    patch["gemarkung"] = String(parsed.gemarkung_hinweis).slice(0, 80);
  if (parsed.flur_hinweis && !row.flur)
    patch["flur"] = String(parsed.flur_hinweis).slice(0, 12);
  if (parsed.flurstueck_hinweis && !row.flurstueck)
    patch["flurstueck"] = String(parsed.flurstueck_hinweis).slice(0, 24);

  const { error: e2 } = await sb
    .from("kleinanzeigen_grundstueck")
    .update(patch)
    .eq("kid", kid);
  if (e2)
    return json({ error: "db-update fail", details: e2.message, patch }, 500);

  return json({
    ok: true,
    bilder_analysiert: images.length,
    bilder_total: row.bilder_paths.length,
    parsed,
    text: analyseText,
    usage,
  });
});
