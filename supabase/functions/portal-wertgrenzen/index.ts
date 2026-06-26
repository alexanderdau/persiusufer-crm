import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Setzt zvg_akte.wertgrenzen_weggefallen für Verfahren, bei denen die 5/10- und
// 7/10-Wertgrenzen entfallen sind (Zuschlag unter Wert möglich – interessante
// Investorenfälle). Die Terminsuche hat dafür die Checkbox `hinweis`: mit
// hinweis=on + leerem ger_id + all=1 liefert eine Suche je Bundesland genau diese
// Verfahren. Match per az_norm. Setzt nur auf TRUE (Wegfall ist dauerhaft).
// Läuft serverlos per Cron, nach dem Detail-Cron.

const TOKEN = "pwert-9k3m7q2v";
const BASE = "https://www.zvg-portal.de";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const AC = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "de-DE,de;q=0.9",
};
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const STATE_TO_LAND: Record<string, string> = {
  BW: "bw",
  BY: "by",
  BE: "be",
  BB: "br",
  HB: "hb",
  HH: "hh",
  HE: "he",
  MV: "mv",
  NI: "ni",
  NW: "nw",
  RP: "rp",
  SL: "sl",
  SN: "sn",
  ST: "st",
  SH: "sh",
  TH: "th",
};

function azNormV2(az: string): string {
  const s = az.toLowerCase().trim().replace(/ /g, "");
  const m = s.match(/^0*(\d+)k0*(\d+)[-/](\d+)$/);
  if (!m) return s.replace(/\//g, "-");
  let [, p, n, y] = m;
  if (y.length === 4) y = y.slice(2);
  return `${p}k${n}-${y}`;
}

async function get(url: string): Promise<string> {
  return await (
    await fetch(url, { headers: { "User-Agent": UA, ...AC } })
  ).text();
}

// hinweis=on -> nur Verfahren mit weggefallenen Wertgrenzen, ganzes Bundesland.
async function searchWeggefallen(land: string): Promise<string[]> {
  const form = new URLSearchParams({
    ger_name: "",
    order_by: "2",
    land_abk: land,
    ger_id: "",
    az1: "",
    az2: "",
    az3: "",
    az4: "",
    art: "",
    obj: "",
    str: "",
    hnr: "",
    plz: "",
    ort: "",
    ortsteil: "",
    vtermin: "",
    btermin: "",
    hinweis: "on",
  });
  const r = await fetch(BASE + "/index.php?button=Suchen&all=1", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: BASE + "/index.php?button=Termine%20suchen",
      ...AC,
    },
    body: form.toString(),
  });
  const html = await r.text();
  const norms = new Set<string>();
  for (const blob of html
    .split("<a target=blank_ href=index.php?button=showZvg")
    .slice(1)) {
    const maz = blob.match(/<nobr>([\d\sK\/]+?)&nbsp;\(Detailansicht\)/);
    if (maz) norms.add(azNormV2(maz[1].replace(/&nbsp;/g, " ")));
  }
  return [...norms];
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get("token") !== TOKEN)
    return new Response("forbidden", { status: 403 });

  await get(BASE + "/index.php");
  await get(BASE + "/index.php?button=Termine%20suchen");

  const stats: Record<string, number> = { laender: 0, geflaggt: 0, errors: 0 };
  for (const [state, land] of Object.entries(STATE_TO_LAND)) {
    stats.laender++;
    try {
      const norms = await searchWeggefallen(land);
      if (norms.length) {
        const { data } = await supabase
          .from("zvg_akte")
          .update({ wertgrenzen_weggefallen: true })
          .eq("state_abbr", state)
          .eq("wertgrenzen_weggefallen", false)
          .in("az_norm", norms)
          .select("zid");
        stats.geflaggt += data?.length ?? 0;
      }
    } catch (_) {
      stats.errors++;
    }
  }
  return new Response(JSON.stringify(stats, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
