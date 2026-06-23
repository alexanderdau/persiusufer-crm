import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const getLetzterWerktag = (today: Date): { start: string; end: string; label: string } => {
  const d = new Date(today);
  const dow = d.getUTCDay();
  let back = 1;
  if (dow === 1) back = 3;
  else if (dow === 0) back = 2;
  else if (dow === 6) back = 1;
  d.setUTCDate(d.getUTCDate() - back);
  const startUtc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
  const endUtc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59));
  return { start: startUtc.toISOString(), end: endUtc.toISOString(), label: startUtc.toISOString().slice(0, 10) };
};

const plusTenWorkdays = (from: Date): string => {
  const d = new Date(from);
  let added = 0;
  while (added < 10) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
};

Deno.serve(async (_req: Request) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, key);

  const today = new Date();
  const window = getLetzterWerktag(today);
  const reAnfrage = plusTenWorkdays(today);

  // Aufgehobene Akten ausschließen + nur Akten mit AG-Verknüpfung
  const { data: akten, error: aktenErr } = await sb
    .from("zvg_akte")
    .select("zid, az, ag_company_id, rechtspfleger_contact_id, termin, status")
    .gte("termin", window.start)
    .lte("termin", window.end)
    .neq("status", "aufgehoben")
    .not("ag_company_id", "is", null);

  if (aktenErr) {
    return new Response(JSON.stringify({ success: false, step: "akten", error: aktenErr.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const created: string[] = [];
  const skipped: { zid: string; reason: string }[] = [];

  for (const a of akten ?? []) {
    const { data: existing, error: exErr } = await sb
      .from("zvg_anfrage")
      .select("id, status")
      .eq("zid", a.zid)
      .eq("anlass", "nach_termin")
      .limit(1);
    if (exErr) { skipped.push({ zid: a.zid, reason: `lookup_error: ${exErr.message}` }); continue; }
    if (existing && existing.length > 0) { skipped.push({ zid: a.zid, reason: `already_exists_status_${existing[0].status}` }); continue; }

    const { error: insErr } = await sb.from("zvg_anfrage").insert({
      zid: a.zid,
      ag_company_id: a.ag_company_id,
      rechtspfleger_contact_id: a.rechtspfleger_contact_id,
      anlass: "nach_termin",
      status: "entwurf",
      gesendet_per: "email",
      re_anfrage_faellig_am: reAnfrage,
    });
    if (insErr) { skipped.push({ zid: a.zid, reason: `insert_error: ${insErr.message}` }); continue; }
    created.push(a.zid);
  }

  return new Response(JSON.stringify({
    success: true,
    window: window.label,
    akten_gefunden: akten?.length ?? 0,
    vorschlaege_erstellt: created.length,
    uebersprungen: skipped.length,
    created, skipped,
  }), { headers: { "Content-Type": "application/json" } });
});
