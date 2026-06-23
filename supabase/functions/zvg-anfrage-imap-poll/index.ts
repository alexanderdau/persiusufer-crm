import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Unfold folded headers (RFC 5322): Continuation-Lines beginnen mit Whitespace.
// Beispiel: "Subject: =?utf-8?B?...?=\r\n\t=?utf-8?B?...?=" → eine Zeile.
function unfoldHeader(raw: string, headerName: string): string {
  const re = new RegExp(`^${headerName}:\\s*((?:[^\\r\\n]+(?:\\r?\\n[\\t ][^\\r\\n]+)*))`, "im");
  const m = raw.match(re);
  if (!m) return "";
  return m[1].replace(/\r?\n[\t ]+/g, " ").trim();
}

class ImapClient {
  private conn: Deno.TlsConn | null = null;
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  private tag = 0;
  private readBuf = new Uint8Array(65536);

  async connect(host: string, port: number) {
    this.conn = await Deno.connectTls({ hostname: host, port });
    await this.readUntilGreeting();
  }
  private async readUntilGreeting() {
    if (!this.conn) throw new Error("not_connected");
    let acc = "";
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const n = await this.conn.read(this.readBuf);
      if (n === null) break;
      acc += this.decoder.decode(this.readBuf.subarray(0, n));
      if (/^\* OK/m.test(acc)) return acc;
    }
    throw new Error("no_greeting");
  }
  private async write(s: string) { if (!this.conn) throw new Error("not_connected"); await this.conn.write(this.encoder.encode(s)); }
  async command(line: string): Promise<{ ok: boolean; raw: string }> {
    this.tag++;
    const t = `A${String(this.tag).padStart(4, "0")}`;
    await this.write(`${t} ${line}\r\n`);
    if (!this.conn) throw new Error("not_connected");
    let acc = "";
    const deadline = Date.now() + 25000;
    const okRe = new RegExp(`^${t}\\s+OK\\b`, "m");
    const noRe = new RegExp(`^${t}\\s+NO\\b`, "m");
    const badRe = new RegExp(`^${t}\\s+BAD\\b`, "m");
    while (Date.now() < deadline) {
      const n = await this.conn.read(this.readBuf);
      if (n === null) break;
      acc += this.decoder.decode(this.readBuf.subarray(0, n));
      if (okRe.test(acc)) return { ok: true, raw: acc };
      if (noRe.test(acc) || badRe.test(acc)) return { ok: false, raw: acc };
    }
    return { ok: false, raw: acc + "[timeout]" };
  }
  async login(user: string, pass: string) {
    const r = await this.command(`LOGIN "${user}" "${pass.replace(/"/g, '\\"')}"`);
    if (!r.ok) throw new Error("login_failed: " + r.raw.slice(0, 200));
  }
  async select(mailbox: string) {
    const r = await this.command(`SELECT "${mailbox}"`);
    if (!r.ok) throw new Error("select_failed: " + r.raw.slice(0, 200));
  }
  async searchSince(date: string): Promise<number[]> {
    const r = await this.command(`UID SEARCH SINCE ${date}`);
    const m = r.raw.match(/\* SEARCH ([\d ]*)/);
    if (!m || !m[1].trim()) return [];
    return m[1].trim().split(/\s+/).map((x) => parseInt(x, 10)).filter((x) => !isNaN(x));
  }
  async fetchEnvelopeAndBody(uid: number): Promise<{ subject: string; from: string; body: string } | null> {
    const r = await this.command(`UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (SUBJECT FROM)] BODY.PEEK[TEXT])`);
    if (!r.ok) return null;
    // Unfolded header extraction
    const subject = unfoldHeader(r.raw, "Subject");
    const from = unfoldHeader(r.raw, "From");
    const bodyMatch = r.raw.match(/BODY\[TEXT\][^{]*\{(\d+)\}\r\n([\s\S]*?)\r\n\)\r\n/);
    const body = bodyMatch ? bodyMatch[2] : "";
    return { subject, from, body };
  }
  async logout() { try { await this.command("LOGOUT"); } catch {} try { this.conn?.close(); } catch {} }
}

Deno.serve(async (_req: Request) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cfg } = await sb.from("app_smtp_config").select("*").single();
  if (!cfg) return new Response(JSON.stringify({ error: "smtp_config_unavailable" }), { status: 500 });
  const { data: state } = await sb.from("imap_polling_state").select("*").eq("id", 1).single();
  const lastUid = state?.last_uid ?? 0;

  const imap = new ImapClient();
  const processed: any[] = [];
  let maxUid = lastUid;
  let runLog = "";

  try {
    await imap.connect(cfg.smtp_host, cfg.imap_port ?? 993);
    await imap.login(cfg.smtp_user, cfg.smtp_pass);
    await imap.select("INBOX");
    const since = new Date(); since.setDate(since.getDate() - 14);
    const dateStr = since.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-");
    const uids = (await imap.searchSince(dateStr)).filter((u) => u > lastUid);
    runLog = `found ${uids.length} new uids > ${lastUid}`;

    for (const uid of uids) {
      const env = await imap.fetchEnvelopeAndBody(uid);
      if (!env) continue;
      maxUid = Math.max(maxUid, uid);
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/zvg-anfrage-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify({ subject: env.subject, from: env.from, text: env.body }),
      });
      let j: any = null; try { j = await r.json(); } catch { j = { error: "reply_parse_failed", status: r.status }; }
      processed.push({ uid, subject: env.subject.slice(0, 120), parser_result: j });
    }
    await imap.logout();
  } catch (e: any) {
    runLog += ` | error: ${e?.message ?? e}`;
    try { await imap.logout(); } catch {}
    await sb.from("imap_polling_state").update({ last_polled_at: new Date().toISOString(), last_run_log: runLog }).eq("id", 1);
    return new Response(JSON.stringify({ error: "imap_error", details: e?.message ?? String(e), runLog }), { status: 500 });
  }

  await sb.from("imap_polling_state").update({ last_uid: maxUid, last_polled_at: new Date().toISOString(), last_run_log: runLog }).eq("id", 1);
  return new Response(JSON.stringify({ success: true, processed_count: processed.length, max_uid: maxUid, last_run_log: runLog, processed }), { headers: { "Content-Type": "application/json" } });
});
