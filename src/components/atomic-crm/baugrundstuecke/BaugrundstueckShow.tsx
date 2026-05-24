import { useEffect, useState } from "react";
import {
  useRecordContext,
  useUpdate,
  useNotify,
  usePrevNextController,
  useRefresh,
} from "ra-core";
import { Link } from "react-router";
import { Show } from "@/components/admin/show";
import {
  ChevronLeft,
  ChevronRight,
  Edit2,
  Save,
  Image as ImageIcon,
  Sparkles,
  Copy,
  ExternalLink,
  FileText,
  Heart,
  Loader2,
  MapPin,
  Maximize2,
  TreePine,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSupabaseClient } from "../providers/supabase/supabase";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { BAUG_STATUSES, BAUG_TRIAGE, type Baugrundstueck } from "./index";
import { useBaugFavoriten } from "./useBaugFavoriten";


// Räumt HTML-Entities + unsichtbare Zeichen aus Altdaten (vor Parser-Fix v2).
const cleanText = (s?: string | null): string => {
  if (!s) return "";
  const ta = document.createElement("textarea");
  ta.innerHTML = s;
  return ta.value.replace(/[\u00ad\u200b-\u200f\u2060\ufeff]/g, "").trim();
};

const formatEur = (value?: number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(Number(value));

const formatQm = (value?: number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(
        Number(value),
      ) + " m²";



const BildAnalyseButton = () => {
  const r = useRecordContext<Baugrundstueck>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [running, setRunning] = useState(false);
  if (!r) return null;
  const done = !!r.bild_analyse_at;
  const onClick = async () => {
    setRunning(true);
    try {
      const { data, error } = await getSupabaseClient().functions.invoke(
        "kleinanzeigen-bild-analyse",
        { body: { kid: r.kid } },
      );
      if (error) {
        notify(`Bildanalyse: ${error.message ?? error}`, { type: "error" });
      } else if ((data as any)?.error) {
        notify(`Bildanalyse: ${(data as any).error}`, { type: "error" });
      } else {
        const n = (data as any)?.bilder_analysiert ?? 0;
        notify(`Bildanalyse abgeschlossen (${n} Bilder)`, { type: "success" });
        refresh();
      }
    } catch (e: any) {
      notify(`Bildanalyse-Fehler: ${e?.message ?? e}`, { type: "error" });
    } finally {
      setRunning(false);
    }
  };
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={running || !r.bilder_paths || r.bilder_paths.length === 0}
      title="Inseratsbilder per Claude Vision auf Adresshinweise prüfen"
    >
      <ImageIcon className="size-4 mr-1.5" />
      {running ? "Bildanalyse läuft …" : done ? "Bilder erneut" : "Bilder analysieren"}
    </Button>
  );
};

const KiAnalyseButton = () => {
  const r = useRecordContext<Baugrundstueck>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [running, setRunning] = useState(false);
  if (!r) return null;
  const onClick = async () => {
    setRunning(true);
    try {
      const { data, error } = await getSupabaseClient().functions.invoke(
        "kleinanzeigen-ki-analyse",
        { body: { kid: r.kid } },
      );
      if (error) {
        notify(
          `KI-Analyse fehlgeschlagen: ${error.message ?? String(error)}`,
          { type: "error" },
        );
      } else if ((data as any)?.error) {
        notify(`KI-Analyse: ${(data as any).error}`, { type: "error" });
      } else {
        const changed = (data as any)?.changed ?? 0;
        notify(
          changed > 0
            ? `KI hat ${changed} Feld${changed === 1 ? "" : "er"} aktualisiert`
            : "KI-Analyse abgeschlossen — keine neuen Felder",
          { type: "success" },
        );
        refresh();
      }
    } catch (e: any) {
      notify(`KI-Analyse-Fehler: ${e?.message ?? e}`, { type: "error" });
    } finally {
      setRunning(false);
    }
  };
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={running}
      title="Beschreibung per KI auswerten und Baurecht-Felder befüllen"
    >
      <Sparkles className="size-4 mr-1.5" />
      {running ? "KI analysiert …" : r.ki_analyse_at ? "KI erneut" : "KI analysieren"}
    </Button>
  );
};

const PrevNextNav = () => {
  const { hasPrev, hasNext, prevPath, nextPath, index, total, isPending } =
    usePrevNextController<Baugrundstueck>({
      resource: "kleinanzeigen_grundstueck",
      linkType: "show",
    });
  if (isPending && total == null) return null;
  return (
    <div className="flex items-center gap-1">
      {typeof index === "number" && typeof total === "number" && (
        <span className="text-xs text-muted-foreground tabular-nums mr-2">
          {index + 1} / {total}
        </span>
      )}
      <Button
        variant="outline"
        size="icon"
        disabled={!hasPrev}
        asChild={hasPrev}
        aria-label="Vorherige Anzeige"
        title="Vorherige Anzeige (← in der aktuellen Liste)"
      >
        {hasPrev && prevPath ? (
          <Link to={prevPath}>
            <ChevronLeft className="size-4" />
          </Link>
        ) : (
          <ChevronLeft className="size-4" />
        )}
      </Button>
      <Button
        variant="outline"
        size="icon"
        disabled={!hasNext}
        asChild={hasNext}
        aria-label="Nächste Anzeige"
        title="Nächste Anzeige (→ in der aktuellen Liste)"
      >
        {hasNext && nextPath ? (
          <Link to={nextPath}>
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <ChevronRight className="size-4" />
        )}
      </Button>
    </div>
  );
};

const BilderSlider = () => {
  const r = useRecordContext<Baugrundstueck>();
  const [idx, setIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  if (!r?.bilder_paths || r.bilder_paths.length === 0) {
    return (
      <div className="aspect-video bg-muted rounded flex items-center justify-center">
        <TreePine className="size-12 text-muted-foreground" />
      </div>
    );
  }
  const base = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/kleinanzeigen-bilder/`;
  const paths = r.bilder_paths;
  const total = paths.length;
  const prev = () => setIdx((i) => (i - 1 + total) % total);
  const next = () => setIdx((i) => (i + 1) % total);

  // Keyboard-Steuerung in der Lightbox
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "Escape") setLightbox(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightbox, total]);

  return (
    <div className="space-y-2">
      <div
        className="relative aspect-video bg-muted rounded overflow-hidden cursor-zoom-in group"
        onClick={() => setLightbox(true)}
        role="button"
        aria-label="Bild vergrößern"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") setLightbox(true);
        }}
      >
        <img
          src={base + paths[idx]}
          alt={`Bild ${idx + 1} von ${total}`}
          className="w-full h-full object-contain"
        />
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                prev();
              }}
              aria-label="Vorheriges Bild"
              className="absolute left-2 top-1/2 -translate-y-1/2 size-9 rounded-full bg-background/80 hover:bg-background border flex items-center justify-center"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              aria-label="Nächstes Bild"
              className="absolute right-2 top-1/2 -translate-y-1/2 size-9 rounded-full bg-background/80 hover:bg-background border flex items-center justify-center"
            >
              <ChevronRight className="size-5" />
            </button>
            <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-background/80 text-xs">
              {idx + 1} / {total}
            </div>
          </>
        )}
        <div className="absolute top-2 right-2 size-8 rounded-full bg-background/80 group-hover:bg-background border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Maximize2 className="size-4" />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {paths.map((p, i) => (
          <button
            key={p}
            onClick={() => setIdx(i)}
            className={`shrink-0 size-16 rounded overflow-hidden border-2 ${
              i === idx ? "border-primary" : "border-transparent"
            }`}
          >
            <img
              src={base + p}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        {total} Bild{total === 1 ? "" : "er"}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(false);
            }}
            aria-label="Schließen"
            className="absolute top-4 right-4 size-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            <X className="size-5" />
          </button>

          <img
            src={base + paths[idx]}
            alt={`Bild ${idx + 1} von ${total}`}
            className="max-w-[95vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {total > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                aria-label="Vorheriges Bild"
                className="absolute left-4 top-1/2 -translate-y-1/2 size-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              >
                <ChevronLeft className="size-7" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                aria-label="Nächstes Bild"
                className="absolute right-4 top-1/2 -translate-y-1/2 size-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              >
                <ChevronRight className="size-7" />
              </button>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded bg-white/10 text-white text-sm">
                {idx + 1} / {total}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};


const BUNDESLAND_NAMES: Record<string, string> = {
  BB: "Brandenburg",
  BE: "Berlin",
  MV: "Mecklenburg-Vorpommern",
  ST: "Sachsen-Anhalt",
  SN: "Sachsen",
  TH: "Thüringen",
  NI: "Niedersachsen",
  NW: "Nordrhein-Westfalen",
  HE: "Hessen",
  BY: "Bayern",
  BW: "Baden-Württemberg",
  RP: "Rheinland-Pfalz",
  SL: "Saarland",
  HH: "Hamburg",
  HB: "Bremen",
  SH: "Schleswig-Holstein",
};

const AdressBlock = () => {
  const r = useRecordContext<Baugrundstueck>();
  const notify = useNotify();
  const [update, { isPending }] = useUpdate();
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({
    strasse: "",
    plz: "",
    ort: "",
    ortsteil: "",
    state_abbr: "",
  });
  useEffect(() => {
    if (r) {
      setForm({
        strasse: r.strasse ?? "",
        plz: r.plz ?? "",
        ort: r.ort ?? "",
        ortsteil: r.ortsteil ?? "",
        state_abbr: r.state_abbr ?? "BB",
      });
    }
  }, [r]);
  if (!r) return null;
  const bundesland = BUNDESLAND_NAMES[r.state_abbr ?? "BB"] ?? r.state_abbr ?? "";
  const save = () => {
    const patch: Record<string, any> = {
      strasse: form.strasse.trim() || null,
      plz: form.plz.trim() || null,
      ort: form.ort.trim() || null,
      ortsteil: form.ortsteil.trim() || null,
      state_abbr: form.state_abbr.trim() || null,
    };
    update(
      "kleinanzeigen_grundstueck",
      { id: r.id, data: patch, previousData: r },
      {
        onSuccess: () => {
          notify("Adresse gespeichert", { type: "success" });
          setEdit(false);
        },
        onError: (e: any) =>
          notify(`Fehler: ${e?.message ?? e}`, { type: "error" }),
      },
    );
  };
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Adresse</CardTitle>
          {!edit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEdit(true)}
              aria-label="Adresse bearbeiten"
            >
              <Edit2 className="size-4 mr-1" /> Bearbeiten
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {edit ? (
          <div className="space-y-2">
            <Input
              placeholder="Straße + Hausnummer"
              value={form.strasse}
              onChange={(e) => setForm({ ...form, strasse: e.target.value })}
            />
            <div className="flex gap-2">
              <Input
                placeholder="PLZ"
                value={form.plz}
                onChange={(e) => setForm({ ...form, plz: e.target.value })}
                className="max-w-[100px]"
              />
              <Input
                placeholder="Ort"
                value={form.ort}
                onChange={(e) => setForm({ ...form, ort: e.target.value })}
              />
            </div>
            <Input
              placeholder="Ortsteil"
              value={form.ortsteil}
              onChange={(e) => setForm({ ...form, ortsteil: e.target.value })}
            />
            <Input
              placeholder="Bundesland-Kürzel (BB, BE, MV, …)"
              value={form.state_abbr}
              onChange={(e) =>
                setForm({ ...form, state_abbr: e.target.value.toUpperCase() })
              }
              className="max-w-[200px]"
            />
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={save} disabled={isPending}>
                <Save className="size-4 mr-1" /> Speichern
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEdit(false)}
                disabled={isPending}
              >
                Abbrechen
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-sm">
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => {
                  const adr = [r.strasse, [r.plz, r.ort].filter(Boolean).join(" ")]
                    .filter(Boolean).join(", ");
                  if (!adr) return;
                  navigator.clipboard.writeText(adr);
                  notify("Adresse kopiert", { type: "success" });
                }}
                className="mt-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Anschrift kopieren"
                title="Anschrift kopieren (Straße, PLZ Ort)"
              >
                <Copy className="size-4" />
              </button>
              <div className="flex-1 space-y-1">
                {r.strasse && <div className="font-medium">{r.strasse}</div>}
                <div className={r.strasse ? "" : "font-medium"}>
                  {[r.plz, r.ort].filter(Boolean).join(" ") || "—"}
                </div>
                {r.ortsteil && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Ortsteil</span>
                    <span>{r.ortsteil}</span>
                  </div>
                )}
                {bundesland && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Bundesland</span>
                    <span>{bundesland}</span>
                  </div>
                )}
                {r.bild_strasse_hinweis && !r.strasse && (
                  <div className="text-xs pt-1 border-t mt-1">
                    <span className="text-muted-foreground">Bild-Hinweis: </span>
                    <span className="text-emerald-700">{r.bild_strasse_hinweis}</span>
                  </div>
                )}
              </div>
            </div>
            {r.bild_analyse_text && (
              <div className="text-xs text-muted-foreground pt-2 border-t mt-2 whitespace-pre-wrap">
                {r.bild_analyse_text}
              </div>
            )}
            <div className="pt-2">
              <MapsPille />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};


const MapsPille = () => {
  const r = useRecordContext<Baugrundstueck>();
  if (!r?.plz) return null;
  const adr = [r.strasse, `${r.plz} ${r.ort ?? ""}${r.ortsteil ? " " + r.ortsteil : ""}`]
    .filter(Boolean).join(", ");
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adr)}`;
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={gmaps} target="_blank" rel="noopener noreferrer">
        <MapPin className="size-3 mr-1" />
        Google Maps
      </a>
    </Button>
  );
};

const Anschrift = () => {
  const r = useRecordContext<Baugrundstueck>();
  const notify = useNotify();
  if (!r?.plz) return null;
  const anschrift = cleanText(
    r.locality_full ||
      `${r.plz} ${r.ort ?? ""}${r.ortsteil ? " · " + r.ortsteil : ""}`,
  );
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(anschrift)}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          navigator.clipboard.writeText(anschrift);
          notify("Anschrift kopiert", { type: "success" });
        }}
      >
        <Copy className="size-3 mr-1" />
        {anschrift}
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a href={gmaps} target="_blank" rel="noopener noreferrer">
          <MapPin className="size-3 mr-1" />
          Google Maps
        </a>
      </Button>
    </div>
  );
};

const TriageBlock = () => {
  const r = useRecordContext<Baugrundstueck>();
  const [update, { isPending }] = useUpdate();
  const notify = useNotify();
  if (!r) return null;
  const set = (triage: string | null) =>
    update(
      "kleinanzeigen_grundstueck",
      { id: r.id, data: { triage }, previousData: r },
      {
        onSuccess: () => notify("Triage gesetzt", { type: "success" }),
        onError: (e: any) =>
          notify(`Fehler: ${e?.message ?? e}`, { type: "error" }),
      },
    );
  return (
    <div className="flex flex-wrap gap-2">
      {BAUG_TRIAGE.map((t) => (
        <Button
          key={t.value}
          variant={r.triage === t.value ? "default" : "outline"}
          size="sm"
          disabled={isPending}
          onClick={() => set(t.value)}
        >
          {t.label}
        </Button>
      ))}
      {r.triage && (
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => set(null)}
        >
          Zurücksetzen
        </Button>
      )}
    </div>
  );
};

const NotizBlock = () => {
  const r = useRecordContext<Baugrundstueck>();
  const [update] = useUpdate();
  const notify = useNotify();
  const [value, setValue] = useState(r?.notiz ?? "");
  if (!r) return null;
  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Notiz…"
        rows={4}
      />
      <Button
        size="sm"
        onClick={() =>
          update(
            "kleinanzeigen_grundstueck",
            { id: r.id, data: { notiz: value }, previousData: r },
            {
              onSuccess: () => notify("Notiz gespeichert", { type: "success" }),
              onError: (e: any) =>
                notify(`Fehler: ${e?.message ?? e}`, { type: "error" }),
            },
          )
        }
      >
        Notiz speichern
      </Button>
    </div>
  );
};

const FavoritButton = () => {
  const r = useRecordContext<Baugrundstueck>();
  const { isFavorit, toggle, isToggling } = useBaugFavoriten();
  if (!r) return null;
  const fav = isFavorit(r.kid);
  return (
    <Button
      variant={fav ? "default" : "outline"}
      size="sm"
      disabled={isToggling}
      onClick={() => toggle(r.kid)}
    >
      <Heart className={`size-4 mr-1 ${fav ? "fill-current" : ""}`} />
      {fav ? "Favorit" : "Als Favorit markieren"}
    </Button>
  );
};


type Dokument = {
  id: number;
  kid: number;
  idx: number;
  dateiname: string;
  pfad: string;
  herkunft_url: string;
  bytes: number | null;
};

const formatBytes = (n?: number | null) => {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const DokumenteCard = () => {
  const r = useRecordContext<Baugrundstueck>();
  const [docs, setDocs] = useState<Dokument[] | null>(null);
  const [viewing, setViewing] = useState<Dokument | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const notify = useNotify();

  useEffect(() => {
    if (!r?.kid) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await getSupabaseClient()
        .from("kleinanzeigen_dokumente")
        .select("*")
        .eq("kid", r.kid)
        .order("idx");
      if (cancelled) return;
      if (error) {
        notify(`Dokumente: ${error.message}`, { type: "error" });
        setDocs([]);
      } else {
        setDocs((data as Dokument[]) ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [r?.kid, notify]);

  useEffect(() => {
    if (!viewing) {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    setUrlLoading(true);
    (async () => {
      try {
        const { data, error } = await getSupabaseClient()
          .storage.from("kleinanzeigen-dokumente")
          .createSignedUrl(viewing.pfad, 3600);
        if (cancelled) return;
        if (error || !data?.signedUrl) throw error;
        setSignedUrl(data.signedUrl);
      } catch (e: any) {
        if (!cancelled)
          notify(`Konnte Dokument nicht laden: ${e?.message ?? e}`, {
            type: "error",
          });
      } finally {
        if (!cancelled) setUrlLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewing, notify]);

  if (docs === null) {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Lade Dokumente …
      </div>
    );
  }
  if (docs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Keine Dokumente in dieser Anzeige.
      </div>
    );
  }
  return (
    <>
      <ul className="divide-y rounded-md border bg-card">
        {docs.map((d) => (
          <li
            key={d.id}
            className="flex items-center gap-3 p-3 hover:bg-muted cursor-pointer"
            onClick={() => setViewing(d)}
          >
            <FileText className="size-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{d.dateiname}</div>
              <div className="text-xs text-muted-foreground">
                {d.bytes ? formatBytes(d.bytes) : ""}
              </div>
            </div>
            <Button variant="ghost" size="sm" tabIndex={-1}>
              Öffnen
            </Button>
          </li>
        ))}
      </ul>

      <Dialog
        open={viewing !== null}
        onOpenChange={(o) => {
          if (!o) setViewing(null);
        }}
      >
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-4">
          <DialogHeader>
            <DialogTitle className="text-sm truncate">
              {viewing?.dateiname}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted rounded">
            {urlLoading || !signedUrl ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <Loader2 className="size-5 animate-spin mr-2" /> Lade PDF …
              </div>
            ) : (
              <iframe
                src={signedUrl}
                title={viewing?.dateiname}
                className="w-full h-full rounded"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};


const BAUBARKEIT_OPTIONS = ["EFH", "DHH", "EFH/EW", "MFH", "gemischt"];
const BaubarkeitChips = () => {
  const r = useRecordContext<Baugrundstueck>();
  const notify = useNotify();
  const [update] = useUpdate();
  if (!r) return null;
  const selected = new Set<string>(r.baubarkeit_typ ?? []);
  const toggle = (opt: string) => {
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    const arr = [...next].sort();
    update(
      "kleinanzeigen_grundstueck",
      {
        id: r.id,
        data: { baubarkeit_typ: arr.length > 0 ? arr : null },
        previousData: r,
      },
      {
        onError: (e: any) =>
          notify(`Fehler: ${e?.message ?? e}`, { type: "error" }),
      },
    );
  };
  return (
    <div className="flex flex-wrap gap-1.5 max-w-[60%] justify-end">
      {BAUBARKEIT_OPTIONS.map((opt) => {
        const on = selected.has(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={
              "text-[11px] px-2 py-0.5 rounded border transition-colors " +
              (on
                ? "bg-slate-700 text-white border-slate-700"
                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50")
            }
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
};


const BaurechtCard = () => {
  const r = useRecordContext<Baugrundstueck>();
  const notify = useNotify();
  const [update, { isPending }] = useUpdate();
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<any>({});
  useEffect(() => {
    if (r) {
      setForm({
        bauerwartungsland: r.bauerwartungsland,
        bautraegerfrei: r.bautraegerfrei,
        erbbaurecht: r.erbbaurecht,
        grz: r.grz ?? "",
        gfz: r.gfz ?? "",
        vollgeschosse: r.vollgeschosse ?? "",
        bpl_vorhanden: r.bpl_vorhanden ?? false,
        bpl_nummer: r.bpl_nummer ?? "",
        paragraph_34: r.paragraph_34 ?? false,
        paragraph_35: r.paragraph_35,
        erschliessung: r.erschliessung ?? "",
        teilbar: r.teilbar ?? false,
        baufeld_qm: r.baufeld_qm ?? "",
        grundflaeche_qm: r.grundflaeche_qm ?? "",
        wohnflaeche_qm: r.wohnflaeche_qm ?? "",
        gemarkung: r.gemarkung ?? "",
        flur: r.flur ?? "",
        flurstueck: r.flurstueck ?? "",
        bebaubarkeit_kurz: r.bebaubarkeit_kurz ?? "",
      });
    }
  }, [r]);
  if (!r) return null;
  const fmtQm = (v?: number | null) =>
    v ? `${new Intl.NumberFormat("de-DE").format(Math.round(v))} m²` : "—";
  const numOrNull = (v: any) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = parseFloat(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const intOrNull = (v: any) => {
    const n = numOrNull(v);
    return n === null ? null : Math.round(n);
  };
  const strOrNull = (v: any) => (v && String(v).trim() ? String(v).trim() : null);
  const save = () => {
    const patch: any = {
      bauerwartungsland: form.bauerwartungsland,
      bautraegerfrei: form.bautraegerfrei,
      erbbaurecht: form.erbbaurecht,
      grz: numOrNull(form.grz),
      gfz: numOrNull(form.gfz),
      vollgeschosse: intOrNull(form.vollgeschosse),
      bpl_vorhanden: form.bpl_vorhanden,
      bpl_nummer: strOrNull(form.bpl_nummer),
      paragraph_34: form.paragraph_34,
      paragraph_35: form.paragraph_35,
      erschliessung: strOrNull(form.erschliessung),
      teilbar: form.teilbar,
      baufeld_qm: numOrNull(form.baufeld_qm),
      grundflaeche_qm: numOrNull(form.grundflaeche_qm),
      wohnflaeche_qm: numOrNull(form.wohnflaeche_qm),
      gemarkung: strOrNull(form.gemarkung),
      flur: strOrNull(form.flur),
      flurstueck: strOrNull(form.flurstueck),
      bebaubarkeit_kurz: strOrNull(form.bebaubarkeit_kurz),
    };
    update(
      "kleinanzeigen_grundstueck",
      { id: r.id, data: patch, previousData: r },
      {
        onSuccess: () => {
          notify("Baurecht gespeichert", { type: "success" });
          setEdit(false);
        },
        onError: (e: any) =>
          notify(`Fehler: ${e?.message ?? e}`, { type: "error" }),
      },
    );
  };
  const triState = (
    label: string,
    val: boolean | null | undefined,
    onChange: (v: boolean | null) => void,
  ) => (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-32">{label}</span>
      <div className="flex gap-1">
        {[
          { v: true, l: "ja" },
          { v: false, l: "nein" },
          { v: null, l: "—" },
        ].map((opt) => (
          <button
            key={opt.l}
            type="button"
            className={
              "text-[11px] px-2 py-0.5 rounded border " +
              (val === opt.v
                ? "bg-slate-700 text-white border-slate-700"
                : "bg-white border-slate-300 hover:bg-slate-50")
            }
            onClick={() => onChange(opt.v)}
          >
            {opt.l}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            Baurecht
            {r.bauerwartungsland && (
              <Badge variant="outline" className="border-amber-500 text-amber-700 bg-amber-50">
                Bauerwartungsland
              </Badge>
            )}
            {r.baureif && !r.bauerwartungsland && (
              <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">
                Baureif
              </Badge>
            )}
          </CardTitle>
          {!edit && (
            <Button variant="ghost" size="sm" onClick={() => setEdit(true)}>
              <Edit2 className="size-4 mr-1" /> Bearbeiten
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {!edit ? (
          <>
            {r.bebaubarkeit_kurz && (
              <p className="italic text-muted-foreground">„{r.bebaubarkeit_kurz}"</p>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">GRZ</span>
                <span>{r.grz ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">GFZ</span>
                <span>{r.gfz ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vollgeschosse</span>
                <span>{r.vollgeschosse ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Teilbar</span>
                <span>{r.teilbar === true ? "ja" : r.teilbar === false ? "nein" : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Erschließung</span>
                <span>{r.erschliessung ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Erbbaurecht</span>
                <span>
                  {r.erbbaurecht === true ? "ja" : r.erbbaurecht === false ? "nein" : "—"}
                </span>
              </div>
              <div className="flex justify-between col-span-2 items-center">
                <span className="text-muted-foreground">Baubarkeit</span>
                <BaubarkeitChips />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Baufeld</span>
                <span>{fmtQm(r.baufeld_qm)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Grundfläche (GR)</span>
                <span>{fmtQm(r.grundflaeche_qm)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Wohnfläche (WFL)</span>
                <span>{fmtQm(r.wohnflaeche_qm)}</span>
              </div>
              {/* Kataster — eigene Einheit mit Trennlinien */}
              <div className="col-span-2 border-t border-b py-2 my-1 space-y-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Kataster
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gemarkung</span>
                    <span>{r.gemarkung ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Flur</span>
                    <span>{r.flur ?? "—"}</span>
                  </div>
                  <div className="flex justify-between col-span-2">
                    <span className="text-muted-foreground">Flurstück</span>
                    <span className="font-mono text-xs">{r.flurstueck ?? "—"}</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-between col-span-2">
                <span className="text-muted-foreground">§34 BauGB</span>
                <span>
                  {r.paragraph_34 ? (
                    <Badge variant="outline" className="border-purple-500 text-purple-700 bg-purple-50">
                      Angepasste Umgebungsbebauung
                    </Badge>
                  ) : ("—")}
                </span>
              </div>
              <div className="flex justify-between col-span-2">
                <span className="text-muted-foreground">§35 BauGB</span>
                <span>
                  {r.paragraph_35 ? (
                    <Badge variant="outline" className="border-amber-600 text-amber-800 bg-amber-50">
                      Außenbereich
                    </Badge>
                  ) : r.paragraph_35 === false ? "nein" : "—"}
                </span>
              </div>
              <div className="flex justify-between col-span-2">
                <span className="text-muted-foreground">B-Plan (§30)</span>
                <span>
                  {r.bpl_vorhanden
                    ? (
                      <Badge variant="outline" className="border-blue-500 text-blue-700 bg-blue-50">
                        {r.bpl_nummer || "vorhanden"}
                      </Badge>
                    )
                    : r.bpl_vorhanden === false ? "nein" : "—"}
                </span>
              </div>
            </div>
            {r.risiken && r.risiken.length > 0 && (
              <div className="pt-2 border-t">
                <div className="text-xs text-muted-foreground mb-1">Risiken (KI):</div>
                <div className="flex flex-wrap gap-1">
                  {r.risiken.map((rk) => (
                    <Badge key={rk} variant="outline" className="border-red-500 text-red-700 bg-red-50">
                      {rk}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {r.ki_analyse_at && (
              <div className="text-[10px] text-muted-foreground pt-1">
                KI-Analyse: {new Date(r.ki_analyse_at).toLocaleString("de-DE")}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-2">
            <Textarea
              placeholder="Bebaubarkeit (Kurzbeschreibung, max. 200 Zeichen)"
              value={form.bebaubarkeit_kurz}
              onChange={(e) => setForm({ ...form, bebaubarkeit_kurz: e.target.value })}
              rows={2}
              maxLength={200}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="GRZ (z.B. 0,4)" value={form.grz}
                onChange={(e) => setForm({ ...form, grz: e.target.value })} />
              <Input placeholder="GFZ (z.B. 0,8)" value={form.gfz}
                onChange={(e) => setForm({ ...form, gfz: e.target.value })} />
              <Input placeholder="Vollgeschosse" value={form.vollgeschosse}
                onChange={(e) => setForm({ ...form, vollgeschosse: e.target.value })} />
              <Input placeholder="Erschließung (voll/teilweise/unerschlossen)" value={form.erschliessung}
                onChange={(e) => setForm({ ...form, erschliessung: e.target.value })} />
              <Input placeholder="Baufeld m²" value={form.baufeld_qm}
                onChange={(e) => setForm({ ...form, baufeld_qm: e.target.value })} />
              <Input placeholder="Grundfläche GR m²" value={form.grundflaeche_qm}
                onChange={(e) => setForm({ ...form, grundflaeche_qm: e.target.value })} />
              <Input placeholder="Wohnfläche WFL m²" value={form.wohnflaeche_qm}
                onChange={(e) => setForm({ ...form, wohnflaeche_qm: e.target.value })} />
              <Input placeholder="B-Plan-Nummer" value={form.bpl_nummer}
                onChange={(e) => setForm({ ...form, bpl_nummer: e.target.value })} />
              <Input placeholder="Gemarkung" value={form.gemarkung}
                onChange={(e) => setForm({ ...form, gemarkung: e.target.value })} />
              <Input placeholder="Flur" value={form.flur}
                onChange={(e) => setForm({ ...form, flur: e.target.value })} />
              <Input placeholder="Flurstück (z.B. 123/45)" value={form.flurstueck}
                onChange={(e) => setForm({ ...form, flurstueck: e.target.value })}
                className="col-span-2" />
            </div>
            {triState("Bauerwartungsland", form.bauerwartungsland,
              (v) => setForm({ ...form, bauerwartungsland: v }))}
            {triState("Bauträgerfrei", form.bautraegerfrei,
              (v) => setForm({ ...form, bautraegerfrei: v }))}
            {triState("Teilbar", form.teilbar,
              (v) => setForm({ ...form, teilbar: v }))}
            {triState("B-Plan vorhanden", form.bpl_vorhanden,
              (v) => setForm({ ...form, bpl_vorhanden: v }))}
            {triState("§34 BauGB", form.paragraph_34,
              (v) => setForm({ ...form, paragraph_34: v }))}
            {triState("§35 Außenbereich", form.paragraph_35,
              (v) => setForm({ ...form, paragraph_35: v }))}
            {triState("Erbbaurecht", form.erbbaurecht,
              (v) => setForm({ ...form, erbbaurecht: v }))}
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={save} disabled={isPending}>
                <Save className="size-4 mr-1" /> Speichern
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEdit(false)} disabled={isPending}>
                Abbrechen
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const ShowBody = () => {
  const r = useRecordContext<Baugrundstueck>();
  if (!r) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-4">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start gap-4">
              <div>
                <CardTitle className="text-lg leading-tight">
                  {r.title}
                </CardTitle>
                {r.tags && r.tags.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {r.tags.map((t) => (
                      <Badge key={t} variant="outline">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                <KiAnalyseButton />
                <BildAnalyseButton />
                <Badge>
                  {BAUG_STATUSES.find((s) => s.value === r.status)?.label ??
                    r.status}
                </Badge>
                <PrevNextNav />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <BilderSlider />
            <Button variant="outline" asChild>
              <a href={r.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4 mr-2" />
                Original-Inserat auf kleinanzeigen.de
              </a>
            </Button>
          </CardContent>
        </Card>

        <AdressBlock />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Beschreibung</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">
              {r.beschreibung ?? "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Dokumente{r.dokumente_anzahl ? ` (${r.dokumente_anzahl})` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DokumenteCard />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eigenschaften</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Preis</span>
              <span className="font-medium tabular-nums">
                {r.preis_vb ? "VB " : ""}
                {formatEur(r.preis_eur)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fläche</span>
              <span>{formatQm(r.flaeche_qm)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">€/m²</span>
              <span>
                {r.preis_pro_qm ? formatEur(r.preis_pro_qm) : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Grundstücksart</span>
              <span>{r.grundstuecksart ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Angebotsart</span>
              <span>{r.angebotsart ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Provision</span>
              <span>{r.provision ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Inseriert</span>
              <span>{r.inserat_erstellt ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Aufrufe</span>
              <span>{r.aufrufe ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Kleinanzeigen-ID</span>
              <span className="tabular-nums">{r.kid}</span>
            </div>
          </CardContent>
        </Card>


        <BaurechtCard />

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Anbieter
              {r.eigenangebot && (
                <Badge variant="outline" className="border-emerald-500 text-emerald-700 bg-emerald-50">
                  Eigenangebot
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium text-right max-w-[60%]">
                {r.anbieter_name ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Typ</span>
              <span>
                {r.anbieter_typ === "privat"
                  ? "Privater Nutzer"
                  : r.anbieter_typ === "gewerblich"
                    ? "Gewerblicher Nutzer"
                    : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Aktiv seit</span>
              <span>
                {r.anbieter_aktiv_seit
                  ? new Date(r.anbieter_aktiv_seit).toLocaleDateString("de-DE")
                  : "—"}
              </span>
            </div>
            {r.anbieter_objekt_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Objekt-ID</span>
                <span className="font-mono text-xs">{r.anbieter_objekt_id}</span>
              </div>
            )}
            {r.kontakt_id && (
              <div className="pt-2 border-t mt-2">
                <Button variant="outline" size="sm" asChild className="w-full">
                  <Link to={`/contacts/${r.kontakt_id}/show`}>
                    Kontakt öffnen →
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aktionen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FavoritButton />
            <div>
              <div className="text-xs text-muted-foreground mb-1">Triage</div>
              <TriageBlock />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Notiz</div>
              <NotizBlock />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const BaugrundstueckShow = () => (
  <Show>
    <ShowBody />
  </Show>
);

export default BaugrundstueckShow;
