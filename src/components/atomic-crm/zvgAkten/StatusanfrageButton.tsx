import { useState } from "react";
import { useNotify, useGetIdentity } from "ra-core";
import { Mail, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { type ZvgAkte } from "./index";

type RechtspflegerData = {
  first_name: string | null;
  last_name: string | null;
  gender: string | null;
  title: string | null;
  email_jsonb: any;
};

type AgData = {
  name: string | null;
  email: string | null;
  postanschrift: string | null;
  city: string | null;
};

// 10 Werktage später (nur Mo-Fr, Feiertage ignoriert)
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

const buildAnrede = (rp: RechtspflegerData | null): string => {
  if (!rp || !rp.last_name) return "Sehr geehrte Damen und Herren";
  const title = rp.title ? `${rp.title} ` : "";
  const g = (rp.gender ?? "").toLowerCase();
  if (g === "männlich" || g === "male" || g === "m" || g === "mann")
    return `Sehr geehrter Herr ${title}${rp.last_name}`;
  if (g === "weiblich" || g === "female" || g === "f" || g === "frau")
    return `Sehr geehrte Frau ${title}${rp.last_name}`;
  return `Sehr geehrte/r ${title}${rp.last_name}`;
};

const buildBody = (akte: ZvgAkte, anrede: string, rpKnown: boolean): string => {
  const optBlock = `[ ] (1) Versteigerungstermin steht noch aus.
        Neuer Termin: ____________ , Saal ____ , Uhrzeit ____

[ ] (2) Versteigerungstermin am ___________ hat stattgefunden;
        Zuschlag wurde im Termin verkündet.

[ ] (3) Versteigerungstermin am ___________ hat stattgefunden;
        Verkündungstermin nach § 87 II ZVG bestimmt auf
        ____________ , Saal ____ , Uhrzeit ____

[ ] (4) Zuschlag wurde versagt (§§ 83 / 85 / 85a ZVG).
        Folgetermin: ____________ (sofern bereits bestimmt)

[ ] (5) Verfahren ist eingestellt / aufgehoben
        (z. B. nach §§ 28, 30, 31 ZVG).

[ ] (6) Verteilungstermin (nicht-öffentlich) ist bestimmt
        auf ___________ .

[ ] (7) Sonstiger Verfahrensstand:
        _________________________________________________________`;

  const einleitung = rpKnown
    ? `da Sie das o. g. Zwangsversteigerungsverfahren als Rechtspfleger:in leiten, wende ich mich mit der Bitte um eine kurze Statusauskunft direkt an Sie.`
    : `ich bitte zu dem o. g. Zwangsversteigerungsverfahren um eine kurze Statusauskunft.`;

  return `${anrede},

${einleitung} Den nächsten öffentlichen Termin nach §§ 87, 169 GVG machen Sie ohnehin durch Anheftung an die Gerichtstafel bekannt — mir würde die nachfolgende Auswahl Ihrerseits voll genügen. Eine formfreie Mailantwort mit angekreuzter Option ist ausreichend.

Aktenzeichen: ${akte.az ?? ""}

Bitte zutreffende Option auswählen:

${optBlock}

Vielen Dank für Ihre kurze Rückmeldung.

Mit freundlichen Grüßen`;
};

export const StatusanfrageButton = ({ akte }: { akte: ZvgAkte }) => {
  const notify = useNotify();
  const { identity } = useGetIdentity();
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    if (!akte.ag_company_id) {
      notify("Keine AG-Verknüpfung in der Akte — Anfrage nicht möglich.", { type: "warning" });
      return;
    }
    setLoading(true);
    try {
      const sb = getSupabaseClient();

      // Rate-Limit-Check
      const { data: rateRows, error: rateErr } = await sb.rpc("zvg_anfrage_kann_senden", {
        p_ag_company_id: akte.ag_company_id,
      });
      if (rateErr) throw rateErr;
      const rate = Array.isArray(rateRows) ? rateRows[0] : rateRows;
      if (rate && rate.kann_senden === false) {
        const sperre = rate.sperre_bis ? new Date(rate.sperre_bis).toLocaleDateString("de-DE") : "?";
        const ok = window.confirm(
          `Rate-Limit: An dieses AG ging bereits in den letzten 7 Tagen eine Anfrage (zuletzt am ${new Date(rate.letzte_anfrage_am).toLocaleDateString("de-DE")} zur Akte ${rate.letzte_anfrage_zid}).\n\nSperre läuft bis ${sperre}.\n\nTrotzdem senden (Override)?`,
        );
        if (!ok) {
          setLoading(false);
          return;
        }
      }

      // Rechtspfleger-Daten ziehen, falls vorhanden
      let rp: RechtspflegerData | null = null;
      if (akte.rechtspfleger_contact_id) {
        const { data, error } = await sb
          .from("contacts")
          .select("first_name,last_name,gender,title,email_jsonb")
          .eq("id", akte.rechtspfleger_contact_id)
          .single();
        if (!error && data) rp = data as RechtspflegerData;
      }

      // AG-Daten ziehen für E-Mail-Adresse
      const { data: agRow, error: agErr } = await sb
        .from("companies")
        .select("name,email,postanschrift,city")
        .eq("id", akte.ag_company_id)
        .single();
      if (agErr) throw agErr;
      const ag = agRow as AgData;

      const anrede = buildAnrede(rp);
      const body = buildBody(akte, anrede, !!rp);
      const subject = `Auskunftsersuchen Zwangsversteigerungsverfahren · Az. ${akte.az}`;
      const toEmail = ag.email ?? "";

      // Rechtspfleger-Mail als CC, falls bekannt
      const rpEmail = (() => {
        if (!rp || !rp.email_jsonb) return null;
        try {
          const arr = Array.isArray(rp.email_jsonb) ? rp.email_jsonb : [];
          const first = arr.find((e: any) => e?.email) ?? arr[0];
          return first?.email ?? null;
        } catch {
          return null;
        }
      })();

      // INSERT in zvg_anfrage (status=gesendet, override falls Rate-Limit übersteuert)
      const overrideRateLimit = rate && rate.kann_senden === false;
      const reAnfrageFaellig = plusTenWorkdays(new Date());
      const salesId = (identity?.id as number) ?? null;

      const { error: insErr } = await sb.from("zvg_anfrage").insert({
        zid: akte.zid,
        ag_company_id: akte.ag_company_id,
        rechtspfleger_contact_id: akte.rechtspfleger_contact_id ?? null,
        anrede,
        gesendet_an_email: toEmail || null,
        gesendet_per: "email",
        gesendet_von_sales_id: salesId,
        anlass: "nach_termin",
        betreff: subject,
        body,
        gesendet_am: new Date().toISOString(),
        status: "gesendet",
        override_rate_limit: !!overrideRateLimit,
        re_anfrage_faellig_am: reAnfrageFaellig,
      });
      if (insErr) throw insErr;

      // Mailto-Link öffnen
      const ccParam = rpEmail ? `&cc=${encodeURIComponent(rpEmail)}` : "";
      const mailto = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}${ccParam}&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;

      notify(
        `Anfrage erstellt — Mail-Client geöffnet. Re-Anfrage automatisch fällig am ${new Date(reAnfrageFaellig).toLocaleDateString("de-DE")}.`,
        { type: "success" },
      );
    } catch (e: any) {
      notify(`Fehler beim Erstellen der Anfrage: ${e?.message ?? e}`, { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={loading || !akte.ag_company_id}
      title="Statusanfrage an Rechtspfleger:in / Geschäftsstelle senden"
    >
      {loading ? <MailCheck className="size-4" /> : <Mail className="size-4" />}
      Statusanfrage senden
    </Button>
  );
};

export default StatusanfrageButton;
