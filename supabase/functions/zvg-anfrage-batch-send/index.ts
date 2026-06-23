import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Skipped = { zid: string; reason: string; detail?: string };
type Queued = { zid: string; anfrage_id: number };

// Synchroner Teil: Akte prüfen, Entwurf anlegen. Schnell (~100ms).
async function prepareOneAkte(
  sb: any,
  zid: string,
  forceResend: boolean,
): Promise<{ ok: true; anfrage_id: number } | { ok: false; reason: string; detail?: string }> {
  const { data: akte } = await sb
    .from("zvg_akte")
    .select("zid, az, ag_company_id, status, letzte_anfrage_status")
    .eq("zid", zid)
    .single();
  if (!akte) return { ok: false, reason: "akte_not_found" };
  if (akte.status === "aufgehoben") return { ok: false, reason: "aufgehoben" };
  if (!akte.ag_company_id) return { ok: false, reason: "kein_ag" };

  if (
    !forceResend &&
    (akte.letzte_anfrage_status === "gesendet" ||
      akte.letzte_anfrage_status === "beantwortet")
  ) {
    return { ok: false, reason: "bereits_" + akte.letzte_anfrage_status };
  }

  const { data: ag } = await sb
    .from("companies")
    .select("id, name, email")
    .eq("id", akte.ag_company_id)
    .single();
  if (!ag?.email) return { ok: false, reason: "keine_email", detail: ag?.name };

  let anfrageId;
  const { data: existing } = await sb
    .from("zvg_anfrage")
    .select("id, status")
    .eq("zid", zid)
    .order("id", { ascending: false })
    .limit(1);
  if (existing && existing.length > 0 && existing[0].status === "entwurf") {
    anfrageId = existing[0].id;
  } else {
    const { data: created, error: insErr } = await sb
      .from("zvg_anfrage")
      .insert({
        zid,
        ag_company_id: akte.ag_company_id,
        anlass: "batch_status",
        gesendet_per: "email",
        status: "entwurf",
        gesendet_an_email: ag.email,
      })
      .select("id")
      .single();
    if (insErr || !created) return { ok: false, reason: "insert_failed", detail: insErr?.message };
    anfrageId = created.id;
  }

  return { ok: true, anfrage_id: anfrageId };
}

// Asynchron im Hintergrund: löst die SMTP-Sends pro anfrage_id aus.
// Läuft via EdgeRuntime.waitUntil, bricht UI-Antwort nicht auf.
async function triggerAllSends(
  serviceRoleKey: string,
  supabaseUrl: string,
  anfrageIds: number[],
) {
  // Mit kleinem Parallelism, um zvg-anfrage-send nicht zu fluten
  const CHUNK = 3;
  for (let i = 0; i < anfrageIds.length; i += CHUNK) {
    const slice = anfrageIds.slice(i, i + CHUNK);
    await Promise.all(
      slice.map(async (anfrage_id) => {
        try {
          await fetch(`${supabaseUrl}/functions/v1/zvg-anfrage-send`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ anfrage_id }),
          });
        } catch (_) {
          // Fehler werden in zvg_anfrage.job_error gespeichert
        }
      }),
    );
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  let body;
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }

  const zids = Array.isArray(body.zids) ? body.zids.filter((z) => typeof z === "string" && z.length > 0) : [];
  if (zids.length === 0) return new Response(JSON.stringify({ error: "no_zids" }), { status: 400 });
  if (zids.length > 200) return new Response(JSON.stringify({ error: "too_many", limit: 200 }), { status: 400 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const sb = createClient(supabaseUrl, serviceRoleKey);

  // Synchron: alle Akten prüfen + Entwürfe anlegen. Schnell.
  const queued: Queued[] = [];
  const skipped: Skipped[] = [];
  for (const zid of zids) {
    const r = await prepareOneAkte(sb, zid, !!body.force_resend);
    if (r.ok) queued.push({ zid, anfrage_id: r.anfrage_id });
    else skipped.push({ zid, reason: r.reason, detail: r.detail });
  }

  // Asynchron im Hintergrund: SMTP-Sends triggern
  // @ts-ignore
  EdgeRuntime.waitUntil(triggerAllSends(serviceRoleKey, supabaseUrl, queued.map((q) => q.anfrage_id)));

  return new Response(
    JSON.stringify({
      success: true,
      queued_count: queued.length,
      skipped_count: skipped.length,
      queued,
      skipped,
      note: "SMTP-Versand läuft im Hintergrund. Status der einzelnen Anfragen in zvg_anfrage.",
    }),
    { status: 202, headers: { "Content-Type": "application/json" } },
  );
});
