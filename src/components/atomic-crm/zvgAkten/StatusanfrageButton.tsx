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
  const opt =
    "[ ] (1) Versteigerungstermin steht noch aus.\n" +
    "        Neuer Termin: ____________ , Saal ____ , Uhrzeit ____\n\n" +
    "[ ] (2) Versteigerungstermin am ___________ hat stattgefunden;\n" +
    "        Zuschlag wurde im Termin verkündet.\n\n" +
    "[ ] (3) Versteigerungstermin am ___________ hat stattgefunden;\n" +
    "        Verkündungstermin nach § 87 II ZVG bestimmt auf\n" +
    "        ____________ , Saal ____ , Uhrzeit ____\n\n" +
    "[ ] (4) Zuschlag wurde versagt (§§ 83 / 85 / 85a ZVG).\n" +
    "        Folgetermin: ____________ (sofern bereits bestimmt)\n\n" +
    "[ ] (5) Verfahren ist eingestellt / aufgehoben\n" +
    "        (z. B. nach §§ 28, 30, 31 ZVG).\n\n" +
    "[ ] (6) Verteilungstermin (nicht-öffentlich) ist bestimmt\n" +
    "        auf ___________ .\n\n" +
    "[ ] (7) Sonstiger Verfahrensstand:\n" +
    "        _________________________________________________________";
  const einleitung = rpKnown
    ? "da Sie das o. g. Zwangsversteigerungsverfahren als Rechtspfleger:in leiten, wende ich mich mit der Bitte um eine kurze Statusauskunft direkt an Sie."
    : "ich bitte zu dem o. g. Zwangsversteigerungsverfahren um eine kurze Statusauskunft.";
  return `${anrede},

${einleitung} Den nächsten öffentlichen Termin nach §§ 87, 169 GVG machen Sie ohnehin durch Anheftung an die Gerichtstafel bekannt — mir würde die nachfolgende Auswahl Ihrerseits voll genügen. Eine formfreie Mailantwort mit angekreuzter Option ist ausreichend.

Aktenzeichen: ${az}

Bitte zutreffende Option auswählen:

${opt}

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
      const defaultSubject = `Auskunftsersuchen Zwangsversteigerungsverfahren · Az. ${akte.az ?? ""}`;

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
      if (sendErr) {
        notify(`SMTP-Versand fehlgeschlagen: ${sendErr.message}. Entwurf #${created.id} bleibt — Du kannst es später erneut versuchen.`, { type: "error" });
        refresh();
        return;
      }
      if (sendData?.error) {
        notify(`Versand-Fehler: ${sendData.error}${sendData.details ? " — " + sendData.details : ""}. Entwurf #${created.id} bleibt.`, { type: "error" });
        refresh();
        return;
      }

      notify(`✓ Statusanfrage an ${sendData?.to ?? to} versendet${sendData?.cc ? " (CC " + sendData.cc + ")" : ""}.`, { type: "success" });
      setOpen(false);
      refresh();
    } catch (e: any) {
      notify(`Fehler: ${e?.message ?? e}`, { type: "error" });
    } finally {
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

          <DialogFooter className="px-6 py-4 border-t bg-background shrink-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={sending}>Abbrechen</Button>
            <Button type="button" onClick={sendNow} disabled={sending}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {sending ? "Wird versendet…" : "Senden"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StatusanfrageButton;
