import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TOKEN = "backfill-portal-7f3k9q2v";
const BASE = "https://www.zvg-portal.de";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function unescapeHtml(s: string): string {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&szlig;/g, 'ß').replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü').replace(/&Auml;/g, 'Ä').replace(/&Ouml;/g, 'Ö').replace(/&Uuml;/g, 'Ü').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

function classifyArt(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("gutachten")) return "gutachten";
  if (t.includes("exposee") || t.includes("exposé") || t.includes("expose")) return "expose";
  if (t.includes("bekanntmachung") || t.includes("anordnung")) return "anordnung";
  if (t.includes("gläubiger") || t.includes("glaeubiger")) return "glaeubiger";
  if (t.includes("hinweis") || t.includes("bieter") || t.includes("bietinteressent")) return "biethinweis";
  return "sonstiges";
}

class CookieJar {
  private cookies = new Map<string, string>();
  fromResponse(r: Response) {
    const setCookies = r.headers.get("set-cookie");
    if (!setCookies) return;
    for (const part of setCookies.split(/,(?=\s*[A-Za-z0-9_-]+=)/)) {
      const m = part.match(/^\s*([^=;]+)=([^;]*)/);
      if (m) this.cookies.set(m[1].trim(), m[2].trim());
    }
  }
  header(): string { return [...this.cookies.entries()].map(([k,v]) => `${k}=${v}`).join("; "); }
}

async function sessionInit(jar: CookieJar): Promise<void> {
  const r1 = await fetch(BASE + "/", { headers: { "User-Agent": UA } });
  jar.fromResponse(r1); await r1.arrayBuffer();
  const r2 = await fetch(BASE + "/index.php?button=Termine%20suchen", { headers: { "User-Agent": UA, "Cookie": jar.header(), "Referer": BASE + "/" } });
  jar.fromResponse(r2); await r2.arrayBuffer();
  const form = new URLSearchParams({ ger_name:'',order_by:'2',land_abk:'by',ger_id:'',az1:'',az2:'',az3:'',az4:'',art:'',obj:'',str:'',hnr:'',plz:'',ort:'',ortsteil:'',vtermin:'',btermin:'' });
  const r3 = await fetch(BASE + "/index.php?button=Suchen&all=1", { method: "POST", headers: { "User-Agent": UA, "Cookie": jar.header(), "Referer": BASE + "/index.php?button=Termine%20suchen", "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
  jar.fromResponse(r3); await r3.arrayBuffer();
}

async function fetchDetailHtml(jar: CookieJar, zvgId: number, landAbk: string): Promise<string | null> {
  const url = `${BASE}/index.php?button=showZvg&zvg_id=${zvgId}&land_abk=${landAbk}`;
  const r = await fetch(url, { headers: { "User-Agent": UA, "Cookie": jar.header(), "Referer": BASE + "/index.php?button=Suchen" } });
  jar.fromResponse(r);
  if (!r.ok) return null;
  const buf = await r.arrayBuffer();
  if (buf.byteLength < 500) return null;
  return new TextDecoder("iso-8859-1").decode(buf);
}

type DocLink = { file_id: string; titel: string; art: string; url: string };

function parseDocLinks(html: string): DocLink[] {
  const result: DocLink[] = [];
  const seen = new Set<string>();
  const re = /href="([^"]*file_id=(\d+)[^"]*)"\s*\/?>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (!m[1].includes("showAnhang")) continue;
    const rawUrl = m[1].trim();
    const file_id = m[2];
    if (seen.has(file_id)) continue;
    seen.add(file_id);
    const titelRaw = m[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const titel = unescapeHtml(titelRaw).slice(0, 200) || "Anhang";
    const finalUrl = rawUrl.startsWith("?") ? BASE + "/index.php" + rawUrl : rawUrl.startsWith("http") ? rawUrl : BASE + "/" + rawUrl;
    result.push({ file_id, titel, art: classifyArt(titel), url: finalUrl.replace(/&amp;/g, "&") });
  }
  return result;
}

Deno.serve(async (req: Request) => {
  const u = new URL(req.url);
  if (u.searchParams.get("token") !== TOKEN) return new Response("forbidden", { status: 403 });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const probeZid = u.searchParams.get("probe");
  const batch = parseInt(u.searchParams.get("batch") || "10");

  const jar = new CookieJar();
  await sessionInit(jar);

  if (probeZid) {
    const { data: a } = await sb.from("zvg_akte").select("zid, zvg_portal_id, zvg_portal_land_abk, az").eq("zid", probeZid).single();
    if (!a || !a.zvg_portal_id) return new Response(JSON.stringify({ error: "akte_or_portal_id_missing" }), { status: 404 });
    const html = await fetchDetailHtml(jar, a.zvg_portal_id, a.zvg_portal_land_abk ?? "by");
    if (!html) return new Response(JSON.stringify({ error: "detail_fetch_failed", zid: a.zid }), { status: 200, headers: { "Content-Type": "application/json" } });
    const links = parseDocLinks(html);
    return new Response(JSON.stringify({ zid: a.zid, az: a.az, html_bytes: html.length, links }, null, 2), { headers: { "Content-Type": "application/json" } });
  }

  // ATOMARE Reservierung via PG-Function (FOR UPDATE SKIP LOCKED)
  const { data: akten, error: rpcErr } = await sb.rpc("reserve_backfill_akten", { p_limit: batch });
  if (rpcErr) return new Response(JSON.stringify({ error: "reserve_failed", details: rpcErr.message }), { status: 500 });
  if (!akten || akten.length === 0) return new Response(JSON.stringify({ done: true, akten_processed: 0, message: "keine_akten_zum_verarbeiten" }), { headers: { "Content-Type": "application/json" } });

  const stats = { akten_processed: 0, akten_no_longer_available: 0, docs_added: 0, errors: 0, details: [] as any[] };

  for (const a of akten) {
    try {
      const html = await fetchDetailHtml(jar, a.zvg_portal_id, a.zvg_portal_land_abk ?? "by");
      if (!html) { stats.akten_no_longer_available++; stats.details.push({ zid: a.zid, az: a.az, status: "no_longer_available" }); continue; }
      const links = parseDocLinks(html);
      if (links.length === 0) { stats.details.push({ zid: a.zid, az: a.az, status: "no_links", html_bytes: html.length }); stats.akten_processed++; continue; }

      let docsAddedHere = 0;
      for (const link of links) {
        const path = `${a.zid}/portal_${link.file_id}.pdf`;
        const { data: exists } = await sb.from("zvg_akte_dokumente").select("id").eq("zid", a.zid).eq("storage_path", path).maybeSingle();
        if (exists) continue;

        try {
          const dr = await fetch(link.url, { headers: { "User-Agent": UA, "Cookie": jar.header(), "Referer": BASE + "/index.php?button=showZvg" } });
          jar.fromResponse(dr);
          if (!dr.ok) { stats.errors++; continue; }
          const ct = dr.headers.get("content-type") ?? "";
          if (!ct.includes("pdf")) { continue; }
          const buf = await dr.arrayBuffer();
          await sb.storage.from("zvg-documents").upload(path, new Blob([buf], { type: "application/pdf" }), { upsert: true, contentType: "application/pdf" });
          await sb.from("zvg_akte_dokumente").insert({
            zid: a.zid, art: link.art, titel: `${link.titel} (zvg-portal)`,
            storage_path: path, bucket: "zvg-documents",
            mime_type: "application/pdf", size_bytes: buf.byteLength,
            source: "zvg-portal.de",
          });
          stats.docs_added++; docsAddedHere++;
        } catch (e: any) { stats.errors++; }
      }
      stats.akten_processed++;
      stats.details.push({ zid: a.zid, az: a.az, docs_added: docsAddedHere, total: links.length });
    } catch (e: any) {
      stats.errors++; stats.details.push({ zid: a.zid, error: e?.message ?? String(e) });
    }
  }

  return new Response(JSON.stringify(stats, null, 2), { headers: { "Content-Type": "application/json" } });
});
