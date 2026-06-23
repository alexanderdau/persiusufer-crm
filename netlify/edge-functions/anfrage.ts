/**
 * Magic-Link-Form für Statusanfragen.
 * Aktiv unter anfrage.persiusufer.de; bei allen anderen Hosts wird
 * via context.next() das normale CRM-Bundle durchgereicht.
 *
 * URL: https://anfrage.persiusufer.de/<token>
 *   GET  → HTML-Form
 *   POST → speichert Antwort, zeigt Danke-Seite
 */
import type { Context } from "https://edge.netlify.com/";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const escapeHtml = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const CSS = `:root{--bg:#f5f5f4;--fg:#1c1917;--muted:#78716c;--accent:#166534;--border:#e7e5e4;--card:#fff;--danger:#b91c1c}*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,system-ui,sans-serif;background:var(--bg);color:var(--fg);margin:0;padding:24px 16px 80px;line-height:1.5}.wrap{max-width:640px;margin:0 auto}header{margin-bottom:24px}h1{font-size:22px;margin:0 0 4px;font-weight:600}.sub{color:var(--muted);font-size:14px}.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px 18px;margin-bottom:12px}.meta{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;font-size:14px}.meta dt{color:var(--muted)}.meta dd{margin:0}fieldset{border:0;padding:0;margin:24px 0 0}legend{font-size:14px;color:var(--muted);margin-bottom:8px;padding:0}.opt{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:8px;cursor:pointer;transition:all .1s}.opt:hover{border-color:#a3a3a3}.opt.selected{border-color:var(--accent);background:#f0fdf4}.opt-head{display:flex;align-items:flex-start;gap:10px}.opt-head input[type=radio]{margin-top:3px;flex-shrink:0;width:18px;height:18px;accent-color:var(--accent);cursor:pointer}.opt-text{flex:1;min-width:0}.opt-label{font-weight:500;display:block}.opt-hint{color:var(--muted);font-size:13px;margin-top:2px}.conditional{margin-top:10px;margin-left:28px;display:none;flex-direction:column;gap:8px}.opt.selected .conditional{display:flex}.field{font-size:13px;color:var(--muted);display:block}input[type=date],input[type=time],input[type=text],textarea{font-family:inherit;font-size:15px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:white;width:100%;max-width:280px;margin-top:4px}textarea{max-width:100%;min-height:80px}.submit-row{margin-top:24px;display:flex;gap:12px;align-items:center}button{background:var(--accent);color:white;border:0;padding:12px 24px;font-size:15px;font-weight:500;border-radius:8px;cursor:pointer}.info{background:#fef3c7;border-left:3px solid #d97706;padding:10px 14px;margin:12px 0;border-radius:4px;font-size:14px}.success{background:#f0fdf4;border:1px solid #86efac;color:#14532d;padding:14px 16px;border-radius:8px;text-align:center}.danger{background:#fef2f2;border:1px solid #fca5a5;color:var(--danger);padding:14px 16px;border-radius:8px;text-align:center}footer{margin-top:40px;font-size:12px;color:var(--muted);text-align:center}footer a{color:inherit}`;

const JS = `(function(){
  function update(){
    var radios = document.querySelectorAll('input[name="option"]');
    radios.forEach(function(r){
      var card = r.closest('.opt');
      if (!card) return;
      if (r.checked) card.classList.add('selected');
      else card.classList.remove('selected');
    });
  }
  document.addEventListener('change', function(e){
    if (e.target && e.target.name === 'option') update();
  });
  document.addEventListener('click', function(e){
    var card = e.target.closest && e.target.closest('.opt');
    if (!card) return;
    var radio = card.querySelector('input[type="radio"][name="option"]');
    if (!radio) return;
    // Klick auf das Card-Label (nicht auf input/conditional fields) → radio aktivieren
    var inField = e.target.closest('.conditional, input, textarea, .field');
    if (inField && inField !== card) return;
    radio.checked = true;
    update();
  });
  update();
})();`;

function page(title: string, bodyHtml: string, withScript = false): string {
  const script = withScript ? `<script>${JS}</script>` : "";
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title><style>${CSS}</style></head><body><div class="wrap">${bodyHtml}</div>${script}</body></html>`;
}

function optionCard(value: number, label: string, hint: string, conditional: string): string {
  return `<div class="opt" data-value="${value}"><div class="opt-head"><input type="radio" name="option" value="${value}"${value === 1 ? " required" : ""}><div class="opt-text"><span class="opt-label">${label}</span>${hint ? `<div class="opt-hint">${hint}</div>` : ""}</div></div>${conditional ? `<div class="conditional">${conditional}</div>` : ""}</div>`;
}

function renderForm(akte: any, anfrage: any, token: string, error?: string): string {
  const azEsc = escapeHtml(akte.az);
  const agEsc = escapeHtml(akte.ag_name_raw);
  const objektEsc = escapeHtml([akte.objektart, akte.objekt_ort].filter(Boolean).join(" — "));
  const dateStr = new Date(anfrage.gesendet_am ?? anfrage.created_at).toLocaleDateString("de-DE");
  const errorHtml = error ? `<div class="danger">${escapeHtml(error)}</div>` : "";

  const opts = [
    optionCard(1, "(1) Versteigerungstermin steht noch aus", "Termin ist bereits bestimmt, hat aber noch nicht stattgefunden.",
      `<span class="field">Termin <input type="date" name="termin_1"></span><span class="field">Uhrzeit <input type="time" name="uhrzeit_1"></span><span class="field">Saal <input type="text" name="saal_1" placeholder="z. B. 3"></span>`),
    optionCard(2, "(2) Versteigerungstermin ist aufgehoben", "",
      `<span class="field">Folge-/Neuer Termin (sofern bekannt) <input type="date" name="termin_2"></span>`),
    optionCard(3, "(3) Termin hat stattgefunden — Verkündungstermin nach § 87 II ZVG bestimmt", "",
      `<span class="field">Verkündungstermin <input type="date" name="termin_3"></span><span class="field">Uhrzeit <input type="time" name="uhrzeit_3"></span><span class="field">Saal <input type="text" name="saal_3"></span>`),
    optionCard(4, "(4) Verfahren ist insgesamt aufgehoben / eingestellt", "z. B. nach §§ 28, 30, 31 ZVG.", ""),
    optionCard(5, "(5) Termin hat stattgefunden — Zuschlag im Termin verkündet", "", ""),
    optionCard(6, "(6) Zuschlag wurde versagt (§§ 83 / 85 / 85a ZVG)", "",
      `<span class="field">Folgetermin (sofern bestimmt) <input type="date" name="termin_6"></span>`),
    optionCard(7, "(7) Verteilungstermin (nicht-öffentlich) ist bestimmt", "",
      `<span class="field">Termin <input type="date" name="termin_7"></span>`),
    optionCard(8, "(8) Sonstiger Verfahrensstand", "",
      `<span class="field">Bitte kurz beschreiben<br><textarea name="freitext" placeholder="z. B. Verfahren ausgesetzt, neuer Termin in Vorbereitung, ..."></textarea></span>`),
  ];

  const teilA = opts.slice(0, 4).join("");
  const teilB = opts.slice(4).join("");

  const body = `<header><h1>Statusauskunft Zwangsversteigerungsverfahren</h1><div class="sub">Auskunftsersuchen der Persiusufer Verwaltungs GmbH nach §§ 87 II 2 ZVG, 169 GVG</div></header>${errorHtml}<div class="card"><dl class="meta"><dt>Amtsgericht</dt><dd>${agEsc}</dd><dt>Aktenzeichen</dt><dd><strong>${azEsc}</strong></dd><dt>Objekt</dt><dd>${objektEsc}</dd><dt>Anfragedatum</dt><dd>${dateStr}</dd></dl></div><form method="POST" action="/${escapeHtml(token)}"><input type="hidden" name="csrf" value="${escapeHtml(token)}"><fieldset><legend>Teil A — Öffentliche Termin-Information (§§ 87 II 2 ZVG, 169 GVG)</legend>${teilA}</fieldset><fieldset><legend>Teil B — Verfahrensstand (nur falls in Ihrem Ermessen mitteilbar)</legend>${teilB}</fieldset><fieldset><legend>Absender (optional, aber hilfreich für Rückfragen)</legend><div class="card"><span class="field">Name<br><input type="text" name="sender_name" placeholder="z. B. Fischer"></span><div style="height:8px"></div><span class="field">Funktion<br><input type="text" name="sender_role" placeholder="z. B. Justizsekretärin, Rechtspflegerin"></span></div></fieldset><div class="submit-row"><button type="submit">Statusauskunft absenden</button><span class="sub" style="font-size:12px">Keine Anmeldung erforderlich</span></div></form><footer>Persiusufer Verwaltungs GmbH · Rosenheimer Str. 29 · 10781 Berlin · <a href="mailto:anfrage@persiusufer.de">anfrage@persiusufer.de</a><br>Auskunftsersuchen nach §§ 87 II 2 ZVG, 169 GVG. Datenverarbeitung nur zum Zweck der Verfahrensbeobachtung.</footer>`;
  return page(`Statusauskunft Az. ${akte.az}`, body, true);
}

function renderSuccess(akte: any, option: number): string {
  const opts: Record<number, string> = { 1: "Termin steht noch aus", 2: "Termin ist aufgehoben", 3: "Termin hat stattgefunden — Verkündung", 4: "Verfahren insgesamt aufgehoben", 5: "Zuschlag im Termin verkündet", 6: "Zuschlag versagt", 7: "Verteilungstermin bestimmt", 8: "Sonstiger Verfahrensstand" };
  const body = `<header><h1>Vielen Dank</h1><div class="sub">Ihre Statusauskunft ist eingegangen.</div></header><div class="success"><div style="font-size:32px;margin-bottom:8px">✓</div><strong>Antwort gespeichert</strong><br>Aktenzeichen ${escapeHtml(akte.az)} — Option (${option}): ${escapeHtml(opts[option] ?? "")}</div><div class="info">Wenn Sie die Antwort korrigieren möchten, öffnen Sie den Link aus der Mail erneut und senden Sie das Formular neu ab.</div><footer>Persiusufer Verwaltungs GmbH · <a href="mailto:anfrage@persiusufer.de">anfrage@persiusufer.de</a></footer>`;
  return page("Statusauskunft eingegangen", body);
}

function renderError(msg: string): string {
  const body = `<header><h1>Link nicht gültig</h1></header><div class="danger">${escapeHtml(msg)}</div><div class="info">Falls Sie eine Antwort übermitteln möchten, senden Sie bitte eine Mail an <a href="mailto:anfrage@persiusufer.de">anfrage@persiusufer.de</a>.</div>`;
  return page("Link nicht gültig", body);
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

const parseDeDate = (raw: string | null): string | null => raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
const composeTimestamp = (d: string, t?: string | null): string => {
  let tt = "00:00";
  if (t && /^\d{1,2}:\d{2}/.test(t)) tt = t.padStart(5, "0");
  return d + "T" + tt + ":00";
};

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);

  if (!url.hostname.startsWith("anfrage.")) {
    return context.next();
  }

  const pathMatch = url.pathname.match(/^\/([a-z2-9]{20,24})$/i);
  const token = pathMatch ? pathMatch[1] : null;

  if (!token) {
    return htmlResponse(renderError("Bitte den vollständigen Link aus der E-Mail öffnen."), 404);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return htmlResponse(renderError("Konfigurationsfehler. Bitte später erneut versuchen."), 500);
  }
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: anfrage } = await sb.from("zvg_anfrage").select("*").eq("reply_token", token).single();
  if (!anfrage) return htmlResponse(renderError("Dieser Link ist nicht (mehr) gültig oder wurde widerrufen."), 404);

  const { data: akte } = await sb.from("zvg_akte").select("zid, az, ag_name_raw, objektart, objekt_ort, termin, status").eq("zid", anfrage.zid).single();
  if (!akte) return htmlResponse(renderError("Verfahren nicht gefunden."), 404);

  if (req.method === "GET") {
    await sb.from("zvg_anfrage").update({
      reply_form_views_count: (anfrage.reply_form_views_count ?? 0) + 1,
      reply_form_first_viewed_at: anfrage.reply_form_first_viewed_at ?? new Date().toISOString(),
    }).eq("id", anfrage.id);
    return htmlResponse(renderForm(akte, anfrage, token));
  }

  if (req.method === "POST") {
    const form = await req.formData();
    const csrf = form.get("csrf");
    if (csrf !== token) return htmlResponse(renderError("Sicherheitsprüfung fehlgeschlagen."), 403);

    const optionRaw = form.get("option") as string | null;
    const option = optionRaw ? parseInt(optionRaw, 10) : null;
    if (!option || option < 1 || option > 8) {
      return htmlResponse(renderForm(akte, anfrage, token, "Bitte eine Option auswählen."), 400);
    }

    const update: Record<string, any> = {
      antwort_eingegangen_am: new Date().toISOString(),
      antwort_option: option,
      status: "beantwortet",
      reply_token_used_at: new Date().toISOString(),
    };

    if (option === 1 || option === 3) {
      const d = parseDeDate(form.get(option === 1 ? "termin_1" : "termin_3") as string | null);
      const u = form.get(option === 1 ? "uhrzeit_1" : "uhrzeit_3") as string | null;
      const saal = form.get(option === 1 ? "saal_1" : "saal_3") as string | null;
      if (d) update.antwort_neuer_termin = composeTimestamp(d, u);
      if (saal) update.antwort_neuer_termin_saal = saal;
    }
    if (option === 2) {
      const d = parseDeDate(form.get("termin_2") as string | null);
      if (d) update.antwort_neuer_termin = composeTimestamp(d);
    }
    if (option === 4) update.antwort_verfahren_eingestellt = true;
    if (option === 5) update.antwort_zuschlag_im_termin = true;
    if (option === 6) {
      update.antwort_zuschlag_versagt = true;
      const d = parseDeDate(form.get("termin_6") as string | null);
      if (d) update.antwort_neuer_termin = composeTimestamp(d);
    }
    if (option === 7) {
      const d = parseDeDate(form.get("termin_7") as string | null);
      if (d) update.antwort_verteilungstermin = d + "T00:00:00";
    }
    if (option === 8) {
      const ft = form.get("freitext");
      if (ft) update.antwort_freitext = String(ft).slice(0, 4000);
    }
    const senderName = form.get("sender_name");
    const senderRole = form.get("sender_role");
    if (senderName || senderRole) {
      const meta = `Absender (selbstangegeben): ${senderName ?? ""}${senderRole ? " — " + senderRole : ""}`;
      update.antwort_freitext = (update.antwort_freitext ? update.antwort_freitext + "\n\n" : "") + meta;
    }

    const { error } = await sb.from("zvg_anfrage").update(update).eq("id", anfrage.id);
    if (error) return htmlResponse(renderError(`Speichern fehlgeschlagen: ${error.message}`), 500);
    return htmlResponse(renderSuccess(akte, option));
  }

  return new Response("method not allowed", { status: 405 });
};

export const config = { path: "/*" };
