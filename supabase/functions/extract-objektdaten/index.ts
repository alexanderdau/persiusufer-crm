import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// KI-Objektdatenanalyse (à la zvnow): extrahiert aus bekanntmachung_text per
// Haiku die Investitions-Kernfelder (Nutzungsstatus, Baujahr, Wohnfläche,
// Grundstücksfläche, Innenbesichtigung, Einheiten). Reine Feld-Extraktion aus
// Text -> billig, keine juristische Wertung. Idempotent, Token-Auth, Budget.

const TOKEN = "pobjdat-5w8k2m6r";
const MODEL = "claude-haiku-4-5-20251001";
const CONCURRENCY = 5;

const SYSTEM_PROMPT = `Du extrahierst aus dem Text einer deutschen Zwangsversteigerungs-Bekanntmachung / eines Gutachten-Auszugs strukturierte OBJEKTDATEN für Immobilien-Investoren.

Gib AUSSCHLIESSLICH JSON zurück, ohne Vor-/Nachtext:
{
  "nutzungsstatus": "vermietet" | "teilweise_vermietet" | "leerstehend" | "eigengenutzt" | "gemischt" | "unbekannt",
  "baujahr": Number|null,                 // Baujahr (4-stellig); bei mehreren Gebäuden das Hauptgebäude/älteste sinnvolle
  "wohnflaeche_qm": Number|null,          // Wohn-/Nutzfläche in m² (Zahl ohne Einheit)
  "grundstuecksflaeche_qm": Number|null,  // Grundstücksgröße in m²
  "innenbesichtigung": true|false|null,   // wurde das Objekt INNEN besichtigt? (oft "Innenbesichtigung nicht möglich/erfolgt")
  "einheiten_anzahl": Number|null,        // Anzahl Wohn-/Nutzeinheiten
  "notiz": String|null                    // 1 kurzer Satz zu Auffälligkeiten/Unsicherheiten
}

Regeln:
- NUR was im Text steht. Nichts erfinden. Fehlt etwas -> null (bzw. "unbekannt" beim Nutzungsstatus).
- "leerstehend" nur wenn Leerstand genannt ist; "vermietet" wenn Mietverhältnis/Miete genannt; "teilweise_vermietet" bei teils vermietet/teils leer.
- Zahlen als reine Zahl (z. B. 6784 statt "6.784 m²").`;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const VALID_NUTZ = new Set([
  "vermietet",
  "teilweise_vermietet",
  "leerstehend",
  "eigengenutzt",
  "gemischt",
  "unbekannt",
]);
function num(v: any): number | null {
  if (v == null) return null;
  const n = Number(
    String(v)
      .replace(/[^\d.,-]/g, "")
      .replace(/\./g, "")
      .replace(",", "."),
  );
  return Number.isFinite(n) ? n : null;
}
function parseJson(text: string): any | null {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : text);
  } catch {
    return null;
  }
}

async function processAkte(
  apiKey: string,
  akte: { zid: string; az: string; bekanntmachung_text: string },
): Promise<"ok" | "failed" | "credit"> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Aktenzeichen ${akte.az}. Bekanntmachungs-/Gutachtentext:\n\n${akte.bekanntmachung_text.slice(0, 12000)}`,
            },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    if (/credit balance is too low|insufficient.*credit/i.test(t))
      return "credit";
    return "failed";
  }
  const j = await resp.json();
  const p = parseJson(j?.content?.[0]?.text ?? "");
  if (!p) return "failed";
  const nutz = VALID_NUTZ.has(p.nutzungsstatus)
    ? p.nutzungsstatus
    : "unbekannt";
  const baujahr = num(p.baujahr);
  await supabase
    .from("zvg_akte")
    .update({
      nutzungsstatus: nutz,
      baujahr:
        baujahr != null && baujahr > 1700 && baujahr < 2100 ? baujahr : null,
      wohnflaeche_qm: num(p.wohnflaeche_qm),
      grundstuecksflaeche_qm: num(p.grundstuecksflaeche_qm),
      innenbesichtigung:
        typeof p.innenbesichtigung === "boolean" ? p.innenbesichtigung : null,
      einheiten_anzahl: num(p.einheiten_anzahl),
      objektdaten_ki_am: new Date().toISOString(),
      objektdaten_ki_notiz:
        typeof p.notiz === "string" ? p.notiz.slice(0, 300) : null,
    })
    .eq("zid", akte.zid);
  return "ok";
}

async function loadAll(select: string, apply: (q: any) => any) {
  const out: any[] = [];
  for (let off = 0; ; off += 1000) {
    const { data } = await apply(
      supabase.from("zvg_akte").select(select),
    ).range(off, off + 999);
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
  const limit = parseInt(u.searchParams.get("limit") || "60");
  const t0 = Date.now();
  const budgetMs = 110000;

  const { data: cfg } = await supabase
    .from("app_anthropic_config")
    .select("api_key")
    .single();
  if (!cfg?.api_key)
    return new Response(
      JSON.stringify({ error: "anthropic_api_key_missing" }),
      { status: 500 },
    );
  const apiKey = cfg.api_key;

  const akten = (
    await loadAll("zid, az, bekanntmachung_text, objektdaten_ki_am", (q) =>
      q
        .not("bekanntmachung_text", "is", null)
        .is("objektdaten_ki_am", null)
        .gt("termin", new Date().toISOString())
        .neq("status", "aufgehoben"),
    )
  ).slice(0, limit);

  const st = { offen: akten.length, ok: 0, failed: 0, credit_blocked: false };
  let blocked = false;
  for (let i = 0; i < akten.length && !blocked; i += CONCURRENCY) {
    if (Date.now() - t0 > budgetMs) break;
    const chunk = akten.slice(i, i + CONCURRENCY);
    const res = await Promise.all(
      chunk.map((a: any) =>
        processAkte(apiKey, a).catch(() => "failed" as const),
      ),
    );
    for (const r of res) {
      if (r === "credit") {
        blocked = true;
        continue;
      }
      if (r === "ok") st.ok++;
      else st.failed++;
    }
  }

  if (blocked) {
    await supabase.from("app_anthropic_status").upsert({
      id: 1,
      credit_blocked_at: new Date().toISOString(),
      last_error: "Anthropic: credit balance too low (extract-objektdaten)",
      updated_at: new Date().toISOString(),
    });
    st.credit_blocked = true;
  } else if (st.ok > 0) {
    await supabase
      .from("app_anthropic_status")
      .update({ credit_blocked_at: null, updated_at: new Date().toISOString() })
      .eq("id", 1);
  }

  return new Response(JSON.stringify(st, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
