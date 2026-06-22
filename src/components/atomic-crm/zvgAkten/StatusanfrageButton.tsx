import { useState } from "react";
import { useNotify, useGetIdentity, useRefresh } from "ra-core";
import { Mail, MailCheck, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { type ZvgAkte } from "./index";

// 10 Werktage später (Feiertage ignoriert)
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

export const StatusanfrageButton = ({ akte }: { akte: ZvgAkte }) => {
  const notify = useNotify();
  const refresh = useRefresh();
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
      let overrideRateLimit = false;
      if (rate && rate.kann_senden === false) {
        const sperreDate = rate.sperre_bis ? new Date(rate.sperre_bis).toLocaleDateString("de-DE") : "?";
        const letzteDate = rate.letzte_anfrage_am ? new Date(rate.letzte_anfrage_am).toLocaleDateString("de-DE") : "?";
        const ok = window.confirm(
          `Rate-Limit: An dieses AG ging bereits in den letzten 7 Tagen eine Anfrage (zuletzt am ${letzteDate} zur Akte ${rate.letzte_anfrage_zid ?? "?"}).\n\nSperre läuft bis ${sperreDate}.\n\nTrotzdem senden (Override)?`,
        );
        if (!ok) {
          setLoading(false);
          return;
        }
        overrideRateLimit = true;
      }

      // 1) Anfrage-Datensatz als Entwurf anlegen
      const salesId = (identity?.id as number) ?? null;
      const { data: created, error: insErr } = await sb
        .from("zvg_anfrage")
        .insert({
          zid: akte.zid,
          ag_company_id: akte.ag_company_id,
          rechtspfleger_contact_id: akte.rechtspfleger_contact_id ?? null,
          anlass: "nach_termin",
          gesendet_per: "email",
          gesendet_von_sales_id: salesId,
          status: "entwurf",
          override_rate_limit: overrideRateLimit,
          re_anfrage_faellig_am: plusTenWorkdays(new Date()),
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      // 2) Edge Function aufrufen für tatsächlichen Versand
      const { data: sendData, error: sendErr } = await sb.functions.invoke("zvg-anfrage-send", {
        body: { anfrage_id: created.id },
      });
      if (sendErr) {
        // Versand schlug fehl — Entwurf bleibt bestehen, Status auf 'entwurf'
        notify(`SMTP-Versand fehlgeschlagen: ${sendErr.message}. Anfrage als Entwurf gespeichert.`, { type: "error" });
        return;
      }
      if (sendData?.error) {
        notify(`Versand-Fehler: ${sendData.error}${sendData.details ? " — " + sendData.details : ""}`, { type: "error" });
        return;
      }

      notify(
        `✓ Statusanfrage an ${sendData?.to ?? "AG"} versendet${sendData?.cc ? " (CC " + sendData.cc + ")" : ""}.`,
        { type: "success" },
      );
      refresh();
    } catch (e: any) {
      notify(`Fehler: ${e?.message ?? e}`, { type: "error" });
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
      title="Statusanfrage per E-Mail an AG / Rechtspfleger:in senden"
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
      {loading ? "Wird versendet…" : "Statusanfrage senden"}
    </Button>
  );
};

export default StatusanfrageButton;
