import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as pdfjs from "https://esm.sh/pdfjs-dist@4.10.38/legacy/build/pdf.mjs";

const TOKEN = "pdfimg-3k7q9w2v";
const MIN_W = 300;
const MIN_H = 200;
const MAX_IMAGES_PER_DOC = 30;

// Disable worker (Deno hat keinen Worker-Pool ohne separate Datei)
// @ts-ignore
if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = "";

// Konvertiert RGBA-Bytes (von pdfjs intern) zu PNG via pngjs (light)
// Pragmatisch: wir nutzen die Image-Raw-Daten direkt aus dem PDF (FlateDecode/DCTDecode)
// und speichern sie mit dem Original-Stream-Inhalt — ohne Re-Encoding.

async function extractRawImageStreams(pdfBytes: Uint8Array): Promise<Array<{ pageIdx: number; imgIdx: number; data: Uint8Array; mime: string; width: number; height: number }>> {
  const results: Array<any> = [];
  const doc = await pdfjs.getDocument({ data: pdfBytes, disableWorker: true, isEvalSupported: false, useSystemFonts: false }).promise;
  for (let p = 1; p <= doc.numPages; p++) {
    let page;
    try { page = await doc.getPage(p); } catch { continue; }
    let ops;
    try { ops = await page.getOperatorList(); } catch { continue; }
    let imgIdx = 0;
    for (let j = 0; j < ops.fnArray.length; j++) {
      // OPS.paintImageXObject = 85, OPS.paintInlineImageXObject = 86
      if (ops.fnArray[j] !== 85 && ops.fnArray[j] !== 86) continue;
      const name = ops.argsArray[j]?.[0];
      if (!name) continue;
      try {
        const img = await page.objs.get(name);
        if (!img) continue;
        const w = img.width ?? 0;
        const h = img.height ?? 0;
        if (w < MIN_W || h < MIN_H) continue;
        // Versuche raw data zu bekommen (kann pixel-RGBA oder JPEG sein)
        const data: Uint8Array | undefined = img.data;
        if (!data || !data.byteLength) continue;
        // Heuristik: JPEG beginnt mit 0xFFD8
        const isJpeg = data[0] === 0xFF && data[1] === 0xD8;
        if (!isJpeg) continue; // RGBA-PNG-Encoding bräuchte zusätzliche Lib — skip
        results.push({ pageIdx: p, imgIdx: imgIdx++, data, mime: "image/jpeg", width: w, height: h });
        if (results.length >= MAX_IMAGES_PER_DOC) return results;
      } catch { /* skip */ }
    }
  }
  return results;
}

async function processOneAkte(sb: any, zid: string): Promise<{ ok: boolean; count: number; error?: string }> {
  // Beste Quelle: gutachten > expose > sonstiges
  const { data: docs } = await sb
    .from("zvg_akte_dokumente")
    .select("id, art, storage_path, bucket")
    .eq("zid", zid)
    .in("art", ["gutachten", "expose"])
    .order("art", { ascending: true });
  if (!docs || docs.length === 0) return { ok: true, count: 0 };

  let total = 0;
  for (const d of docs) {
    if (total >= MAX_IMAGES_PER_DOC) break;
    // PDF aus Storage laden
    const { data: blob, error: dlErr } = await sb.storage.from(d.bucket ?? "zvg-documents").download(d.storage_path);
    if (dlErr || !blob) continue;
    const buf = new Uint8Array(await blob.arrayBuffer());
    let imgs;
    try {
      imgs = await extractRawImageStreams(buf);
    } catch (e: any) {
      return { ok: false, count: total, error: `pdf_parse_failed: ${e?.message ?? String(e)}` };
    }
    // Speichern
    for (const im of imgs) {
      const path = `${zid}/${d.art}_p${im.pageIdx}_${im.imgIdx}.jpg`;
      const { error: upErr } = await sb.storage.from("zvg-akte-bilder").upload(path, im.data, { contentType: im.mime, upsert: true });
      if (upErr) continue;
      await sb.from("zvg_akte_bild").insert({
        zid, source_doc_art: d.art, source_doc_id: d.id,
        storage_path: path, bucket: "zvg-akte-bilder",
        page_index: im.pageIdx, image_index: im.imgIdx,
        width: im.width, height: im.height, size_bytes: im.data.byteLength,
        mime_type: im.mime,
      });
      total++;
    }
  }
  return { ok: true, count: total };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("token") !== TOKEN) return new Response("forbidden", { status: 403 });
  const batch = parseInt(url.searchParams.get("batch") ?? "5");
  const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  // Akten finden: hat Gutachten/Exposé, noch nicht extrahiert
  const { data: kandidaten } = await sb
    .from("zvg_akte")
    .select("zid")
    .or("hat_gutachten_lokal.eq.true,hat_expose_lokal.eq.true")
    .is("bilder_extraction_at", null)
    .limit(batch);

  const stats = { processed: 0, total_images: 0, errors: 0 };
  if (!kandidaten || kandidaten.length === 0) {
    return new Response(JSON.stringify({ done: true, ...stats }), { headers: { "Content-Type": "application/json" } });
  }

  for (const a of kandidaten) {
    stats.processed++;
    try {
      const r = await processOneAkte(sb, a.zid);
      await sb.from("zvg_akte").update({
        bilder_extraction_at: new Date().toISOString(),
        bilder_extraction_count: r.count,
        bilder_extraction_error: r.error ?? null,
      }).eq("zid", a.zid);
      if (r.ok) stats.total_images += r.count;
      else stats.errors++;
    } catch (e: any) {
      stats.errors++;
      await sb.from("zvg_akte").update({
        bilder_extraction_at: new Date().toISOString(),
        bilder_extraction_count: 0,
        bilder_extraction_error: `unhandled: ${e?.message ?? String(e)}`,
      }).eq("zid", a.zid);
    }
  }

  return new Response(JSON.stringify(stats, null, 2), { headers: { "Content-Type": "application/json" } });
});
