import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

// Text-Extraktion für Bekanntmachungs-/Anordnungs-PDFs.
//  - Standard: unpdf (Text-PDFs, gratis). Scans -> volltext_am markiert.
//  - &vision=1: zusätzlich Haiku-Vision-Transkription (PLAIN TEXT) für Scans
//    (kostet Guthaben). Schreibt zvg_akte_dokumente.volltext + zvg_akte.
//    bekanntmachung_text. Credit-Fehler -> app_anthropic_status + Abbruch.

const TOKEN = "ptext-8h3v6k2q";
const MODEL = "claude-haiku-4-5-20251001";
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function pdfToText(buf: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: true });
  return typeof text === "string"
    ? text
    : Array.isArray(text)
      ? text.join("\n")
      : "";
}

async function haikuVision(
  apiKey: string,
  buf: Uint8Array,
): Promise<{ text?: string; error?: string }> {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk)
    bin += String.fromCharCode.apply(
      null,
      Array.from(buf.subarray(i, i + chunk)),
    );
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: btoa(bin),
              },
              title: "Bekanntmachung",
            },
            {
              type: "text",
              text: "Transkribiere den gesamten sichtbaren Text dieses Dokuments wörtlich und vollständig auf Deutsch. Gib AUSSCHLIESSLICH den reinen Text zurück — kein JSON, keine Kommentare, keine Einleitung.",
            },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    return { error: `anthropic_${resp.status}: ${t.slice(0, 200)}` };
  }
  const j = await resp.json();
  return { text: j?.content?.[0]?.text ?? "" };
}

async function storeText(zid: string, storage_path: string, text: string) {
  const now = new Date().toISOString();
  await supabase
    .from("zvg_akte_dokumente")
    .update({ volltext: text, volltext_am: now })
    .eq("zid", zid)
    .eq("storage_path", storage_path);
  await supabase
    .from("zvg_akte")
    .update({ bekanntmachung_text: text, bekanntmachung_text_am: now })
    .eq("zid", zid)
    .is("bekanntmachung_text", null);
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get("token") !== TOKEN)
    return new Response("forbidden", { status: 403 });
  const limit = parseInt(u.searchParams.get("limit") || "40");
  const vision = u.searchParams.get("vision") === "1";
  const t0 = Date.now();
  const budgetMs = 110000;

  let apiKey: string | null = null;
  if (vision) {
    const { data: cfg } = await supabase
      .from("app_anthropic_config")
      .select("api_key")
      .single();
    apiKey = cfg?.api_key ?? null;
  }

  // Standard: nur noch nicht versuchte. Vision: alle offenen (auch unpdf-Scans).
  let query = supabase
    .from("zvg_akte_dokumente")
    .select("zid, storage_path, bucket, art, volltext_am")
    .in("art", ["bekanntmachung", "anordnung"])
    .is("volltext", null);
  if (!vision) query = query.is("volltext_am", null);
  const { data: docs } = await query.limit(limit);

  const st = {
    total: docs?.length ?? 0,
    text: 0,
    vision: 0,
    scan: 0,
    error: 0,
    credit_blocked: false,
  };
  let blocked = false;
  for (const d of docs ?? []) {
    if (blocked || Date.now() - t0 > budgetMs) break;
    try {
      const { data: blob } = await supabase.storage
        .from(d.bucket || "zvg-documents")
        .download(d.storage_path);
      if (!blob) {
        st.error++;
        continue;
      }
      const buf = new Uint8Array(await blob.arrayBuffer());
      // Bereits als Scan markierte Docs (volltext_am gesetzt) im Vision-Modus
      // direkt zu Haiku — unpdf würde nur pdf.js-Speicher kosten.
      const skipUnpdf = vision && d.volltext_am != null;
      let text = "";
      if (!skipUnpdf) {
        try {
          text = await pdfToText(buf);
        } catch {
          text = "";
        }
      }
      if (text.replace(/\s+/g, " ").trim().length > 300) {
        await storeText(d.zid, d.storage_path, text);
        st.text++;
        continue;
      }
      // Scan.
      if (vision && apiKey) {
        const r = await haikuVision(apiKey, buf);
        if (r.error) {
          if (/credit balance is too low|insufficient.*credit/i.test(r.error)) {
            blocked = true;
            break;
          }
          st.error++;
          continue;
        }
        const vt = (r.text ?? "").trim();
        if (vt.replace(/\s+/g, " ").length > 200) {
          await storeText(d.zid, d.storage_path, vt);
          st.vision++;
          continue;
        }
      }
      // kein Text (auch Vision leer/aus) -> markieren.
      await supabase
        .from("zvg_akte_dokumente")
        .update({ volltext_am: new Date().toISOString() })
        .eq("zid", d.zid)
        .eq("storage_path", d.storage_path);
      st.scan++;
    } catch (_) {
      st.error++;
    }
  }

  if (blocked) {
    await supabase.from("app_anthropic_status").upsert({
      id: 1,
      credit_blocked_at: new Date().toISOString(),
      last_error: "Anthropic: credit balance too low (extract-pdf-text)",
      updated_at: new Date().toISOString(),
    });
    st.credit_blocked = true;
  } else if (st.vision > 0) {
    await supabase
      .from("app_anthropic_status")
      .update({ credit_blocked_at: null, updated_at: new Date().toISOString() })
      .eq("id", 1);
  }

  return new Response(JSON.stringify(st, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
