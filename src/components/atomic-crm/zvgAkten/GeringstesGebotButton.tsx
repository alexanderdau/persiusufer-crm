import { useEffect, useRef, useState } from "react";
import { useNotify, useRefresh } from "ra-core";
import { Calculator, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { type ZvgAkte } from "./index";

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 120_000;

export const GeringstesGebotButton = ({ akte }: { akte: ZvgAkte }) => {
  const notify = useNotify();
  const refresh = useRefresh();
  const [phase, setPhase] = useState<"idle" | "starting" | "running">("idle");
  const pollRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
  }, []);

  const startPolling = (jobStartedAt: string) => {
    setPhase("running");
    const startedAtMs = Date.parse(jobStartedAt);
    const sb = getSupabaseClient();
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    pollRef.current = window.setInterval(async () => {
      if (Date.now() > deadline) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        setPhase("idle");
        notify("Analyse läuft länger als 2 Minuten — Ergebnis erscheint später automatisch in der Akte. Seite neu laden zur Aktualisierung.", { type: "info" });
        return;
      }
      const { data } = await sb.from("zvg_akte")
        .select("geringstes_gebot_eur, geringstes_gebot_rang_betreibend, geringstes_gebot_quelle, geringstes_gebot_warnung, geringstes_gebot_ermittelt_am, geringstes_gebot_job_error")
        .eq("zid", akte.zid).single();
      if (!data) return;
      const ermitteltAt = data.geringstes_gebot_ermittelt_am ? Date.parse(data.geringstes_gebot_ermittelt_am) : 0;
      if (ermitteltAt > startedAtMs) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        setPhase("idle");

        if (data.geringstes_gebot_quelle === "failed" || data.geringstes_gebot_job_error) {
          notify(`Haiku-Job fehlgeschlagen: ${data.geringstes_gebot_job_error ?? "unbekannt"}`, { type: "error" });
        } else if (data.geringstes_gebot_eur == null && data.geringstes_gebot_rang_betreibend == null) {
          notify(`Haiku-Analyse abgeschlossen, aber Dokumente liefern keine eindeutige Rangfolge. ${data.geringstes_gebot_warnung ?? ""}`, { type: "warning" });
        } else {
          const eurFmt = data.geringstes_gebot_eur != null ? Number(data.geringstes_gebot_eur).toLocaleString("de-DE") + " EUR" : "—";
          const rangFmt = data.geringstes_gebot_rang_betreibend != null ? `Rang ${data.geringstes_gebot_rang_betreibend}` : "Rang unklar";
          notify(`✓ ${rangFmt}, geringstes Gebot ${eurFmt}${data.geringstes_gebot_warnung ? " · ⚠ " + data.geringstes_gebot_warnung : ""}`, { type: "success" });
        }
        refresh();
      }
    }, POLL_INTERVAL_MS);
  };

  const onClick = async () => {
    if (akte.geringstes_gebot_eur != null) {
      const ok = window.confirm(
        `Es ist bereits ein Geringstes Gebot von ${akte.geringstes_gebot_eur} EUR hinterlegt (Quelle: ${akte.geringstes_gebot_quelle ?? "—"}).\n\nNeu aus Gutachten ermitteln und überschreiben?`,
      );
      if (!ok) return;
    }
    setPhase("starting");
    try {
      const sb = getSupabaseClient();
      const { data, error } = await sb.functions.invoke("extract-geringstes-gebot", {
        body: { zid: akte.zid },
      });
      if (error) {
        // Selbst hier: vielleicht ist der Job trotzdem gestartet → in DB nachsehen
        const recheck = await sb.from("zvg_akte").select("geringstes_gebot_quelle, geringstes_gebot_job_started_at").eq("zid", akte.zid).single();
        if (recheck.data?.geringstes_gebot_quelle === "in_progress" && recheck.data.geringstes_gebot_job_started_at) {
          notify("Hintergrund-Job läuft. Auf Ergebnis wird gepollt …", { type: "info" });
          startPolling(recheck.data.geringstes_gebot_job_started_at);
          return;
        }
        notify(`Function-Fehler: ${error.message}`, { type: "error" });
        setPhase("idle");
        return;
      }
      if (data?.error) {
        notify(`Function-Fehler: ${data.error}`, { type: "error" });
        setPhase("idle");
        return;
      }
      if (data?.job_started && data?.started_at) {
        notify("Haiku-Analyse läuft im Hintergrund (~30 Sek) …", { type: "info" });
        startPolling(data.started_at);
        return;
      }
      // Fallback: synchroner Pfad (alte Function-Version)
      notify("Ergebnis erhalten — Akte wird neu geladen.", { type: "success" });
      refresh();
      setPhase("idle");
    } catch (e: any) {
      notify(`Fehler: ${e?.message ?? e}`, { type: "error" });
      setPhase("idle");
    }
  };

  const isRunning = phase !== "idle";
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={isRunning}
      title="Aus Gutachten + Anordnung mit Claude Haiku ermitteln"
    >
      {isRunning ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
      {phase === "starting" ? "Starte…" : phase === "running" ? "Analysiere Gutachten…" : "Geringstes Gebot aus Gutachten"}
    </Button>
  );
};

export default GeringstesGebotButton;
