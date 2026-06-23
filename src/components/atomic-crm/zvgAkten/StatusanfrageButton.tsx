import { useState } from "react";
import { useNotify, useGetIdentity, useRefresh } from "ra-core";
import { Mail, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { type ZvgAkte } from "./index";

const plusTenWorkdays = (from: Date) => {
  const d = new Date(from);
  let added = 0;
  while (added < 10) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
};

type Rp = { first_name: string | null; last_name: string | null; gender: string | null; title: string | null; email_jsonb: any };

const buildAnrede = (rp: Rp | null) => {
  if (!rp || !rp.last_name) return "Sehr geehrte Damen und Herren";
  const title = rp.title ? `${rp.title} ` : "";
  const g = (rp.gender ?? "").toLowerCase();
  if (["männlich", "male", "m", "mann"].includes(g)) return `Sehr geehrter Herr ${title}${rp.last_name}`;
  if (["weiblich", "female", "f", "frau"].includes(g)) return `Sehr geehrte Frau ${title}${rp.last_name}`;
  return `Sehr geehrte/r ${title}${rp.last_name}`;
};

const buildBody = (az: string, anrede: string, rpKnown: boolean) => {
  const einleitung = rpKnown
    ? "da Sie das o. g. Zwangsversteigerungsverfahren als Rechtspfleger:in leiten,"
    : "";
  return `${anrede},

${einleitung} ich bitte um eine kurze Statusauskunft zum Aktenzeichen ${az}.

Mir ist bewusst, dass eine Auskunft über den vollständigen Verfahrensstand nach § 42 ZVG den Verfahrensbeteiligten vorbehalten ist. Mein Anliegen beschränkt sich daher in Teil A auf die ohnehin öffentliche Termin-Bekanntmachung nach §§ 87 II 2 ZVG, 169 GVG, die Sie durch Anheftung an die Gerichtstafel publik machen.


Teil A — Öffentliche Termin-Information (§§ 87 II 2 ZVG, 169 GVG)

[ ] (1) Versteigerungstermin steht noch aus.
        Neuer Termin: ____________ , Saal ____ , Uhrzeit ____

[ ] (2) Versteigerungstermin ist aufgehoben.
        Folge-/Neuer Termin (sofern bekannt): ____________

[ ] (3) Versteigerungstermin hat stattgefunden;
        Verkündungstermin nach § 87 II ZVG bestimmt auf
        ____________ , Saal ____ , Uhrzeit ____

[ ] (4) Verfahren ist insgesamt aufgehoben / eingestellt
        (z. B. nach §§ 28, 30, 31 ZVG).


Teil B — Verfahrensstand (nur falls in Ihrem Ermessen mitteilbar)

[ ] (5) Versteigerungstermin hat stattgefunden;
        Zuschlag wurde im Termin verkündet.

[ ] (6) Zuschlag wurde versagt (§§ 83 / 85 / 85a ZVG).
        Folgetermin: ____________ (sofern bereits bestimmt)

[ ] (7) Verteilungstermin (nicht-öffentlich) ist bestimmt
        auf ___________ .

[ ] (8) Sonstiger Verfahrensstand:
        _________________________________________________________

Eine formfreie Antwort mit angekreuzter Option ist ausreichend.
Vielen Dank für Ihre kurze Rückmeldung.

Mit freundlichen Grüßen
Persiusufer Verwaltungs GmbH
anfrage@persiusufer.de`;
};

export const StatusanfrageButton = ({ akte }: { akte: ZvgAkte }) => {
  const notify = useNotify();
  const refresh = useRefresh();
  const { identity } = useGetIdentity();

  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);

  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [agInfo, setAgInfo] = useState<{ name: string | null; hasEmail: boolean; fax: string | null; emailHinweis: string | null } | null>(null);
  const [rateInfo, setRateInfo] = useState<{ ok: boolean; sperreBis?: string; letzteAm?: string; letzteZid?: string } | null>(null);

  const isAufgehoben = akte.status === "aufgehoben";
  const isDisabled = preparing || sending || !akte.ag_company_id || isAufgehoben;

  const openModal = async () => {
    if (!akte.ag_company_id) {
      notify("Keine AG-Verknüpfung in der Akte — Anfrage nicht möglich.", { type: "warning" });
      return;
    }
    if (isAufgehoben) {
      notify("Versteigerungstermin ist aufgehoben — Statusanfrage ergibt keinen Sinn.", { type: "warning" });
      return;
    }
    setPreparing(true);
    try {
      const sb = getSupabaseClient();

      const [agRes, rateRes] = await Promise.all([
        sb.from("companies").select("id, name, email, email_hinweis, telefax").eq("id", akte.ag_company_id).single(),
        sb.rpc("zvg_anfrage_kann_senden", { p_ag_company_id: akte.ag_company_id }),
      ]);
      if (agRes.error) throw agRes.error;
      const ag = agRes.data;
      const trimmedEmail = (ag?.email ?? "").trim();
      const hasEmail = trimmedEmail.length > 0 && /@/.test(trimmedEmail);

      let rp: Rp | null = null;
      let rpCc = "";
      if (akte.rechtspfleger_contact_id) {
        const { data } = await sb.from("contacts").select("first_name, last_name, gender, title, email_jsonb").eq("id", akte.rechtspfleger_contact_id).single();
        if (data) {
          rp = data as Rp;
          try {
            const arr = Array.isArray(rp.email_jsonb) ? rp.email_jsonb : [];
            const f = arr.find((e: any) => e?.email) ?? arr[0];
            rpCc = f?.email ?? "";
          } catch { /* ignore */ }
        }
      }

      const anrede = buildAnrede(rp);
      const defaultBody = buildBody(akte.az ?? "", anrede, !!rp);
      const defaultSubject = `Auskunftsersuchen Zwangsversteigerungsverfahren - Az. ${akte.az ?? ""} [#PU-${akte.zid}]`;

      setTo(trimmedEmail);
      setCc(rpCc);
      setSubject(defaultSubject);
      setBodyText(defaultBody);
      setAgInfo({ name: ag?.name ?? null, hasEmail, fax: ag?.telefax ?? null, emailHinweis: ag?.email_hinweis ?? null });

      const rate = Array.isArray(rateRes.data) ? rateRes.data[0] : rateRes.data;
      if (rate && rate.kann_senden === false) {
        setRateInfo({
          ok: false,
          sperreBis: rate.sperre_bis ? new Date(rate.sperre_bis).toLocaleDateString("de-DE") : "?",
          letzteAm: rate.letzte_anfrage_am ? new Date(rate.letzte_anfrage_am).toLocaleDateString("de-DE") : "?",
          letzteZid: rate.letzte_anfrage_zid ?? undefined,
        });
      } else {
        setRateInfo({ ok: true });
      }

      setOpen(true);
    } catch (e: any) {
      notify(`Fehler beim Vorbereiten: ${e?.message ?? e}`, { type: "error" });
    } finally {
      setPreparing(false);
    }
  };

  const pollAnfrageStatus = (anfrageId: number, startedAt: string) => {
    const sb = getSupabaseClient();
    const startedMs = Date.parse(startedAt);
    const deadline = Date.now() + 60_000;
    const interval = window.setInterval(async () => {
      if (Date.now() > deadline) {
        window.clearInterval(interval);
        setSending(false);
        notify(`SMTP-Job läuft länger als 60 Sek — Status erscheint später unter „Statusanfragen". Entwurf #${anfrageId} bleibt bestehen.`, { type: "info" });
        setOpen(false);
        refresh();
        return;
      }
      const { data } = await sb.from("zvg_anfrage")
        .select("status, gesendet_am, job_error, sent_copy_info, gesendet_an_email")
        .eq("id", anfrageId).single();
      if (!data) return;
      const sentAt = data.gesendet_am ? Date.parse(data.gesendet_am) : 0;
      const done = data.status === "gesendet" && sentAt >= startedMs;
      const failed = data.job_error != null;
      if (done) {
        window.clearInterval(interval);
        setSending(false);
        const sci = data.sent_copy_info;
        const sentMsg = sci && sci.ok ? ` (Kopie im Ordner „${sci.folder}")` : sci && sci.attempted ? " (Sent-Kopie fehlgeschlagen)" : "";
        notify(`✓ Statusanfrage an ${data.gesendet_an_email} versendet${sentMsg}.`, { type: "success" });
        setOpen(false);
        refresh();
      } else if (failed) {
        window.clearInterval(interval);
        setSending(false);
        notify(`SMTP-Versand fehlgeschlagen: ${data.job_error}. Entwurf #${anfrageId} bleibt unter „Statusanfragen".`, { type: "error" });
        setOpen(false);
        refresh();
      }
    }, 2000);
  };

  const sendNow = async () => {
    if (!akte.ag_company_id) return;
    setSending(true);
    try {
      const sb = getSupabaseClient();
      const hasEmail = (to ?? "").trim().length > 0 && /@/.test(to);
      const overrideRate = rateInfo && !rateInfo.ok;

      const salesId = (identity?.id as number) ?? null;
      const { data: created, error: insErr } = await sb
        .from("zvg_anfrage")
        .insert({
          zid: akte.zid,
          ag_company_id: akte.ag_company_id,
          rechtspfleger_contact_id: akte.rechtspfleger_contact_id ?? null,
          anlass: "nach_termin",
          gesendet_per: hasEmail ? "email" : "brief",
          gesendet_von_sales_id: salesId,
          status: "entwurf",
          override_rate_limit: overrideRate ?? false,
          re_anfrage_faellig_am: plusTenWorkdays(new Date()),
          betreff: subject || null,
          body: bodyText || null,
          gesendet_an_email: hasEmail ? to.trim() : null,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      if (!hasEmail) {
        notify(`Entwurf #${created.id} angelegt — keine E-Mail eingetragen, bitte per Fax oder Post versenden.`, { type: "info" });
        setOpen(false);
        refresh();
        setSending(false);
        return;
      }

      const { data: sendData, error: sendErr } = await sb.functions.invoke("zvg-anfrage-send", {
        body: {
          anfrage_id: created.id,
          to_override: to.trim(),
          cc_override: cc.trim() || null,
          subject_override: subject,
          body_override: bodyText,
        },
      });
      // Function startet jetzt Background-Job und returnt 202 mit job_started
      if (sendErr || sendData?.error) {
        // Browser-Response kaputt? Job kann trotzdem im Hintergrund laufen — DB checken
        const check = await sb.from("zvg_anfrage").select("job_started_at, status").eq("id", created.id).single();
        if (check.data?.job_started_at && check.data.status === "entwurf") {
          notify(`SMTP-Versand läuft im Hintergrund (~5–15 Sek) — wird gepollt …`, { type: "info" });
          pollAnfrageStatus(created.id, check.data.job_started_at);
          return;
        }
        const msg = sendErr?.message ?? sendData?.error ?? "unbekannt";
        notify(`Function-Fehler: ${msg}. Entwurf #${created.id} bleibt unter „Statusanfragen".`, { type: "error" });
        setOpen(false);
        refresh();
        setSending(false);
        return;
      }

      if (sendData?.job_started && sendData?.started_at) {
        notify(`SMTP-Versand läuft im Hintergrund (~5–15 Sek) …`, { type: "info" });
        pollAnfrageStatus(created.id, sendData.started_at);
        return;
      }

      // Fallback (alter synchroner Pfad)
      notify(`✓ Statusanfrage versendet.`, { type: "success" });
      setOpen(false);
      refresh();
      setSending(false);
    } catch (e: any) {
      notify(`Fehler: ${e?.message ?? e}`, { type: "error" });
      setSending(false);
    }
  };

  const tooltip = isAufgehoben
    ? "Aufgehobener Termin — Statusanfrage nicht sinnvoll"
    : !akte.ag_company_id
      ? "Keine AG-Verknüpfung — Anfrage nicht möglich"
      : "Statusanfrage per E-Mail — Vorschau & Bearbeiten vor dem Versand";

  if (isAufgehoben) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/40 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
        <Mail className="size-3.5 opacity-60" />
        Termin aufgehoben — Versand nicht möglich
      </div>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={openModal}
        disabled={isDisabled}
        title={tooltip}
        className="disabled:opacity-50 disabled:bg-muted disabled:cursor-not-allowed"
      >
        {preparing ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
        {preparing ? "Lädt…" : "Statusanfrage senden"}
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!sending) setOpen(o); }}>
        <DialogContent className="max-w-3xl flex flex-col max-h-[90vh] p-0">
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b">
            <DialogTitle>Statusanfrage senden — {agInfo?.name ?? "Amtsgericht"}</DialogTitle>
            <DialogDescription>
              Aktenzeichen <strong>{akte.az}</strong>. Felder vor dem Versand prüfen oder anpassen.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">

          {rateInfo && !rateInfo.ok && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Rate-Limit: An dieses AG ging bereits in den letzten 7 Tagen eine Anfrage (zuletzt am {rateInfo.letzteAm} zur Akte {rateInfo.letzteZid ?? "?"}). Sperre läuft bis {rateInfo.sperreBis}. Versand erfolgt als Override.
            </div>
          )}
          {agInfo && !agInfo.hasEmail && (
            <div className="rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-900">
              Keine E-Mail für {agInfo.name ?? "AG"} hinterlegt.
              {agInfo.fax ? <> Fax: <strong>{agInfo.fax}</strong>.</> : null}
              {agInfo.emailHinweis ? <> {agInfo.emailHinweis}</> : null}
              <br />Wenn To leer bleibt, wird nur ein Entwurf angelegt (für Fax/Post).
            </div>
          )}

          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label htmlFor="anfrage-to">An (To)</Label>
              <Input id="anfrage-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="z. B. poststelle@ag-stadt.brandenburg.de" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="anfrage-cc">CC (Rechtspfleger:in)</Label>
              <Input id="anfrage-cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="optional" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="anfrage-subject">Betreff</Label>
              <Input id="anfrage-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="anfrage-body">Text</Label>
              <Textarea id="anfrage-body" value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={12} className="font-mono text-xs" />
            </div>
          </div>

          </div>

          <DialogFooter className="px-6 py-4 border-t bg-background shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-muted-foreground sm:flex-1">
              Bei Fehler oder leerem „An": Entwurf landet in der Topbar-Liste <strong>„Statusanfragen"</strong> (nicht im Mailclient).
            </span>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={sending}>Abbrechen</Button>
              <Button type="button" onClick={sendNow} disabled={sending}>
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {sending ? "Wird versendet…" : "Senden"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StatusanfrageButton;
