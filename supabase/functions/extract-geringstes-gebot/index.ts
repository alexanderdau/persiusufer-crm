import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MODEL = "claude-haiku-4-5-20251001";
// Anthropic-Limit: ~200k Tokens ≈ grob 600k base64-encoded Bytes (PDF mit Text/Bildern variiert stark)
// Konservativ: max. 2.5 MB Total-PDF-Größe pro Anfrage.
const MAX_TOTAL_PDF_BYTES = 2_500_000;
const MAX_SINGLE_PDF_BYTES = 2_500_000;

const SYSTEM_PROMPT = `Du bist Spezialist für deutsche Zwangsversteigerungs-Verfahren nach ZVG. Du analysierst Dokumente aus einer ZVG-Akte und ermittelst daraus das geringste Gebot nach § 44 ZVG.

Dokumente:
- VERKEHRSWERT-GUTACHTEN: Verkehrswerte + Grundbuch-Eintragungen (Abt. II + III).
- ANORDNUNG / AMTLICHE BEKANNTMACHUNG: betreibendes Recht + RANG — wichtigste Quelle.
- GLÄUBIGER-LISTE: optional, expliziter Rang + Forderung.

Grundsatz § 44 ZVG: Geringstes Gebot = vorgehende Rechte/Lasten + Verfahrenskosten.
- Rang 1: nur öffentliche Lasten vor (meist nicht beziffert).
- Rang 2+: alle höherrangigen Abt-II/III-Eintragungen berücksichtigen; Nennbetrag konservativ ansetzen.

Antwort: pures JSON nach Schema:

{
  "rang_betreibend": Number | null,
  "bestehenbleibende_rechte": [
    { "rang": Number, "abteilung": "II" | "III" | "oeffentliche_last", "art": String, "glaeubiger": String | null, "valuta_eur_geschaetzt": Number | null, "bemerkung": String | null }
  ],
  "geringstes_gebot_eur_geschaetzt": Number | null,
  "warnung": String | null,
  "begruendung": String,
  "quellen": [String]
}`;

async function runHaikuJob(
  sb: any,
  apiKey: string,
  zid: string,
  az: string,
  vkw_eur: number | null,
  art: string | null,
) {
  try {
    // Reihenfolge nach Wichtigkeit: anordnung > glaeubiger > gutachten
    const order = ["anordnung", "glaeubiger", "gutachten"];
    const dokumente: {
      art: string;
      titel: string;
      storage_path: string;
      bucket: string;
      bytes: number;
    }[] = [];
    for (const a of order) {
      const { data: ds } = await sb
        .from("zvg_akte_dokumente")
        .select("art, titel, storage_path, bucket, mime_type")
        .eq("zid", zid)
        .eq("art", a)
        .order("created_at", { ascending: false })
        .limit(1);
      if (ds && ds.length > 0 && (ds[0].mime_type ?? "").includes("pdf")) {
        const { data: obj } = await sb
          .from("storage.objects" as any)
          .select("metadata")
          .eq("bucket_id", ds[0].bucket || "zvg-documents")
          .eq("name", ds[0].storage_path)
          .maybeSingle()
          .then((r: any) => r)
          .catch(() => ({ data: null }));
        const sizeStr = obj?.metadata?.size ?? null;
        dokumente.push({
          art: ds[0].art,
          titel: ds[0].titel ?? a,
          storage_path: ds[0].storage_path,
          bucket: ds[0].bucket || "zvg-documents",
          bytes: sizeStr ? parseInt(sizeStr) : 0,
        });
      }
    }
    if (dokumente.length === 0) {
      await sb
        .from("zvg_akte")
        .update({
          geringstes_gebot_quelle: "failed",
          geringstes_gebot_job_error: "no_documents_in_storage",
          geringstes_gebot_ermittelt_am: new Date().toISOString(),
        })
        .eq("zid", zid);
      return;
    }

    // PDFs in Reihenfolge laden, aber Total-Limit beachten
    const docBlocks: any[] = [];
    const loadedDocs: string[] = [];
    const skippedDocs: string[] = [];
    let totalBytes = 0;
    for (const d of dokumente) {
      // Pro-Datei-Limit
      if (d.bytes > MAX_SINGLE_PDF_BYTES) {
        skippedDocs.push(
          `${d.art} ("${d.titel}", ${(d.bytes / 1_000_000).toFixed(1)} MB — zu groß)`,
        );
        continue;
      }
      // Gesamt-Limit
      if (totalBytes + d.bytes > MAX_TOTAL_PDF_BYTES) {
        skippedDocs.push(
          `${d.art} ("${d.titel}", würde Gesamt-Limit überschreiten)`,
        );
        continue;
      }
      const { data: blob } = await sb.storage
        .from(d.bucket)
        .download(d.storage_path);
      if (!blob) continue;
      const arrBuf = await blob.arrayBuffer();
      const realSize = arrBuf.byteLength;
      if (totalBytes + realSize > MAX_TOTAL_PDF_BYTES) {
        skippedDocs.push(
          `${d.art} ("${d.titel}", ${(realSize / 1_000_000).toFixed(1)} MB nach Download — Limit)`,
        );
        continue;
      }
      const bytes = new Uint8Array(arrBuf);
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk)
        bin += String.fromCharCode.apply(
          null,
          Array.from(bytes.subarray(i, i + chunk)),
        );
      docBlocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: btoa(bin),
        },
        title: (d.titel ?? d.art).slice(0, 100),
      });
      loadedDocs.push(
        `${d.art} ("${d.titel}", ${(realSize / 1_000_000).toFixed(2)} MB)`,
      );
      totalBytes += realSize;
    }

    if (docBlocks.length === 0) {
      await sb
        .from("zvg_akte")
        .update({
          geringstes_gebot_quelle: "failed",
          geringstes_gebot_job_error: `Alle Dokumente überschreiten das Token-Limit. Übersprungen: ${skippedDocs.join("; ")}`,
          geringstes_gebot_ermittelt_am: new Date().toISOString(),
        })
        .eq("zid", zid);
      return;
    }

    const userText = `Aktenzeichen: ${az ?? "?"}\nVerkehrswert: ${vkw_eur != null ? vkw_eur.toLocaleString("de-DE") + " EUR" : "unbekannt"}\nVerfahrensart: ${art ?? "?"}\nVerwendete Dokumente: ${loadedDocs.join(", ")}${skippedDocs.length > 0 ? `\n\nNICHT verwendet (zu groß für Token-Limit): ${skippedDocs.join(", ")}` : ""}`;

    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [...docBlocks, { type: "text", text: userText }],
          },
        ],
      }),
    });

    if (!anthropicResp.ok) {
      const txt = await anthropicResp.text();
      if (/credit balance is too low|insufficient.*credit/i.test(txt)) {
        await sb.from("app_anthropic_status").upsert({
          id: 1,
          credit_blocked_at: new Date().toISOString(),
          last_error: txt.slice(0, 300),
          updated_at: new Date().toISOString(),
        });
      }
      await sb
        .from("zvg_akte")
        .update({
          geringstes_gebot_quelle: "failed",
          geringstes_gebot_job_error: `anthropic_${anthropicResp.status}: ${txt.slice(0, 500)}`,
          geringstes_gebot_ermittelt_am: new Date().toISOString(),
        })
        .eq("zid", zid);
      return;
    }
    const anthropicJson = await anthropicResp.json();
    const text = anthropicJson?.content?.[0]?.text ?? "";
    let parsed: any = null;
    try {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : text);
    } catch {
      await sb
        .from("zvg_akte")
        .update({
          geringstes_gebot_quelle: "failed",
          geringstes_gebot_job_error:
            "json_parse_failed: " + text.slice(0, 300),
          geringstes_gebot_ermittelt_am: new Date().toISOString(),
        })
        .eq("zid", zid);
      return;
    }

    const rang = parsed.rang_betreibend ?? null;
    const eur = parsed.geringstes_gebot_eur_geschaetzt ?? null;
    const warnungParts: string[] = [];
    if (parsed.warnung) warnungParts.push(parsed.warnung);
    if (rang != null && rang >= 2)
      warnungParts.push(
        `Betrieben aus Rang ${rang} — Abt-III-Vorränge unbekannter Valuta zu erwarten.`,
      );
    if (skippedDocs.length > 0)
      warnungParts.push(
        `Dokumente ausgelassen (zu groß): ${skippedDocs.join("; ")}`,
      );
    const warnung = warnungParts.length > 0 ? warnungParts.join(" · ") : null;
    const begruendung = parsed.begruendung ?? "";
    const rechte = parsed.bestehenbleibende_rechte ?? [];
    const quellen = Array.isArray(parsed.quellen)
      ? parsed.quellen.join(", ")
      : null;
    const notizFull = quellen
      ? `${begruendung}\n\nQuellen: ${quellen}\n\nVerwendet: ${loadedDocs.join(", ")}`
      : `${begruendung}\n\nVerwendet: ${loadedDocs.join(", ")}`;

    await sb
      .from("zvg_akte")
      .update({
        geringstes_gebot_eur: eur,
        geringstes_gebot_rang_betreibend: rang,
        geringstes_gebot_quelle: "gutachten_haiku",
        geringstes_gebot_notiz: notizFull,
        geringstes_gebot_warnung: warnung,
        bestehenbleibende_rechte_jsonb: rechte,
        geringstes_gebot_ermittelt_am: new Date().toISOString(),
        geringstes_gebot_modell: MODEL,
        geringstes_gebot_job_error: null,
      })
      .eq("zid", zid);
    // Erfolg -> Credit-Blockade-Status aufheben (für den UI-Banner).
    await sb
      .from("app_anthropic_status")
      .update({ credit_blocked_at: null, updated_at: new Date().toISOString() })
      .eq("id", 1);
  } catch (e: any) {
    await sb
      .from("zvg_akte")
      .update({
        geringstes_gebot_quelle: "failed",
        geringstes_gebot_job_error:
          `worker_exception: ${e?.message ?? String(e)}`.slice(0, 500),
        geringstes_gebot_ermittelt_am: new Date().toISOString(),
      })
      .eq("zid", zid);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST")
    return new Response("method not allowed", { status: 405 });
  let payload: { zid?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (!payload.zid)
    return new Response(JSON.stringify({ error: "missing_zid" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: cfg } = await sb
    .from("app_anthropic_config")
    .select("api_key")
    .single();
  if (!cfg?.api_key)
    return new Response(
      JSON.stringify({ error: "anthropic_api_key_missing" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  const { data: akte } = await sb
    .from("zvg_akte")
    .select("zid, az, vkw_eur, art")
    .eq("zid", payload.zid)
    .single();
  if (!akte)
    return new Response(JSON.stringify({ error: "akte_not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });

  const startedAt = new Date().toISOString();
  await sb
    .from("zvg_akte")
    .update({
      geringstes_gebot_quelle: "in_progress",
      geringstes_gebot_job_started_at: startedAt,
      geringstes_gebot_job_error: null,
      geringstes_gebot_ermittelt_am: null,
    })
    .eq("zid", payload.zid);

  // @ts-ignore
  EdgeRuntime.waitUntil(
    runHaikuJob(sb, cfg.api_key, akte.zid, akte.az, akte.vkw_eur, akte.art),
  );

  return new Response(
    JSON.stringify({
      success: true,
      job_started: true,
      zid: payload.zid,
      started_at: startedAt,
    }),
    { status: 202, headers: { "Content-Type": "application/json" } },
  );
});
