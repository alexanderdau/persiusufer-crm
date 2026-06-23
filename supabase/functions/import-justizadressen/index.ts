import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-import-secret, authorization, apikey",
};

type Rec = {
  name: string;
  lieferanschrift?: string;
  postanschrift?: string;
  telefon?: string;
  fax?: string;
  internet?: string;
  internet_2?: string;
  email?: string;
  mail_disclaimer?: string;
  xjustiz_id?: string;
};

function parseAddr(addr?: string): { street?: string; zip?: string; city?: string } {
  if (!addr) return {};
  const lines = addr.split("\n").map((l: string) => l.trim()).filter(Boolean);
  if (lines.length === 0) return {};
  let street, zip, city;
  const last = lines[lines.length - 1];
  const m = last.match(/^(\d{5})\s+(.+)$/);
  if (m) {
    zip = m[1];
    city = m[2];
    street = lines.slice(0, -1).join(", ");
  } else {
    street = lines.join(", ");
  }
  return { street, zip, city };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: CORS });
  const secret = Deno.env.get("IMPORT_JUSTIZ_SECRET");
  if (secret) {
    const hdr = req.headers.get("x-import-secret");
    if (hdr !== secret) return new Response("forbidden", { status: 403, headers: CORS });
  }

  let payload: { state_abbr: string; records: Rec[] };
  try { payload = await req.json(); }
  catch { return new Response("bad json", { status: 400, headers: CORS }); }
  const state_abbr = payload.state_abbr;
  const records = payload.records || [];
  if (!state_abbr || !Array.isArray(records)) return new Response("missing fields", { status: 400, headers: CORS });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let matched = 0, inserted = 0;
  const errors: any[] = [];
  const summary: any[] = [];

  for (const r of records) {
    try {
      const liefer = parseAddr(r.lieferanschrift);
      const fields: Record<string, any> = {
        xjustiz_id: r.xjustiz_id ?? null,
        lieferanschrift: r.lieferanschrift ?? null,
        postanschrift: r.postanschrift ?? null,
        phone_number: r.telefon ?? null,
        telefax: r.fax ?? null,
        website: r.internet ?? null,
        internet_2: r.internet_2 ?? null,
        email: r.email ?? null,
        email_hinweis: r.mail_disclaimer ?? null,
        email_quelle: r.email ? "justizadressen" : (r.mail_disclaimer ? "nicht_veroeffentlicht" : null),
      };
      let existingId: number | null = null;
      if (r.xjustiz_id) {
        const { data: byX } = await sb.from("companies").select("id").eq("xjustiz_id", r.xjustiz_id).maybeSingle();
        if (byX) existingId = byX.id;
      }
      if (!existingId) {
        const { data: byName } = await sb.from("companies")
          .select("id, name")
          .ilike("name", r.name)
          .eq("state_abbr", state_abbr)
          .limit(1);
        if (byName && byName.length > 0) existingId = byName[0].id;
      }
      if (!existingId) {
        const cityPart = r.name.replace(/^Amtsgericht\s+/, "").split(/[\s(\/]/)[0];
        if (cityPart && cityPart.length > 2) {
          const { data: byCity } = await sb.from("companies")
            .select("id, name")
            .ilike("name", `%${cityPart}%`)
            .eq("state_abbr", state_abbr)
            .ilike("sector", "%amtsgericht%")
            .limit(2);
          if (byCity && byCity.length === 1) existingId = byCity[0].id;
        }
      }

      if (existingId) {
        const { error } = await sb.from("companies").update(fields).eq("id", existingId);
        if (error) { errors.push({ name: r.name, error: error.message }); continue; }
        matched++;
        summary.push({ id: existingId, name: r.name, action: "updated" });
      } else {
        const { data: ins, error } = await sb.from("companies").insert({
          name: r.name,
          sector: "Amtsgericht",
          state_abbr,
          city: liefer.city ?? null,
          zipcode: liefer.zip ?? null,
          address: liefer.street ?? null,
          ...fields,
        }).select("id").single();
        if (error) { errors.push({ name: r.name, error: error.message }); continue; }
        inserted++;
        summary.push({ id: ins?.id, name: r.name, action: "inserted" });
      }
    } catch (e) {
      errors.push({ name: r.name, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ ok: true, state_abbr, matched, inserted, errors, summary }), {
    headers: { "Content-Type": "application/json", ...CORS },
  });
});
