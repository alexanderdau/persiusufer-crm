import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function decodeMimeHeader(s) {
  if (!s) return s;
  const unfolded = s.replace(/\r?\n[ \t]+/g, " ").replace(/\?=\s+=\?/g, "?==?");
  return unfolded.replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (_, charset, enc, data) => {
    try {
      const cs = charset.toLowerCase();
      let bytes;
      if (enc.toUpperCase() === "B") { const bin = atob(data); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
      else { const qp = data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16))); bytes = new Uint8Array(qp.length); for (let i = 0; i < qp.length; i++) bytes[i] = qp.charCodeAt(i); }
      const dec = cs === "utf-8" || cs === "utf8" ? "utf-8" : cs.includes("iso") ? "iso-8859-1" : cs;
      return new TextDecoder(dec).decode(bytes);
    } catch { return data; }
  });
}

const AUTO_REPLY_SUBJECT = [/^automatische\s+(antwort|nachricht|eingangsbest)/i, /^auto(?:matic)?[-_ ]?(reply|answer|response)/i, /^out\s+of\s+office/i, /^abwesenheit/i, /^urlaub/i, /^auto:/i, /^read:/i, /^gelesen:/i, /^eingangsbest/i, /^empfangsbest/i, /^undeliver/i, /^delivery (status|failed)/i, /^mail delivery/i, /^returned mail/i];
const AUTO_REPLY_BODY = [/automatisch erzeugte antwort/i, /diese.{0,40}automatische?\s+(antwort|nachricht)/i, /this is an automatic reply/i, /out of office/i, /currently out of (the )?office/i, /bin.{0,30}abwesend/i, /abwesenheitsnotiz/i, /übermittlungsweg per e-mail nicht den gesetzlichen anforderungen/i];

function isAutoReply(headers, subject, body) {
  const autoSubmitted = (headers["auto-submitted"] ?? "").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return { auto: true, reason: `auto-submitted: ${autoSubmitted}` };
  if (headers["x-autoreply"] || headers["x-autorespond"] || (headers["precedence"] && /auto_reply|bulk/i.test(headers["precedence"]))) return { auto: true, reason: "x-autoreply-header" };
  for (const p of AUTO_REPLY_SUBJECT) if (p.test(subject)) return { auto: true, reason: `subject: ${p.source.slice(0,40)}` };
  for (const p of AUTO_REPLY_BODY) if (p.test(body)) return { auto: true, reason: `body: ${p.source.slice(0,40)}` };
  return { auto: false };
}

function qpDecode(s) {
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "=") {
      if (i + 2 < s.length && /^[0-9A-Fa-f]{2}$/.test(s.substring(i + 1, i + 3))) { bytes.push(parseInt(s.substring(i + 1, i + 3), 16)); i += 2; }
      else if (s[i + 1] === "\r" || s[i + 1] === "\n") { if (s[i + 1] === "\r" && s[i + 2] === "\n") i += 2; else i += 1; }
      else bytes.push(c.charCodeAt(0));
    } else if (c === "\r") {} else if (c === "\n") bytes.push(0x0a); else bytes.push(c.charCodeAt(0));
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
}

function decodeBody(rawBody, charset, transferEncoding) {
  const enc = (transferEncoding || "").toLowerCase().trim();
  const cs = (charset || "utf-8").toLowerCase().trim();
  if (enc === "base64") {
    try { const cleaned = rawBody.replace(/\s+/g, ""); const bin = atob(cleaned); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); const dec = cs === "utf-8" || cs === "utf8" ? "utf-8" : cs.includes("8859") || cs === "latin1" ? "iso-8859-1" : cs; return new TextDecoder(dec, { fatal: false }).decode(bytes); } catch { return rawBody; }
  }
  if (enc === "quoted-printable") {
    if (cs === "utf-8" || cs === "utf8") return qpDecode(rawBody);
    const bytes = [];
    for (let i = 0; i < rawBody.length; i++) { const c = rawBody[i]; if (c === "=") { if (i + 2 < rawBody.length && /^[0-9A-Fa-f]{2}$/.test(rawBody.substring(i + 1, i + 3))) { bytes.push(parseInt(rawBody.substring(i + 1, i + 3), 16)); i += 2; } else if (rawBody[i + 1] === "\r" || rawBody[i + 1] === "\n") { if (rawBody[i + 1] === "\r" && rawBody[i + 2] === "\n") i += 2; else i += 1; } else bytes.push(c.charCodeAt(0)); } else if (c === "\r") {} else if (c === "\n") bytes.push(0x0a); else bytes.push(c.charCodeAt(0)); }
    try { return new TextDecoder(cs.includes("8859") || cs === "latin1" ? "iso-8859-1" : cs, { fatal: false }).decode(new Uint8Array(bytes)); } catch { return new TextDecoder("iso-8859-1").decode(new Uint8Array(bytes)); }
  }
  return rawBody;
}

function extractTextPart(rawBody) {
  const lines = rawBody.split(/\r?\n/);
  const boundaryLine = lines.find((l) => /^--[\w._=-]+$/.test(l.trim()));
  if (!boundaryLine) return rawBody;
  const boundary = boundaryLine.trim();
  const partsRaw = rawBody.split(boundary);
  let plain = null;
  for (const part of partsRaw) {
    const hasCrlf = part.indexOf("\r\n\r\n") !== -1;
    const sepIdx = hasCrlf ? part.indexOf("\r\n\r\n") : part.indexOf("\n\n");
    if (sepIdx < 0) continue;
    const headerBlock = part.substring(0, sepIdx);
    const bodyBlock = part.substring(sepIdx + (hasCrlf ? 4 : 2));
    const headers = {};
    for (const hl of headerBlock.split(/\r?\n/)) { const m = hl.match(/^([\w-]+):\s*(.*)$/); if (m) headers[m[1].toLowerCase()] = m[2]; }
    const ct = (headers["content-type"] ?? "").toLowerCase();
    if (ct.startsWith("text/plain")) {
      const charsetM = ct.match(/charset\s*=\s*["']?([\w-]+)/i);
      const charset = charsetM ? charsetM[1] : "utf-8";
      const cte = headers["content-transfer-encoding"] ?? "";
      plain = decodeBody(bodyBlock, charset, cte);
      break;
    }
  }
  return plain ?? rawBody;
}

const extractToken = (s) => { if (!s) return null; const d = decodeMimeHeader(s); const m = d.match(/\[#PU-([\w\d-]+)\]/); return m ? m[1] : null; };
const extractZidFromMessageId = (s) => { if (!s) return null; const m = s.match(/pu-([\w\d-]+)\.[\d]+@persiusufer\.de/); return m ? m[1] : null; };
const extractAz = (s) => { if (!s) return null; const d = decodeMimeHeader(s); const m = d.match(/(\d{1,3}\s?K\s?\d{1,4}\s?[\/-]\s?\d{2,4})/i); return m ? m[1].replace(/\s+/g, " ").trim() : null; };
const normalizeAzForLookup = (az) => az.replace(/-/g, "/").replace(/\s+/g, " ").trim();

const extractOption = (body) => {
  if (!body) return { option: null, details: {} };
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*\[(\s*[xX*✓✔])\s*\]\s*\((\d)\)/);
    if (m) {
      const opt = parseInt(m[2], 10);
      const details = {};
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const l = lines[j];
        const term = l.match(/(?:Termin|Datum|Neuer Termin)[:\s]+([\d.\s\/-]+)/i); if (term) details.termin = term[1].trim();
        const saal = l.match(/Saal[:\s]+([\w\d-]+)/i); if (saal) details.saal = saal[1].trim();
        const uhrz = l.match(/(?:Uhrzeit|Uhr)[:\s]+([\d:.\s]+)/i); if (uhrz) details.uhrzeit = uhrz[1].trim();
      }
      return { option: opt, details };
    }
  }
  return { option: null, details: {} };
};

const extractSignature = (body) => {
  if (!body) return null;
  const grussIdx = body.search(/Mit freundlichen Grüßen|MfG|i\.A\./i);
  const sigPart = grussIdx >= 0 ? body.slice(grussIdx, grussIdx + 1500) : body.slice(-1500);
  const sig = {};
  const emailM = sigPart.match(/[\w.+\-]+@[\w.\-]+\.[A-Za-z]{2,}/); if (emailM) sig.email = emailM[0].toLowerCase();
  const telM = sigPart.match(/(?:Tel(?:efon)?[:.\s]+)((?:\+?\d|\()[\d\s\/().+-]{6,30})/i); if (telM) sig.phone = telM[1].replace(/\s+/g, " ").trim();
  const faxM = sigPart.match(/(?:Fax[:.\s]+)((?:\+?\d|\()[\d\s\/().+-]{6,30})/i); if (faxM) sig.fax = faxM[1].replace(/\s+/g, " ").trim();
  const rolleM = sigPart.match(/(Dipl(?:om)?-?\s*Rechtspfleger:?in|Rechtspfleger(?:in)?|Justizangestellte(?:r)?|Justizfachangestellte(?:r)?|Justizoberinspektor:?in|Justizsekretär(?:in)?)/i);
  if (rolleM) { sig.title = rolleM[1].replace(/:in/g, "in"); sig.gender = (rolleM[1].toLowerCase().endsWith("in") || rolleM[1].toLowerCase().endsWith("angestellte")) ? "weiblich" : "unbekannt"; }
  const lines = sigPart.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length - 1; i++) {
    if (/Mit freundlichen Grüßen|MfG/i.test(lines[i])) {
      const nameLine = lines[i + 1];
      if (/^[A-ZÄÖÜ][a-zäöü]+(\s+[A-ZÄÖÜ][\wäöü\-]+)+$/.test(nameLine) || /^[A-ZÄÖÜ]\.\s*[A-ZÄÖÜ][a-zäöü]+$/.test(nameLine)) {
        const parts = nameLine.split(/\s+/).filter(Boolean);
        if (parts.length === 1) sig.last_name = parts[0]; else { sig.first_name = parts.slice(0, -1).join(" "); sig.last_name = parts[parts.length - 1]; }
        break;
      }
      if (/^[A-ZÄÖÜ][a-zäöü]+$/.test(nameLine)) { sig.last_name = nameLine; break; }
    }
  }
  return Object.keys(sig).length > 0 ? sig : null;
};

async function ensureRechtspflegerContact(sb, sig, ag_company_id) {
  if (!sig.email && !sig.last_name) return null;
  if (sig.email) { const { data } = await sb.from("contacts").select("id").filter("email_jsonb", "cs", `[{"email":"${sig.email}"}]`).limit(1); if (data && data.length > 0) return data[0].id; }
  if (sig.last_name && ag_company_id) { const { data } = await sb.from("contacts").select("id").eq("last_name", sig.last_name).eq("company_id", ag_company_id).limit(1); if (data && data.length > 0) return data[0].id; }
  const emailJsonb = sig.email ? [{ email: sig.email, type: "Geschäftlich" }] : [];
  const phoneJsonb = [];
  if (sig.phone) phoneJsonb.push({ number: sig.phone, type: "Geschäftlich" });
  if (sig.fax) phoneJsonb.push({ number: sig.fax, type: "Fax" });
  const { data: created } = await sb.from("contacts").insert({ first_name: sig.first_name ?? null, last_name: sig.last_name ?? null, title: sig.title ?? null, gender: sig.gender ?? null, company_id: ag_company_id, sales_id: 1, email_jsonb: emailJsonb, phone_jsonb: phoneJsonb }).select("id").single();
  return created?.id ?? null;
}

const parseDeDate = (raw) => { if (!raw) return null; const de = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/); if (de) { const dd = de[1].padStart(2, "0"); const mm = de[2].padStart(2, "0"); let yyyy = de[3]; if (yyyy.length === 2) yyyy = "20" + yyyy; return yyyy + "-" + mm + "-" + dd; } return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null; };
const composeTimestamp = (d, u) => { let t = "00:00"; if (u) { const m = u.match(/(\d{1,2})[:.](\d{2})/); if (m) t = m[1].padStart(2, "0") + ":" + m[2]; } return d + "T" + t + ":00"; };

Deno.serve(async (req) => {
  const secret = Deno.env.get("ANFRAGE_WEBHOOK_SECRET");
  if (secret) { const hdr = req.headers.get("x-webhook-secret"); if (hdr !== secret) return new Response("forbidden", { status: 403 }); }
  let payload; try { payload = await req.json(); } catch { return new Response("bad json", { status: 400 }); }

  const subject = decodeMimeHeader(payload.subject ?? "") || (payload.subject ?? "");
  const text = payload.text ?? payload.body ?? null;
  const html = payload.html ?? null;
  const inReplyTo = payload.in_reply_to ?? payload.references ?? null;
  const rawFullBody = text ?? html ?? "";
  const fullBody = extractTextPart(rawFullBody);
  const headers = {};
  if (payload.headers && typeof payload.headers === "object") { for (const [k, v] of Object.entries(payload.headers)) headers[k.toLowerCase()] = String(v); }

  const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const autoReply = isAutoReply(headers, subject, fullBody);

  let zid = extractToken(subject) ?? extractToken(text);
  let lookupMethod = zid ? "token" : null;
  if (!zid) { zid = extractZidFromMessageId(inReplyTo); if (zid) lookupMethod = "message_id"; }
  let az = null;
  if (!zid) {
    const rawAz = extractAz(subject) ?? extractAz(text);
    if (rawAz) {
      az = normalizeAzForLookup(rawAz);
      const { data } = await sb.from("zvg_akte").select("zid").ilike("az", az);
      if (data && data.length === 1) { zid = data[0].zid; lookupMethod = "az_unique"; }
      else if (data && data.length > 1) return new Response(JSON.stringify({ success: false, error: "az_ambiguous", az, count: data.length }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  }
  if (!zid) return new Response(JSON.stringify({ success: false, error: "zid_or_az_not_found", subject_decoded: subject, in_reply_to: inReplyTo, az_extracted: az, is_auto_reply: autoReply.auto }), { status: 200, headers: { "Content-Type": "application/json" } });

  const { data: akte } = await sb.from("zvg_akte").select("zid, ag_company_id").eq("zid", zid).single();
  if (!akte) return new Response(JSON.stringify({ success: false, error: "akte_not_found", zid }), { status: 200, headers: { "Content-Type": "application/json" } });
  const ag_company_id = akte.ag_company_id ?? null;

  const { data: anfrRows } = await sb.from("zvg_anfrage").select("id, status").eq("zid", zid).order("id", { ascending: false }).limit(1);
  const anfrage = anfrRows && anfrRows.length > 0 ? anfrRows[0] : null;

  if (autoReply.auto) {
    if (anfrage) {
      const note = `Auto-Reply empfangen ${new Date().toISOString()} - ${autoReply.reason}`;
      await sb.from("zvg_anfrage").update({ antwort_freitext: `[Auto-Reply ignoriert] ${note}\n\n${(fullBody ?? "").slice(0, 2000)}` }).eq("id", anfrage.id);
      return new Response(JSON.stringify({ success: true, action: "auto_reply_logged", anfrage_id: anfrage.id, zid, reason: autoReply.reason }), { headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: true, action: "auto_reply_ignored_no_anfrage", zid, reason: autoReply.reason }), { headers: { "Content-Type": "application/json" } });
  }

  const sig = extractSignature(fullBody);
  let rpContactId = null;
  if (sig) { rpContactId = await ensureRechtspflegerContact(sb, sig, ag_company_id); if (rpContactId) await sb.from("zvg_akte").update({ rechtspfleger_contact_id: rpContactId }).eq("zid", zid).is("rechtspfleger_contact_id", null); }

  const { option, details } = extractOption(fullBody);
  const update = { antwort_eingegangen_am: new Date().toISOString(), antwort_option: option, antwort_raw_text: fullBody, status: "beantwortet", rechtspfleger_contact_id: rpContactId ?? undefined };
  if (option === 1 || option === 3) { const d = parseDeDate(details.termin); if (d) update.antwort_neuer_termin = composeTimestamp(d, details.uhrzeit); if (details.saal) update.antwort_neuer_termin_saal = details.saal; }
  if (option === 4) update.antwort_verfahren_eingestellt = true;
  if (option === 5) update.antwort_zuschlag_im_termin = true;
  if (option === 6) update.antwort_zuschlag_versagt = true;
  if (option === 7) { const d = parseDeDate(details.termin); if (d) update.antwort_verteilungstermin = d + "T00:00:00"; }
  if (option === 8 || option == null) update.antwort_freitext = (fullBody ?? "").slice(0, 4000) || null;

  if (anfrage) {
    const { error: upErr } = await sb.from("zvg_anfrage").update(update).eq("id", anfrage.id);
    if (upErr) return new Response(JSON.stringify({ success: false, error: upErr.message }), { status: 500 });
    return new Response(JSON.stringify({ success: true, action: "updated", anfrage_id: anfrage.id, zid, lookup_method: lookupMethod, option, details, signature_used: sig, rechtspfleger_contact_id: rpContactId }), { headers: { "Content-Type": "application/json" } });
  }
  const { data: inserted, error: insErr } = await sb.from("zvg_anfrage").insert({ zid, anlass: "adhoc", gesendet_per: "email", ...update }).select("id").single();
  if (insErr) return new Response(JSON.stringify({ success: false, error: insErr.message }), { status: 500 });
  return new Response(JSON.stringify({ success: true, action: "inserted_orphan", anfrage_id: inserted?.id, zid, lookup_method: lookupMethod, option, signature_used: sig, rechtspfleger_contact_id: rpContactId }), { headers: { "Content-Type": "application/json" } });
});
