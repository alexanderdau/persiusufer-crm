import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// Stabile, gepinnte Quelle statt esm.sh (das rebuildet → "gestern ok, heute kaputt").
import * as pdfjs from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";

const TOKEN = "pdfimg-3k7q9w2v";
const MIN_W = 300;
const MIN_H = 200;
const MAX_IMAGES_PER_DOC = 30;
// Anzeige-Bucket (gleicher, den Liste/Show lesen) — kein separates Surfacing nötig.
const BILDER_BUCKET = "zvg-bilder";

// Worker deaktivieren (Edge-Runtime hat keinen Worker-Pool).
// @ts-ignore
if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = "";

async function extractJpegStreams(
  pdfBytes: Uint8Array,
): Promise<
  Array<{
    pageIdx: number;
    imgIdx: number;
    data: Uint8Array;
    width: number;
    height: number;
  }>
> {
  const results: Array<any> = [];
  const doc = await pdfjs.getDocument({
    data: pdfBytes,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;
  for (let p = 1; p <= doc.numPages; p++) {
    let page;
    try {
      page = await doc.getPage(p);
    } catch {
      continue;
    }
    let ops;
    try {
      ops = await page.getOperatorList();
    } catch {
      continue;
    }
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
        const data: Uint8Array | undefined = img.data;
        if (!data || !data.byteLength) continue;
        // Nur direkt eingebettete JPEGs (DCTDecode beginnt mit 0xFFD8).
        const isJpeg = data[0] === 0xff && data[1] === 0xd8;
        if (!isJpeg) continue;
        results.push({
          pageIdx: p,
          imgIdx: imgIdx++,
          data,
          width: w,
          height: h,
        });
        if (results.length >= MAX_IMAGES_PER_DOC) return results;
      } catch {
        /* skip */
      }
    }
  }
  return results;
}

async function processOneAkte(
  sb: any,
  zid: string,
): Promise<{ ok: boolean; paths: string[]; error?: string }> {
  const { data: docs } = await sb
    .from("zvg_akte_dokumente")
    .select("id, art, storage_path, bucket")
    .eq("zid", zid)
    .in("art", ["gutachten", "expose"])
    .order("art", { ascending: true });
  if (!docs || docs.length === 0) return { ok: true, paths: [] };

  const paths: string[] = [];
  for (const d of docs) {
    if (paths.length >= MAX_IMAGES_PER_DOC) break;
    const { data: blob, error: dlErr } = await sb.storage
      .from(d.bucket ?? "zvg-documents")
      .download(d.storage_path);
    if (dlErr || !blob) continue;
    const buf = new Uint8Array(await blob.arrayBuffer());
    let imgs;
    try {
      imgs = await extractJpegStreams(buf);
    } catch (e: any) {
      return {
        ok: false,
        paths,
        error: `pdf_parse_failed: ${e?.message ?? String(e)}`,
      };
    }
    for (const im of imgs) {
      const path = `${zid}/extract_${d.art}_p${im.pageIdx}_${im.imgIdx}.jpg`;
      const { error: upErr } = await sb.storage
        .from(BILDER_BUCKET)
        .upload(path, im.data, { contentType: "image/jpeg", upsert: true });
      if (upErr) continue;
      // Metadaten-Tabelle (best effort).
      await sb.from("zvg_akte_bild").upsert(
        {
          zid,
          source_doc_art: d.art,
          source_doc_id: d.id,
          storage_path: path,
          bucket: BILDER_BUCKET,
          page_index: im.pageIdx,
          image_index: im.imgIdx,
          width: im.width,
          height: im.height,
          size_bytes: im.data.byteLength,
          mime_type: "image/jpeg",
        },
        { onConflict: "bucket,storage_path", ignoreDuplicates: true },
      );
      paths.push(path);
    }
  }
  return { ok: true, paths };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("token") !== TOKEN)
    return new Response("forbidden", { status: 403 });
  const batch = parseInt(url.searchParams.get("batch") ?? "5");
  const sb = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const { data: kandidaten } = await sb
    .from("zvg_akte")
    .select("zid, cover_bild_path, bilder_paths")
    .or("hat_gutachten_lokal.eq.true,hat_expose_lokal.eq.true")
    .is("bilder_extraction_at", null)
    .limit(batch);

  const stats = { processed: 0, total_images: 0, errors: 0 };
  if (!kandidaten || kandidaten.length === 0) {
    return new Response(JSON.stringify({ done: true, ...stats }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const a of kandidaten) {
    stats.processed++;
    try {
      const r = await processOneAkte(sb, a.zid);

      // bilder_paths idempotent mergen: alte extract_-Pfade ersetzen, Rest behalten.
      const existing: string[] = Array.isArray(a.bilder_paths)
        ? a.bilder_paths
        : [];
      const keep = existing.filter((p) => !p.includes("/extract_"));
      const merged = [...keep, ...r.paths];
      const update: Record<string, unknown> = {
        bilder_extraction_at: new Date().toISOString(),
        bilder_extraction_count: r.paths.length,
        bilder_extraction_error: r.error ?? null,
        bilder_paths: merged,
      };
      // cover_bild_path nur setzen, wenn noch keins da ist (zvg.com-Cover hat Vorrang).
      if (!a.cover_bild_path && r.paths.length > 0) {
        update.cover_bild_path = r.paths[0];
      }
      await sb.from("zvg_akte").update(update).eq("zid", a.zid);

      if (r.ok) stats.total_images += r.paths.length;
      else stats.errors++;
    } catch (e: any) {
      stats.errors++;
      await sb
        .from("zvg_akte")
        .update({
          bilder_extraction_at: new Date().toISOString(),
          bilder_extraction_count: 0,
          bilder_extraction_error: `unhandled: ${e?.message ?? String(e)}`,
        })
        .eq("zid", a.zid);
    }
  }

  return new Response(JSON.stringify(stats, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
