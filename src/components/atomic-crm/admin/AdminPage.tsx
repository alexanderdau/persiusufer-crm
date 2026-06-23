import { useEffect, useState } from "react";
import { useNotify } from "ra-core";
import { Loader2, Play, Square, RotateCw, RefreshCw, Database } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSupabaseClient } from "../providers/supabase/supabase";

type BackfillStatus = {
  ziel: number;
  mit_doks: number;
  markiert_ohne_doks: number;
  noch_zu_pruefen: number;
  prozent_geprueft: number;
  in_arbeit: number;
  docs_letzte_5min: number;
};

type StatusResponse = {
  status: BackfillStatus | null;
  cron_active: boolean;
};

export const AdminPage = () => {
  const notify = useNotify();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const sb = getSupabaseClient();
      const { data, error } = await sb.functions.invoke("backfill-admin", { body: { action: "status" } });
      if (error) throw error;
      setStatus(data as StatusResponse);
    } catch (e: any) {
      notify(`Status laden fehlgeschlagen: ${e?.message ?? e}`, { type: "error" });
    }
  };

  useEffect(() => {
    loadStatus();
    const interval = window.setInterval(loadStatus, 8000);
    return () => window.clearInterval(interval);
  }, []);

  const callAction = async (action: string, opts?: Record<string, any>, label?: string) => {
    setBusy(action);
    try {
      const sb = getSupabaseClient();
      const { data, error } = await sb.functions.invoke("backfill-admin", { body: { action, ...(opts ?? {}) } });
      if (error) throw error;
      if (data?.error) {
        notify(`Fehler: ${data.error}${data.details ? " — " + data.details : ""}`, { type: "error" });
      } else {
        notify(label ? `✓ ${label}` : `✓ ${action}: ${data?.message ?? "OK"}`, { type: "success" });
      }
      await loadStatus();
    } catch (e: any) {
      notify(`Action ${action} fehlgeschlagen: ${e?.message ?? e}`, { type: "error" });
    } finally {
      setBusy(null);
    }
  };

  const s = status?.status;
  const cronActive = status?.cron_active ?? false;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <Button variant="outline" size="sm" onClick={loadStatus} disabled={!!busy}>
          <RefreshCw className="size-4" /> Neu laden
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="size-5" /> Dokumenten-Backfill (zvg-portal)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="Ziel-Akten" value={s?.ziel ?? "—"} hint="aktiv, mit Termin in Zukunft" />
            <Stat label="Mit Dokumenten" value={s?.mit_doks ?? "—"} hint={`${s?.prozent_geprueft ?? 0} % geprüft`} variant="success" />
            <Stat label="Ohne Dokumente" value={s?.markiert_ohne_doks ?? "—"} hint="im Portal keine PDFs verfügbar" variant="muted" />
            <Stat label="Noch zu prüfen" value={s?.noch_zu_pruefen ?? "—"} hint={`${s?.in_arbeit ?? 0} gerade in Arbeit`} variant={s?.noch_zu_pruefen ? "warn" : "muted"} />
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Cron-Status:</span>
            {cronActive ? (
              <Badge variant="outline" className="bg-green-50 text-green-800 border-green-300">
                ▶ Läuft (6 Worker × jede Minute)
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-zinc-50 text-zinc-700 border-zinc-300">
                ⏸ Gestoppt
              </Badge>
            )}
            {s && s.docs_letzte_5min > 0 ? (
              <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300">
                {s.docs_letzte_5min} Doks in letzten 5 Min
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button
              type="button"
              onClick={() => callAction("start_backfill", {}, "Backfill gestartet — 6 Worker × jede Minute")}
              disabled={busy !== null || cronActive}
              size="sm"
            >
              {busy === "start_backfill" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Backfill starten
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => callAction("stop_backfill", {}, "Backfill gestoppt")}
              disabled={busy !== null || !cronActive}
              size="sm"
            >
              {busy === "stop_backfill" ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}
              Stoppen
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!window.confirm("Alle „keine PDFs"-Markierungen zurücksetzen, sodass die Akten nochmal probiert werden?")) return;
                callAction("reset_no_docs", {}, "no_docs-Flag zurückgesetzt");
              }}
              disabled={busy !== null}
              size="sm"
            >
              {busy === "reset_no_docs" ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
              no_docs-Flag zurücksetzen
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => callAction("run_once", {}, "6 Worker einmalig gestartet")}
              disabled={busy !== null}
              size="sm"
              title="Einmaliger Run, ohne Cron einzurichten"
            >
              {busy === "run_once" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Einmalig laufen lassen
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Der Backfill holt PDFs (Anordnung, Gutachten, Exposé etc.) aus dem zvg-portal in unseren Storage.
            6 Worker pro Minute, atomar gelockt per <code>reserve_backfill_akten</code> — kollidieren nicht.
            Akten ohne PDFs werden automatisch markiert und nicht erneut probiert.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

const Stat = ({
  label, value, hint, variant = "default",
}: { label: string; value: string | number; hint?: string; variant?: "default" | "success" | "warn" | "muted" }) => (
  <div className="rounded-md border bg-card p-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={
      variant === "success" ? "text-2xl font-semibold text-green-700"
      : variant === "warn" ? "text-2xl font-semibold text-amber-700"
      : variant === "muted" ? "text-2xl font-semibold text-muted-foreground"
      : "text-2xl font-semibold"
    }>
      {value}
    </div>
    {hint ? <div className="text-xs text-muted-foreground mt-0.5">{hint}</div> : null}
  </div>
);

export default AdminPage;
