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
    try {
      const sb = getSupabaseClient();
      const { data, error } = await sb.functions.invoke("extract-geringstes-gebot", {
        body: { zid: akte.zid },
      });
      if (error) {
        notify(`Fehler: ${error.message}`, { type: "error" });
        return;
      }
      if (data?.error) {
        notify(`Function-Fehler: ${data.error}${data.hint ? " — " + data.hint : ""}`, { type: "error" });
        return;
      }
      notify(
        `✓ Ermittelt: Rang ${data?.rang_betreibend ?? "?"}, geringstes Gebot ${data?.geringstes_gebot_eur_geschaetzt != null ? data.geringstes_gebot_eur_geschaetzt + " EUR" : "—"}${data?.warnung ? " · ⚠ " + data.warnung : ""}`,
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
      disabled={loading}
      title="Aus Gutachten-PDF mit Claude Haiku ermitteln"
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
      {loading ? "Analysiere Gutachten…" : "Geringstes Gebot aus Gutachten"}
    </Button>
  );
};

export default GeringstesGebotButton;
