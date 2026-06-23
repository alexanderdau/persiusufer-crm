import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const FORM_BASE = "https://anfrage.persiusufer.de";

const buildAnrede = (rp) => {
  if (!rp || !rp.last_name) return "Sehr geehrte Damen und Herren";
  const title = rp.title ? `${rp.title} ` : "";
  const g = (rp.gender ?? "").toLowerCase();
  if (["männlich", "male", "m", "mann"].includes(g)) return `Sehr geehrter Herr ${title}${rp.last_name}`;
  if (["weiblich", "female", "f", "frau"].includes(g)) return `Sehr geehrte Frau ${title}${rp.last_name}`;
  return `Sehr geehrte/r ${title}${rp.last_name}`;
};

const buildBody = (az, anrede, rpKnown, formUrl) => {
  const ein = rpKnown ? "da Sie das o. g. Zwangsversteigerungsverfahren als Rechtspfleger:in leiten, " : "";
  return `${anrede},\n\n${ein}ich bitte um eine kurze Statusauskunft zum Aktenzeichen ${az}.\n\nMir ist bewusst, dass eine Auskunft über den vollständigen Verfahrensstand nach § 42 ZVG den Verfahrensbeteiligten vorbehalten ist. Mein Anliegen beschränkt sich auf die ohnehin öffentliche Termin-Bekanntmachung nach §§ 87 II 2 ZVG, 169 GVG, die Sie durch Anheftung an die Gerichtstafel publik machen.\n\nUm Ihnen Aufwand zu ersparen, können Sie die Auskunft über ein einfaches Online-Formular geben - 30 Sekunden, keine Anmeldung, keine Cookies:\n\n   ${formUrl}\n\nAlternativ genügt eine kurze E-Mail-Antwort in einem Satz, z. B. \"Termin am 15.08.2026, Saal 3, 10:00 Uhr\" oder \"Verfahren eingestellt nach § 30 ZVG\".\n\nVielen Dank für Ihre kurze Rückmeldung.\n\nMit freundlichen Grüßen\n\nAlexander Dau\nPersiusufer Verwaltungs GmbH\nanfrage@persiusufer.de`;
};

function qpEncode(s) {
  const bytes = new TextEncoder().encode(s);
  let out = ""; let lineLen = 0;
  const push = (c) => { if (lineLen + c.length > 75) { out += "=\r\n"; lineLen = 0; } out += c; lineLen += c.length; };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x0a) { out += "\r\n"; lineLen = 0; continue; }
    if (b === 0x0d) continue;
    const esc = b > 126 || (b < 32 && b !== 0x09) || b === 0x3d;
    push(esc ? "=" + b.toString(16).toUpperCase().padStart(2, "0") : String.fromCharCode(b));
  }
  return out;
}

function asciifySubject(s) {
  return s.replace(/[·•]/g, "-").replace(/[–—]/g, "-").replace(/§/g, "Paragraph").replace(/€/g, "EUR").replace(/ä/g, "ae").replace(/Ä/g, "Ae").replace(/ö/g, "oe").replace(/Ö/g, "Oe").replace(/ü/g, "ue").replace(/Ü/g, "Ue").replace(/ß/g, "ss").replace(/[^\x20-\x7E]/g, "?");
}

class RawSmtpClient {
  constructor() { this.conn = null; this.dec = new TextDecoder(); this.enc = new TextEncoder(); this.buf = new Uint8Array(65536); }
  async connect(host, port) { this.conn = await Deno.connectTls({ hostname: host, port }); await this.readResp(); }
  async write(s) { await this.conn.write(this.enc.encode(s)); }
  async readResp() {
    let acc = ""; const dl = Date.now() + 20000;
    while (Date.now() < dl) {
      const n = await this.conn.read(this.buf); if (n === null) break;
      acc += this.dec.decode(this.buf.subarray(0, n));
      const lines = acc.split(/\r\n/);
      for (let i = lines.length - 1; i >= 0; i--) { if (lines[i] === "") continue; if (/^\d{3} /.test(lines[i])) return acc; break; }
    }
    return acc;
  }
  async cmd(line, expected = /^2\d{2}\b/) {
    await this.write(line + "\r\n");
    const r = await this.readResp();
    const lines = r.split(/\r\n/).filter(Boolean);
    const last = lines[lines.length - 1] ?? "";
    if (!expected.test(last)) throw new Error(`smtp_cmd_failed (${line.slice(0,40)}): ${last}`);
    return r;
  }
  async login(user, pass) { await this.cmd("EHLO persiusufer.de"); await this.cmd("AUTH LOGIN", /^334\b/); await this.cmd(btoa(user), /^334\b/); await this.cmd(btoa(pass), /^235\b/); }
  async sendMail(from, rcpts, rfc) { await this.cmd(`MAIL FROM:<${from}>`); for (const r of rcpts) await this.cmd(`RCPT TO:<${r}>`); await this.cmd("DATA", /^354\b/); const ds = rfc.replace(/\r\n\./g, "\r\n.."); await this.write(ds + "\r\n.\r\n"); await this.readResp(); }
  async quit() { try { await this.write("QUIT\r\n"); } catch {} try { this.conn?.close(); } catch {} }
}

function buildRfc822(opts) {
  const date = new Date().toUTCString().replace("GMT", "+0000");
  const h = [`From: ${opts.from}`, `To: ${opts.to}`];
  if (opts.cc) h.push(`Cc: ${opts.cc}`);
  h.push(`Subject: ${asciifySubject(opts.subject)}`, `Date: ${date}`, `Message-ID: ${opts.messageId}`, `MIME-Version: 1.0`, `Content-Type: text/plain; charset=UTF-8`, `Content-Transfer-Encoding: quoted-printable`, `X-Mailer: Persiusufer CRM`);
  return h.join("\r\n") + "\r\n\r\n" + qpEncode(opts.body);
}

class ImapClient {
  constructor() { this.conn = null; this.dec = new TextDecoder(); this.enc = new TextEncoder(); this.tag = 0; this.buf = new Uint8Array(65536); }
  async connect(host, port) { this.conn = await Deno.connectTls({ hostname: host, port }); await this.readUntilOk("* OK"); }
  async write(s) { await this.conn.write(this.enc.encode(s)); }
  async readUntilOk(marker) {
    let acc = ""; const dl = Date.now() + 15000;
    while (Date.now() < dl) {
      const n = await this.conn.read(this.buf); if (n === null) break;
      acc += this.dec.decode(this.buf.subarray(0, n));
      if (marker.startsWith("* OK")) { if (acc.includes("* OK")) return acc; }
      else { const re = new RegExp("(^|\\r\\n)" + marker + "\\s+(OK|NO|BAD)\\b"); if (re.test(acc)) return acc; }
    } return acc;
  }
  async command(line) { this.tag++; const t = `A${String(this.tag).padStart(4, "0")}`; await this.write(`${t} ${line}\r\n`); return await this.readUntilOk(t); }
  async login(user, pass) { const r = await this.command(`LOGIN "${user}" "${pass.replace(/"/g, '\\"')}"`); if (!/\sOK\b/.test(r)) throw new Error("imap_login_failed"); }
  async list() { const r = await this.command(`LIST "" "*"`); const folders = []; for (const line of r.split("\r\n")) { const m = line.match(/^\* LIST \(([^)]*)\) "[^"]*" "?([^"]+)"?$/); if (m) folders.push(m[2]); } return folders; }
  async append(folder, rfc) { const bytes = this.enc.encode(rfc); this.tag++; const t = `A${String(this.tag).padStart(4, "0")}`; await this.write(`${t} APPEND "${folder}" {${bytes.length}}\r\n`); let acc = ""; const dl = Date.now() + 10000; while (Date.now() < dl) { const n = await this.conn.read(this.buf); if (n === null) break; acc += this.dec.decode(this.buf.subarray(0, n)); if (acc.includes("+")) break; if (/\sNO\b/.test(acc) || /\sBAD\b/.test(acc)) return false; } await this.conn.write(bytes); await this.write("\r\n"); const r = await this.readUntilOk(t); return /\sOK\b/.test(r); }
  async logout() { try { await this.command("LOGOUT"); } catch {} try { this.conn?.close(); } catch {} }
}

function pickSentFolder(folders) {
  const lower = folders.map((f) => ({ name: f, lc: f.toLowerCase() }));
  const cands = ["sent", "gesendet", "gesendete objekte", "gesendete elemente", "inbox.sent", "sent items"];
  for (const c of cands) { const hit = lower.find((f) => f.lc === c); if (hit) return hit.name; }
  const fb = lower.find((f) => f.lc.includes("sent") || f.lc.includes("gesendet"));
  return fb ? fb.name : "Sent";
}

async function ensureReplyToken(sb, anfrage_id, existing) {
  if (existing) return existing;
  const { data } = await sb.rpc("generate_reply_token");
  const token = data ?? null;
  if (!token) return null;
  await sb.from("zvg_anfrage").update({ reply_token: token }).eq("id", anfrage_id);
  return token;
}

async function runSendJob(sb, cfg, anfrage_id, zid, toEmail, ccEmail, subject, mailBody, anrede, rpContactId) {
  const messageId = `<pu-${zid}.${Date.now()}@persiusufer.de>`;
  const rfc822 = buildRfc822({ from: cfg.smtp_from, to: toEmail, cc: ccEmail, subject, body: mailBody, messageId });
  const rcpts = [toEmail]; if (ccEmail) rcpts.push(ccEmail);
  const envFrom = cfg.smtp_from.match(/<([^>]+)>/)?.[1] ?? cfg.smtp_from;

  const smtp = new RawSmtpClient();
  try {
    await smtp.connect(cfg.smtp_host, cfg.smtp_port);
    await smtp.login(cfg.smtp_user, cfg.smtp_pass);
    await smtp.sendMail(envFrom, rcpts, rfc822);
    await smtp.quit();
  } catch (e) {
    try { await smtp.quit(); } catch {}
    await sb.from("zvg_anfrage").update({ status: "entwurf", job_error: `smtp_failed: ${e?.message ?? String(e)}`, betreff: subject, body: mailBody, gesendet_an_email: toEmail, anrede, rechtspfleger_contact_id: rpContactId }).eq("id", anfrage_id);
    return;
  }

  let sentCopyInfo = { attempted: false };
  try {
    const imap = new ImapClient();
    await imap.connect(cfg.smtp_host, cfg.imap_port ?? 993);
    await imap.login(cfg.smtp_user, cfg.smtp_pass);
    const folders = await imap.list();
    const sentFolder = pickSentFolder(folders);
    const ok = await imap.append(sentFolder, rfc822);
    await imap.logout();
    sentCopyInfo = { attempted: true, folder: sentFolder, ok };
  } catch (e) { sentCopyInfo = { attempted: true, ok: false, error: e?.message ?? String(e) }; }

  await sb.from("zvg_anfrage").update({ status: "gesendet", gesendet_am: new Date().toISOString(), gesendet_an_email: toEmail, gesendet_per: "email", rechtspfleger_contact_id: rpContactId, anrede, betreff: subject, body: mailBody, sent_copy_info: sentCopyInfo, job_error: null }).eq("id", anfrage_id);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  let body; try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }
  if (!body.anfrage_id) return new Response(JSON.stringify({ error: "missing anfrage_id" }), { status: 400 });

  const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: cfg } = await sb.from("app_smtp_config").select("*").single();
  if (!cfg) return new Response(JSON.stringify({ error: "smtp_config_unavailable" }), { status: 500 });

  const { data: anfrage } = await sb.from("zvg_anfrage").select("*").eq("id", body.anfrage_id).single();
  if (!anfrage) return new Response(JSON.stringify({ error: "anfrage_not_found" }), { status: 404 });
  if (anfrage.status === "gesendet" || anfrage.status === "beantwortet") return new Response(JSON.stringify({ error: "already_sent", status: anfrage.status }), { status: 409 });

  const { data: akte } = await sb.from("zvg_akte").select("zid, az, ag_company_id, rechtspfleger_contact_id, status").eq("zid", anfrage.zid).single();
  if (!akte) return new Response(JSON.stringify({ error: "akte_not_found" }), { status: 404 });
  if (akte.status === "aufgehoben") return new Response(JSON.stringify({ error: "akte_aufgehoben" }), { status: 409 });

  const { data: ag } = anfrage.ag_company_id ? await sb.from("companies").select("id, name, email").eq("id", anfrage.ag_company_id).single() : { data: null };
  const toEmail = body.to_override?.trim() || ag?.email;
  if (!toEmail) return new Response(JSON.stringify({ error: "ag_email_missing" }), { status: 400 });

  let rp = null; let defaultCc = null;
  const rpId = akte.rechtspfleger_contact_id ?? anfrage.rechtspfleger_contact_id ?? null;
  if (rpId) { const { data } = await sb.from("contacts").select("first_name, last_name, gender, title, email_jsonb").eq("id", rpId).single(); if (data) { rp = data; try { const arr = Array.isArray(rp.email_jsonb) ? rp.email_jsonb : []; const f = arr.find((e) => e?.email) ?? arr[0]; defaultCc = f?.email ?? null; } catch {} } }
  const ccEmail = body.cc_override !== undefined ? (body.cc_override?.trim() || null) : defaultCc;
  const anrede = buildAnrede(rp);

  const replyToken = await ensureReplyToken(sb, anfrage.id, anfrage.reply_token);
  const formUrl = replyToken ? `${FORM_BASE}/${replyToken}` : FORM_BASE;

  const defaultBody = buildBody(akte.az ?? "", anrede, !!rp, formUrl);
  const defaultSubject = `Auskunftsersuchen Zwangsversteigerungsverfahren - Az. ${akte.az ?? ""} [#PU-${akte.zid}]`;
  const subject = body.subject_override?.trim() || defaultSubject;
  const mailBody = body.body_override?.trim() || defaultBody;

  const startedAt = new Date().toISOString();
  await sb.from("zvg_anfrage").update({ job_started_at: startedAt, job_error: null, betreff: subject, body: mailBody, gesendet_an_email: toEmail, anrede }).eq("id", body.anfrage_id);

  // @ts-ignore
  EdgeRuntime.waitUntil(runSendJob(sb, cfg, body.anfrage_id, akte.zid, toEmail, ccEmail, subject, mailBody, anrede, rpId));

  return new Response(JSON.stringify({ success: true, job_started: true, anfrage_id: body.anfrage_id, started_at: startedAt, to: toEmail, cc: ccEmail, subject, form_url: formUrl }), { status: 202, headers: { "Content-Type": "application/json" } });
});
