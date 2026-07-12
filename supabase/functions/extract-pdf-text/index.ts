import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

// Laufende Text-Extraktion für Bekanntmachungs-/Anordnungs-PDFs (Text-PDFs,
// gratis via unpdf). Schreibt zvg_akte_dokumente.volltext + zvg_akte.
// bekanntmachung_text. Idempotent (volltext IS NULL und noch nicht versucht).
// Scans (kein Text) werden mit volltext_am markiert -> nicht endlos neu versucht,
// bleiben für die Haiku-Vision offen. Als Cron NACH portal-anhang gedacht.

const TOKEN = "ptext-8h3v6k2q";
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

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get("token") !== TOKEN)
    return new Response("forbidden", { status: 403 });
  const limit = parseInt(u.searchParams.get("limit") || "40");
  const t0 = Date.now();
  const budgetMs = 110000;

  const { data: docs } = await supabase
    .from("zvg_akte_dokumente")
    .select("zid, storage_path, bucket, art")
    .in("art", ["bekanntmachung", "anordnung"])
    .is("volltext", null)
    .is("volltext_am", null)
    .limit(limit);

  const st = { total: docs?.length ?? 0, text: 0, scan: 0, error: 0 };
  for (const d of docs ?? []) {
    if (Date.now() - t0 > budgetMs) break;
    try {
      const { data: blob } = await supabase.storage
        .from(d.bucket || "zvg-documents")
        .download(d.storage_path);
      if (!blob) {
        st.error++;
        continue;
      }
      const buf = new Uint8Array(await blob.arrayBuffer());
      let text = "";
      try {
        text = await pdfToText(buf);
      } catch {
        text = "";
      }
      const clean = text.replace(/\s+/g, " ").trim();
      const now = new Date().toISOString();
      if (clean.length > 300) {
        await supabase
          .from("zvg_akte_dokumente")
          .update({ volltext: text, volltext_am: now })
          .eq("zid", d.zid)
          .eq("storage_path", d.storage_path);
        // Blob auf die Akte (nur wenn noch leer).
        await supabase
          .from("zvg_akte")
          .update({ bekanntmachung_text: text, bekanntmachung_text_am: now })
          .eq("zid", d.zid)
          .is("bekanntmachung_text", null);
        st.text++;
      } else {
        // Scan: markieren (volltext_am), damit nicht endlos neu versucht.
        await supabase
          .from("zvg_akte_dokumente")
          .update({ volltext_am: now })
          .eq("zid", d.zid)
          .eq("storage_path", d.storage_path);
        st.scan++;
      }
    } catch (_) {
      st.error++;
    }
  }

  return new Response(JSON.stringify(st, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
