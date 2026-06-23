import { useState } from "react";
import { useListContext, useNotify, useRefresh } from "ra-core";
import { Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getSupabaseClient } from "../providers/supabase/supabase";
import type { ZvgAkte } from "./index";

type BatchResult = {
  queued_count: number;
  skipped_count: number;
  skipped: { zid: string; reason: string; detail?: string }[];
};

/** Shared Confirm-Dialog */
const ConfirmDialog = ({
  open,
  onOpenChange,
  candidates,
  aufgehoben,
  bereits,
  keinAg,
  hint,
  onConfirm,
  running,
  result,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidates: ZvgAkte[];
  aufgehoben: number;
  bereits: number;
  keinAg: number;
  hint: string;
  onConfirm: () => void;
  running: boolean;
  result: BatchResult | null;
}) => (
  <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Statusanfragen als Batch versenden</DialogTitle>
        <DialogDescription>{hint}</DialogDescription>
      </DialogHeader>

      {!result ? (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between rounded border bg-emerald-50 px-3 py-2">
            <span className="font-medium text-emerald-900">Wird versendet</span>
            <Badge className="bg-emerald-700">{candidates.length}</Badge>
          </div>
          {(aufgehoben > 0 || bereits > 0 || keinAg > 0) && (
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">Übersprungen wird:</div>
              {aufgehoben > 0 && (
                <div className="flex justify-between">
                  <span>Aufgehobene Termine</span>
                  <span className="tabular-nums">{aufgehoben}</span>
                </div>
              )}
              {bereits > 0 && (
                <div className="flex justify-between">
                  <span>Bereits gesendet/beantwortet</span>
                  <span className="tabular-nums">{bereits}</span>
                </div>
              )}
              {keinAg > 0 && (
                <div className="flex justify-between">
                  <span>Keine AG-Verknüpfung</span>
                  <span className="tabular-nums">{keinAg}</span>
                </div>
              )}
            </div>
          )}
          <div className="rounded border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Jede Anfrage erhält das Token <code className="px-1">[#PU-{"{zid}"}]</code> im Subject, damit Antworten
            automatisch zugeordnet werden. Bei AGs ohne E-Mail wird kein Versand versucht.
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="rounded border bg-emerald-50 px-3 py-2">
            <div className="font-medium text-emerald-900">
              {result.queued_count} Versand-Jobs gestartet
            </div>
            <div className="text-xs text-emerald-800">
              SMTP läuft im Hintergrund; nach ~10–20 Sek erscheint der Status „gesendet".
            </div>
          </div>
          {result.skipped.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded border bg-amber-50 px-3 py-2 text-xs">
              <div className="font-medium text-amber-900 mb-1">
                Übersprungen ({result.skipped.length}):
              </div>
              <ul className="space-y-0.5">
                {result.skipped.slice(0, 30).map((s) => (
                  <li key={s.zid} className="font-mono tabular-nums">
                    {s.zid}: {s.reason}
                    {s.detail ? ` — ${s.detail}` : ""}
                  </li>
                ))}
                {result.skipped.length > 30 && (
                  <li className="italic">… und {result.skipped.length - 30} weitere</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      <DialogFooter>
        {!result ? (
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={running}
              onClick={() => onOpenChange(false)}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              disabled={candidates.length === 0 || running}
              onClick={onConfirm}
            >
              {running ? "Sende …" : `${candidates.length} Anfragen versenden`}
            </Button>
          </>
        ) : (
          <Button type="button" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

const partition = (akten: ZvgAkte[]) => {
  const candidates = akten.filter(
    (a) =>
      a.status !== "aufgehoben" &&
      a.ag_company_id != null &&
      a.letzte_anfrage_status !== "gesendet" &&
      a.letzte_anfrage_status !== "beantwortet",
  );
  const aufgehoben = akten.filter((a) => a.status === "aufgehoben").length;
  const bereits = akten.filter(
    (a) =>
      a.letzte_anfrage_status === "gesendet" ||
      a.letzte_anfrage_status === "beantwortet",
  ).length;
  const keinAg = akten.filter((a) => a.ag_company_id == null).length;
  return { candidates, aufgehoben, bereits, keinAg };
};

const sendBatch = async (zids: string[]) => {
  const sb = getSupabaseClient();
  const { data, error } = await sb.functions.invoke("zvg-anfrage-batch-send", {
    body: { zids },
  });
  if (error) throw error;
  return data as BatchResult;
};

/**
 * Top-Toolbar-Button: alle sichtbaren Akten der aktuellen Seite (gefiltert).
 * Wird neben „Exportieren" angezeigt.
 */
export const BatchAnfrageButton = () => {
  const { data, filterValues, total } = useListContext<ZvgAkte>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);

  const akten = data ?? [];
  const { candidates, aufgehoben, bereits, keinAg } = partition(akten);
  const hasFilter = filterValues && Object.keys(filterValues).length > 0;

  const onConfirm = async () => {
    if (candidates.length === 0) return;
    setRunning(true);
    setResult(null);
    try {
      const resp = await sendBatch(candidates.map((a) => a.zid));
      setResult(resp);
      notify(
        `Batch gestartet: ${resp?.queued_count ?? 0} versendet, ${resp?.skipped_count ?? 0} übersprungen.`,
        { type: "success" },
      );
      refresh();
    } catch (e: any) {
      notify(`Fehler: ${e?.message ?? e}`, { type: "error" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
        disabled={akten.length === 0}
        title={
          akten.length === 0
            ? "Keine Akten in der aktuellen Ansicht"
            : `Statusanfragen für ${candidates.length} Akte(n) der aktuellen Seite versenden`
        }
      >
        <Send className="size-4 mr-2" />
        Statusanfragen Seite ({candidates.length})
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        candidates={candidates}
        aufgehoben={aufgehoben}
        bereits={bereits}
        keinAg={keinAg}
        hint={
          hasFilter
            ? `Aktueller Filter ergibt ${akten.length} Akte(n)${total && total !== akten.length ? ` (von ${total} insgesamt; nur die ersten ${akten.length} der aktuellen Seite)` : ""}.`
            : `Aktuelle Seite enthält ${akten.length} Akte(n).`
        }
        onConfirm={onConfirm}
        running={running}
        result={result}
      />
    </>
  );
};

/**
 * Bulk-Action-Button: erscheint in der BulkActionsToolbar, sobald Zeilen
 * via Checkbox selektiert sind. Arbeitet nur mit den markierten zids.
 */
export const BulkBatchAnfrageButton = () => {
  const { data, selectedIds, onSelect } = useListContext<ZvgAkte>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);

  const akten = (data ?? []).filter((a) => selectedIds?.includes(a.id));
  const { candidates, aufgehoben, bereits, keinAg } = partition(akten);

  const onConfirm = async () => {
    if (candidates.length === 0) return;
    setRunning(true);
    setResult(null);
    try {
      const resp = await sendBatch(candidates.map((a) => a.zid));
      setResult(resp);
      notify(
        `Batch gestartet: ${resp?.queued_count ?? 0} versendet, ${resp?.skipped_count ?? 0} übersprungen.`,
        { type: "success" },
      );
      refresh();
      onSelect([]);
    } catch (e: any) {
      notify(`Fehler: ${e?.message ?? e}`, { type: "error" });
    } finally {
      setRunning(false);
    }
  };

  if (!selectedIds || selectedIds.length === 0) return null;

  return (
    <>
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
        disabled={akten.length === 0}
      >
        <Send className="size-4 mr-2" />
        Statusanfragen senden ({candidates.length})
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onSelect([])}
        title="Auswahl aufheben"
      >
        <X className="size-4 mr-1" />
        Auswahl ({selectedIds.length})
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        candidates={candidates}
        aufgehoben={aufgehoben}
        bereits={bereits}
        keinAg={keinAg}
        hint={`${selectedIds.length} Akte(n) selektiert.`}
        onConfirm={onConfirm}
        running={running}
        result={result}
      />
    </>
  );
};
