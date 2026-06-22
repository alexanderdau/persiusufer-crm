import { useState } from "react";
import { useNotify, useRefresh } from "ra-core";
import { Calculator, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { type ZvgAkte } from "./index";

export const GeringstesGebotButton = ({ akte }: { akte: ZvgAkte }) => {
  const notify = useNotify();
  const refresh = useRefresh();
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    const existing = akte.geringstes_gebot_eur != null;
    if (existing) {
      const ok = window.confirm(
        `Es ist bereits ein Geringstes Gebot von ${akte.geringstes_gebot_eur} EUR hinterlegt (Quelle: ${akte.geringstes_gebot_quelle ?? "—"}).\n\nNeu aus Gutachten ermitteln und überschreiben?`,
      );
      if (!ok) return;
    }
    setLoading(true);
    const startedAt = akte.geringstes_gebot_ermittelt_am ?? null;
    try {
      const sb = getSupabaseClient();
      const { data, error } = await sb.functions.invoke("extract-geringstes-gebot", {
        body: { zid: akte.zid },
      });

      // Nach Function-Call: DB nachprüfen — die Function kann ~20s laufen
      // und der Browser-Request kann inzwischen in ein Timeout gefallen sein,
      // während die Function serverseitig erfolgreich durchläuft.
      const recheck = await sb.from("zvg_akte")
        .select("geringstes_gebot_eur, geringstes_gebot_rang_betreibend, geringstes_gebot_quelle, geringstes_gebot_warnung, geringstes_gebot_ermittelt_am, geringstes_gebot_notiz")
        .eq("zid", akte.zid).single();
      const updated = recheck.data && recheck.data.geringstes_gebot_ermittelt_am && recheck.data.geringstes_gebot_ermittelt_am !== startedAt;

      if ((error || data?.error) && !updated) {
        const msg = error?.message ?? data?.error ?? "unbekannt";
        notify(`Function-Fehler: ${msg}. Die Anfrage erreicht den Server nicht oder bricht ab.`, { type: "error" });
        return;
      }

      const eurDb = recheck.data?.geringstes_gebot_eur;
      const rangDb = recheck.data?.geringstes_gebot_rang_betreibend;
      const warnDb = recheck.data?.geringstes_gebot_warnung;
      const eurOut = data?.geringstes_gebot_eur_geschaetzt ?? eurDb;
      const rangOut = data?.rang_betreibend ?? rangDb;
      const warnOut = data?.warnung ?? warnDb;
      const eurFmt = eurOut != null ? Number(eurOut).toLocaleString("de-DE") + " EUR" : "—";
      const rangFmt = rangOut != null ? `Rang ${rangOut}` : "Rang unklar";

      if (eurOut == null && rangOut == null) {
        notify(
          `Haiku-Analyse abgeschlossen, aber das Gutachten enthält keine eindeutige Forderungs-Rangfolge. Details: ${warnOut ?? "Begründung in der Akte"}`,
          { type: "warning" },
        );
      } else {
        notify(
          `✓ Ermittelt: ${rangFmt}, geringstes Gebot ${eurFmt}${warnOut ? " · ⚠ " + warnOut : ""}`,
          { type: "success" },
        );
      }
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
      disabled={loading}
      title="Aus Gutachten-PDF mit Claude Haiku ermitteln"
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
      {loading ? "Analysiere Gutachten…" : "Geringstes Gebot aus Gutachten"}
    </Button>
  );
};

export default GeringstesGebotButton;
