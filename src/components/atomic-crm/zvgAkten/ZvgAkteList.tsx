import { useEffect, useMemo, useState } from "react";
import { useGetIdentity, useListContext, useRecordContext } from "ra-core";
import {
  BookText,
  Camera,
  Clock,
  Coins,
  FileText,
  Files,
  Gavel,
  Globe2,
  Heart,
  List,
  Mail,
  MailCheck,
  Map as MapIcon,
  MapPin,
  TrendingUp,
} from "lucide-react";
import { addDays } from "date-fns";

import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";
import { ToggleFilterButton } from "@/components/admin/toggle-filter-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

import { FilterCategory } from "../filters/FilterCategory";
import { ResponsiveFilters } from "../misc/ResponsiveFilters";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { ZVG_STATUSES, type ZvgAkte } from "./index";
import { useFavoriten } from "./useFavoriten";
import {
  BatchAnfrageButton,
  BulkBatchAnfrageButton,
} from "./BatchAnfrageButton";
import { ZvgAkteMap } from "./ZvgAkteMap";
import { useViewMode } from "./useViewMode";
import { ExportButton } from "@/components/admin/export-button";
import { states } from "../companies/states";
import { getSupabaseClient } from "../providers/supabase/supabase";

const formatEur = (value?: number | null) => {
  if (value == null) return "—";
  const n = Number(value);
  // Marker-Werte (0 € / 1 €) bedeuten faktisch "kein Verkehrswert ermittelt"
  if (n <= 1) return "k. A.";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const FavoritHerz = () => {
  const r = useRecordContext<ZvgAkte>();
  const { isFavorit, toggle, isToggling } = useFavoriten();
  if (!r) return null;
  const fav = isFavorit(r.zid);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-6 hover:bg-transparent"
      disabled={isToggling}
      onClick={(e) => {
        e.stopPropagation();
        toggle(r.zid);
      }}
      aria-label={fav ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}
      title={fav ? "Favorit entfernen" : "Zu Favoriten hinzufügen"}
    >
      <Heart
        className={
          fav
            ? "size-4 fill-red-500 text-red-500"
            : "size-4 text-muted-foreground"
        }
      />
    </Button>
  );
};

const ZvgAkteList = () => {
  const { identity } = useGetIdentity();
  if (!identity) return null;

  return (
    <List
      title="ZVG-Akten"
      perPage={25}
      sort={{ field: "termin", order: "ASC" }}
      exporter={false}
      actions={
        <div className="flex items-center gap-2">
          <BatchAnfrageButton />
          <ExportButton />
        </div>
      }
    >
      <ZvgAkteListLayout />
    </List>
  );
};

const ZvgAkteListLayout = () => {
  const { isPending } = useListContext();
  if (isPending) return null;

  return (
    <div className="flex flex-row gap-8">
      <ZvgAkteListFilter />
      <div className="w-full flex flex-col gap-4">
        <div className="flex gap-2 items-center">
          <ViewToggle />
        </div>
        <ViewSwitchedContent>
          <Card className="py-0">
            <DataTable<ZvgAkte>
              rowClick="show"
              bulkActionButtons={<BulkBatchAnfrageButton />}
            >
              <DataTable.Col<ZvgAkte>
                label=""
                headerClassName="w-8"
                cellClassName="w-8 px-1"
                disableSort
                render={() => <FavoritHerz />}
              />
              <DataTable.Col<ZvgAkte> source="az" label="AZ" />
              <DataTable.Col<ZvgAkte>
                source="objektart"
                label="Objektart"
                cellClassName="max-w-[280px] sm:max-w-[360px] md:max-w-[480px]"
                render={(record) => {
                  const txt = record.objektart?.trim() ?? "—";
                  return (
                    <span
                      className="block truncate"
                      title={txt !== "—" ? txt : undefined}
                    >
                      {txt}
                    </span>
                  );
                }}
              />
              <DataTable.Col<ZvgAkte>
                label={
                  <span title="Geringstes Gebot (aus Anordnung/Gutachten extrahiert)">
                    <Gavel className="size-3.5 inline-block" />
                  </span>
                }
                source="geringstes_gebot_eur"
                headerClassName="w-12"
                cellClassName="w-12 px-1"
                disableSort
                render={(record) => {
                  const q = record.geringstes_gebot_quelle;
                  if (q === "in_progress") {
                    return (
                      <Badge
                        variant="outline"
                        className="bg-blue-50 text-blue-700 border-blue-300 font-semibold px-1.5 py-0 h-5"
                        title="Haiku-Analyse läuft"
                      >
                        …
                      </Badge>
                    );
                  }
                  if (q === "failed") {
                    return (
                      <Badge
                        variant="outline"
                        className="bg-red-50 text-red-700 border-red-300 font-semibold px-1.5 py-0 h-5"
                        title="Haiku-Job fehlgeschlagen"
                      >
                        !
                      </Badge>
                    );
                  }
                  if (record.geringstes_gebot_eur != null) {
                    const eur = Number(record.geringstes_gebot_eur);
                    const k =
                      eur >= 1000 ? Math.round(eur / 1000) + "k" : String(eur);
                    const rang = record.geringstes_gebot_rang_betreibend;
                    return (
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-800 border-amber-300 font-semibold px-1.5 py-0 h-5"
                        title={`Geringstes Gebot: ${eur.toLocaleString("de-DE")} EUR${rang ? ` · Rang ${rang}` : ""}`}
                      >
                        {k}
                      </Badge>
                    );
                  }
                  // Quelle vorhanden, aber EUR=NULL (Haiku konnte nichts ableiten)
                  if (q && q !== "in_progress" && q !== "failed") {
                    return (
                      <Badge
                        variant="outline"
                        className="bg-zinc-50 text-zinc-600 border-zinc-300 font-semibold px-1.5 py-0 h-5"
                        title="Geringstes Gebot analysiert, aber Dokumente liefern keinen eindeutigen Wert"
                      >
                        ?
                      </Badge>
                    );
                  }
                  return null;
                }}
              />
              <DataTable.Col<ZvgAkte>
                source="fotos_count"
                label={
                  <span title="Anzahl extrahierter Fotos aus Gutachten/Exposé">
                    <Camera className="size-3.5 inline-block" />
                  </span>
                }
                headerClassName="w-8"
                cellClassName="w-8 px-1"
                disableSort
                render={(record) => {
                  const n = record.fotos_count ?? 0;
                  if (n === 0) return null;
                  return (
                    <Badge
                      variant="outline"
                      className="bg-sky-50 text-sky-700 border-sky-300 font-semibold px-1.5 py-0 h-5 tabular-nums"
                      title={`${n} Foto${n === 1 ? "" : "s"} aus Gutachten extrahiert`}
                    >
                      {n}
                    </Badge>
                  );
                }}
              />
              <DataTable.Col<ZvgAkte>
                source="dokumente_count"
                label={
                  <span title="Anzahl Dokumente im Storage (Anordnung, Gutachten, Exposé etc.)">
                    <Files className="size-3.5 inline-block" />
                  </span>
                }
                headerClassName="w-8"
                cellClassName="w-8 px-1"
                disableSort
                render={(record) => {
                  const n = record.dokumente_count ?? 0;
                  if (n === 0) return null;
                  return (
                    <Badge
                      variant="outline"
                      className="bg-slate-50 text-slate-700 border-slate-300 font-semibold px-1.5 py-0 h-5 tabular-nums"
                      title={`${n} Dokument${n === 1 ? "" : "e"} im Storage`}
                    >
                      {n}
                    </Badge>
                  );
                }}
              />
              <DataTable.Col<ZvgAkte>
                source="gpreis_eur"
                label={
                  <span title="Gutachten verfügbar (grün) oder kostenpflichtig (G€)">
                    <BookText className="size-3.5 inline-block" />
                  </span>
                }
                headerClassName="w-8"
                cellClassName="w-8"
                disableSort
                render={(record) => {
                  // Priorität: volles Gutachten > Exposé > zvg.com kostenlos > kostenpflichtig
                  const hatGutachten = record.hat_gutachten_lokal === true;
                  const hatExpose = record.hat_expose_lokal === true;
                  const kostenlos =
                    record.gpreis_eur === 0 && record.gutachten_url;
                  if (hatGutachten || kostenlos) {
                    return (
                      <Badge
                        variant="outline"
                        className="bg-green-50 text-green-800 border-green-300 font-semibold px-1.5 py-0 h-5"
                        title={
                          hatGutachten
                            ? "Gutachten lokal verfügbar"
                            : "Kostenloses Gutachten (zvg.com)"
                        }
                      >
                        G
                      </Badge>
                    );
                  }
                  if (hatExpose) {
                    return (
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-800 border-amber-300 font-semibold px-1.5 py-0 h-5"
                        title="Nur Exposé verfügbar — kein vollständiges Gutachten"
                      >
                        E
                      </Badge>
                    );
                  }
                  if (record.gpreis_eur && record.gpreis_eur > 0) {
                    return (
                      <Badge
                        variant="outline"
                        className="bg-muted text-muted-foreground border-muted-foreground/30 font-semibold px-1.5 py-0 h-5"
                        title={`Gutachten kostenpflichtig (${record.gpreis_eur} €)`}
                      >
                        G€
                      </Badge>
                    );
                  }
                  return null;
                }}
              />
              <DataTable.Col<ZvgAkte>
                source="termin"
                label="Termin"
                render={(record) => formatDate(record.termin)}
              />
              <DataTable.Col<ZvgAkte>
                source="aufnahmetag"
                label="Aufnahmetag"
                render={(record) => formatDate(record.aufnahmetag)}
              />
              <DataTable.Col<ZvgAkte>
                source="vkw_eur"
                label="VKW"
                headerClassName="text-right"
                cellClassName="text-right"
                render={(record) => (
                  <span className="tabular-nums">
                    {formatEur(record.vkw_eur)}
                  </span>
                )}
              />
              <DataTable.Col<ZvgAkte>
                source="geocoding_precision"
                label={
                  <span title="Geo-Präzision: 2 Kreise = Straße/Hausnummer, 1 Kreis = PLZ/Ortsmitte">
                    <Globe2 className="size-3.5 inline-block" />
                  </span>
                }
                headerClassName="w-6 text-center"
                cellClassName="w-6 px-0 text-center"
                disableSort
                render={(record) => {
                  const prec = record.geocoding_precision;
                  if (prec === "house" || prec === "street") {
                    return (
                      <span
                        className="inline-flex items-center justify-center"
                        title={`Präzise geocodiert (${prec === "house" ? "Hausnummer" : "Straße"})`}
                        aria-label="präzise geocodiert"
                      >
                        <span className="relative inline-block size-3">
                          <span className="absolute inset-0 rounded-full border-2 border-emerald-500/60" />
                          <span className="absolute inset-[3px] rounded-full bg-emerald-600" />
                        </span>
                      </span>
                    );
                  }
                  if (prec === "postcode" || prec === "city") {
                    return (
                      <span
                        className="inline-flex items-center justify-center"
                        title={`Geocodiert (${prec === "postcode" ? "Postleitzahl" : "Ortsmitte"})`}
                        aria-label="geocodiert"
                      >
                        <span className="inline-block size-2.5 rounded-full border-2 border-amber-500/70" />
                      </span>
                    );
                  }
                  return null;
                }}
              />
              <DataTable.Col<ZvgAkte>
                source="objekt_ort"
                label="Ort"
                render={(record) =>
                  record.objekt_ort ?? record.objekt_ortsteil ?? "—"
                }
              />
              <DataTable.Col<ZvgAkte>
                source="ag_name_raw"
                label="Amtsgericht"
                render={(record) => record.ag_name_raw ?? "—"}
              />
              <DataTable.Col<ZvgAkte>
                source="status"
                label="Status"
                render={(record) => (
                  <Badge variant="secondary">
                    {ZVG_STATUSES.find((s) => s.value === record.status)
                      ?.label ?? record.status}
                  </Badge>
                )}
              />
              <DataTable.Col<ZvgAkte>
                source="letzte_anfrage_status"
                label="Anfrage"
                headerClassName="w-20"
                cellClassName="w-20 px-1"
                disableSort
                render={(record) => {
                  const st = record.letzte_anfrage_status;
                  // Keine Anfrage angelegt → keine Pille
                  if (!st || st === "entwurf") return null;
                  const versendet = st === "gesendet" || st === "beantwortet";
                  const beantwortet = st === "beantwortet";
                  const datum = record.letzte_anfrage_am
                    ? new Date(record.letzte_anfrage_am).toLocaleDateString(
                        "de-DE",
                        { day: "2-digit", month: "2-digit", year: "2-digit" },
                      )
                    : "";
                  const opt = record.letzte_anfrage_option;
                  const titleParts: string[] = [];
                  titleParts.push(
                    versendet
                      ? `Anfrage versendet${datum ? " am " + datum : ""}`
                      : "Anfrage nicht versendet",
                  );
                  titleParts.push(
                    beantwortet
                      ? `Antwort eingegangen${opt ? " · Option " + opt : ""}`
                      : "Keine Antwort",
                  );
                  return (
                    <span
                      className="inline-flex h-5 overflow-hidden rounded-full border text-[10px] font-semibold tabular-nums"
                      title={titleParts.join(" · ")}
                    >
                      <span
                        className={
                          "flex items-center px-1.5 " +
                          (versendet
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800")
                        }
                      >
                        <Mail className="size-3" />
                      </span>
                      <span
                        className={
                          "flex items-center px-1.5 border-l " +
                          (beantwortet
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800")
                        }
                      >
                        <MailCheck className="size-3" />
                      </span>
                    </span>
                  );
                }}
              />
            </DataTable>
          </Card>
        </ViewSwitchedContent>
      </div>
    </div>
  );
};

// View-Toggle Liste / Map — Zustand in localStorage, default Liste
const ViewToggle = () => {
  const [view, setView] = useViewMode();
  return (
    <div className="inline-flex rounded-md border bg-background overflow-hidden text-sm">
      <button
        type="button"
        onClick={() => setView("list")}
        className={
          "px-3 py-1.5 flex items-center gap-1.5 " +
          (view === "list"
            ? "bg-muted font-medium"
            : "hover:bg-muted/50 text-muted-foreground")
        }
      >
        <List className="size-4" />
        Liste
      </button>
      <button
        type="button"
        onClick={() => setView("map")}
        className={
          "px-3 py-1.5 flex items-center gap-1.5 border-l " +
          (view === "map"
            ? "bg-muted font-medium"
            : "hover:bg-muted/50 text-muted-foreground")
        }
      >
        <MapIcon className="size-4" />
        Karte
      </button>
    </div>
  );
};

const ViewSwitchedContent = ({ children }: { children: React.ReactNode }) => {
  const [view] = useViewMode();
  if (view === "map") return <ZvgAkteMap />;
  return <>{children}</>;
};

type CountMap = Record<string, number>;

const applyFilters = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filters: Record<string, unknown>,
  excludeKeys: string[],
) => {
  for (const [key, value] of Object.entries(filters)) {
    if (excludeKeys.includes(key)) continue;
    const m = key.match(/^(.+?)@(\w+)$/);
    if (m) {
      query = query.filter(m[1], m[2], value);
    } else if (value === null) {
      query = query.is(key, null);
    } else {
      query = query.eq(key, value);
    }
  }
  return query;
};

const useBundeslandCounts = (
  filterValues: Record<string, unknown>,
): { counts: CountMap; loading: boolean } => {
  const filterSig = useMemo(
    () =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(filterValues).filter(([k]) => k !== "state_abbr"),
        ),
      ),
    [filterValues],
  );
  const [counts, setCounts] = useState<CountMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const sb = getSupabaseClient();
    const otherFilters = JSON.parse(filterSig) as Record<string, unknown>;
    Promise.all(
      states.map(async (s) => {
        let q = sb
          .from("zvg_akte")
          .select("zid", { count: "exact", head: true })
          .eq("state_abbr", s.id);
        q = applyFilters(q, otherFilters, ["state_abbr"]);
        const { count } = await q;
        return [s.id, count ?? 0] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        setCounts(Object.fromEntries(entries));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filterSig]);

  return { counts, loading };
};

const StatusTriToggle = ({
  statusValue,
  label,
  isMobile,
}: {
  statusValue: string;
  label: string;
  isMobile: boolean;
}) => {
  const { filterValues, setFilters } = useListContext();
  const filters = (filterValues ?? {}) as Record<string, unknown>;
  const isInclude = filters.status === statusValue;
  const isExclude = filters["status@neq"] === statusValue;

  const cycle = () => {
    const nf: Record<string, unknown> = { ...filters };
    delete nf.status;
    delete nf["status@neq"];
    if (!isInclude && !isExclude) nf.status = statusValue;
    else if (isInclude) nf["status@neq"] = statusValue;
    // exclude → off (nichts hinzufügen)
    setFilters(nf, {}, false);
  };

  const baseCls =
    "w-auto md:w-full flex items-center justify-between gap-2 rounded-md border px-3 py-1 text-sm transition-colors";
  const sizeCls = isMobile ? "min-h-10" : "md:min-h-8 min-h-10";
  const stateCls = isInclude
    ? "bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100"
    : isExclude
      ? "bg-rose-50 text-rose-900 border-rose-300 hover:bg-rose-100 line-through decoration-rose-700/60"
      : "bg-transparent border-transparent hover:bg-muted text-foreground";

  const prefix = isExclude ? "≠ " : "";
  const indicator = isInclude ? "✓" : isExclude ? "✕" : "";

  return (
    <button
      type="button"
      onClick={cycle}
      className={`${baseCls} ${sizeCls} ${stateCls}`}
      title={
        isInclude
          ? `Filter: nur '${label}' (Klick: ausschließen)`
          : isExclude
            ? `Filter: alles außer '${label}' (Klick: aufheben)`
            : `Klick: nur '${label}' anzeigen`
      }
    >
      <span className="text-left leading-tight">
        {prefix}
        {label}
      </span>
      <span className="text-xs tabular-nums opacity-70 shrink-0">
        {indicator}
      </span>
    </button>
  );
};

const VkwFilter = () => {
  const { filterValues, setFilters } = useListContext();
  const filters = (filterValues ?? {}) as Record<string, unknown>;
  const vonRaw =
    typeof filters["vkw_eur@gte"] === "number"
      ? String(filters["vkw_eur@gte"])
      : ((filters["vkw_eur@gte"] as string | undefined) ?? "");
  const bisRaw =
    typeof filters["vkw_eur@lte"] === "number"
      ? String(filters["vkw_eur@lte"])
      : ((filters["vkw_eur@lte"] as string | undefined) ?? "");
  const onlyKa = filters["vkw_unbekannt"] === true;
  const excludeKa = filters["vkw_unbekannt"] === false;

  const setRange = (newVon: string, newBis: string) => {
    const nf: Record<string, unknown> = { ...filters };
    delete nf["vkw_eur@gte"];
    delete nf["vkw_eur@lte"];
    if (newVon && !isNaN(Number(newVon))) nf["vkw_eur@gte"] = Number(newVon);
    if (newBis && !isNaN(Number(newBis))) nf["vkw_eur@lte"] = Number(newBis);
    setFilters(nf, {}, false);
  };

  const cycleKa = () => {
    const nf: Record<string, unknown> = { ...filters };
    if (!onlyKa && !excludeKa) {
      nf["vkw_unbekannt"] = true; // nur k. A.
      delete nf["vkw_eur@gte"];
      delete nf["vkw_eur@lte"];
    } else if (onlyKa) {
      nf["vkw_unbekannt"] = false; // alles AUSSER k. A.
    } else {
      delete nf["vkw_unbekannt"]; // aus
    }
    setFilters(nf, {}, false);
  };

  const reset = () => {
    const nf: Record<string, unknown> = { ...filters };
    delete nf["vkw_eur@gte"];
    delete nf["vkw_eur@lte"];
    delete nf["vkw_unbekannt"];
    setFilters(nf, {}, false);
  };

  const aktiv = vonRaw || bisRaw || onlyKa || excludeKa;
  const kaCls = onlyKa
    ? "bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100"
    : excludeKa
      ? "bg-rose-50 text-rose-900 border-rose-300 hover:bg-rose-100"
      : "bg-transparent border-transparent hover:bg-muted text-foreground";

  return (
    <div className="flex flex-col gap-2 px-1 pt-1">
      <label className="text-xs text-muted-foreground flex flex-col gap-1">
        Von (EUR)
        <input
          type="number"
          inputMode="numeric"
          step={1000}
          min={0}
          value={vonRaw}
          onChange={(e) => setRange(e.target.value, bisRaw)}
          disabled={onlyKa}
          placeholder="z. B. 50000"
          className="border border-input rounded-md px-2 py-1 text-sm bg-background tabular-nums disabled:opacity-50 w-full max-w-[10rem]"
        />
      </label>
      <label className="text-xs text-muted-foreground flex flex-col gap-1">
        Bis (EUR)
        <input
          type="number"
          inputMode="numeric"
          step={1000}
          min={0}
          value={bisRaw}
          onChange={(e) => setRange(vonRaw, e.target.value)}
          disabled={onlyKa}
          placeholder="z. B. 250000"
          className="border border-input rounded-md px-2 py-1 text-sm bg-background tabular-nums disabled:opacity-50 w-full max-w-[10rem]"
        />
      </label>
      <button
        type="button"
        onClick={cycleKa}
        className={
          "w-full flex items-center justify-between rounded-md border px-3 h-8 text-sm transition-colors " +
          kaCls
        }
        title={
          onlyKa
            ? "Filter: nur Akten ohne ermittelten VKW (Klick: ausschließen)"
            : excludeKa
              ? "Filter: alles außer k. A. (Klick: aufheben)"
              : "Klick: nur Akten ohne ermittelten VKW anzeigen"
        }
      >
        <span>{excludeKa ? "≠ k. A." : "k. A."}</span>
        <span className="text-xs opacity-70">
          {onlyKa ? "✓" : excludeKa ? "✕" : ""}
        </span>
      </button>
      {aktiv && (
        <button
          type="button"
          onClick={reset}
          className="text-xs text-muted-foreground hover:text-foreground self-start underline"
        >
          Zurücksetzen
        </button>
      )}
    </div>
  );
};

const TerminDatumPicker = () => {
  const { filterValues, setFilters } = useListContext();
  const filters = (filterValues ?? {}) as Record<string, unknown>;
  const vonIso =
    typeof filters["termin@gte"] === "string"
      ? (filters["termin@gte"] as string)
      : "";
  const bisIso =
    typeof filters["termin@lte"] === "string"
      ? (filters["termin@lte"] as string)
      : "";
  const von = vonIso ? vonIso.slice(0, 10) : "";
  const bis = bisIso ? bisIso.slice(0, 10) : "";

  const apply = (newVon: string, newBis: string) => {
    const nf: Record<string, unknown> = { ...filters };
    delete nf["termin@gte"];
    delete nf["termin@lte"];
    if (newVon) nf["termin@gte"] = newVon + "T00:00:00.000Z";
    if (newBis) nf["termin@lte"] = newBis + "T23:59:59.999Z";
    setFilters(nf, {}, false);
  };

  const reset = () => {
    const nf: Record<string, unknown> = { ...filters };
    delete nf["termin@gte"];
    delete nf["termin@lte"];
    delete nf["status@neq"];
    setFilters(nf, {}, false);
  };

  const aktiv = von || bis;
  return (
    <div className="flex flex-col gap-2 px-1 pt-1">
      <label className="text-xs text-muted-foreground flex flex-col gap-1">
        Von
        <input
          type="date"
          value={von}
          onChange={(e) => apply(e.target.value, bis || e.target.value)}
          className="border border-input rounded-md px-2 py-1 text-sm bg-background w-full max-w-[10rem]"
        />
      </label>
      <label className="text-xs text-muted-foreground flex flex-col gap-1">
        Bis
        <input
          type="date"
          value={bis}
          onChange={(e) => apply(von, e.target.value)}
          className="border border-input rounded-md px-2 py-1 text-sm bg-background w-full max-w-[10rem]"
        />
      </label>
      {aktiv && (
        <button
          type="button"
          onClick={reset}
          className="text-xs text-muted-foreground hover:text-foreground self-start underline"
        >
          Zurücksetzen
        </button>
      )}
    </div>
  );
};

const ZvgAkteListFilter = () => {
  const isMobile = useIsMobile();
  const { favoriten } = useFavoriten();
  const favZids = Array.from(favoriten);
  // PostgREST "in"-Filter: zid in (z1,z2,...) → "zid@in": "(z1,z2,...)"
  // Wenn leer: Filter setzt impossible-value damit nichts gezeigt wird
  const favFilterValue =
    favZids.length > 0
      ? { "zid@in": `(${favZids.join(",")})` }
      : { "zid@eq": "__no_favoriten__" };
  const now = new Date();
  const in30 = addDays(now, 30).toISOString();
  const in90 = addDays(now, 90).toISOString();
  const nowIso = now.toISOString();

  // Heute (00:00 bis 23:59)
  const heuteStart = (() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();
  const heuteEnd = (() => {
    const d = new Date(now);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  })();
  const heuteLabel = now.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });

  // Letzter Werktag: Mo → Fr (3 zurück), So → Fr (2), Sa → Fr (1), Di-Fr → gestern (1).
  // Feiertage werden in v1 ignoriert — falls relevant, Tag manuell überspringen.
  const letzterWerktag = (() => {
    const d = new Date(now);
    const dow = d.getDay();
    let back = 1;
    if (dow === 1) back = 3;
    else if (dow === 0) back = 2;
    else if (dow === 6) back = 1;
    d.setDate(d.getDate() - back);
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const letzterWerktagStart = letzterWerktag.toISOString();
  const letzterWerktagEnd = (() => {
    const d = new Date(letzterWerktag);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  })();
  const letzterWerktagLabel = letzterWerktag.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });

  // Diese Woche (Mo 00:00 bis So 23:59)
  const wocheStart = (() => {
    const d = new Date(now);
    const dow = d.getDay();
    const back = dow === 0 ? 6 : dow - 1; // Sonntag → 6 zurück, sonst dow-1
    d.setDate(d.getDate() - back);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();
  const wocheEnd = (() => {
    const d = new Date(now);
    const dow = d.getDay();
    const fwd = dow === 0 ? 0 : 7 - dow; // Sonntag bleibt, sonst bis nächster So
    d.setDate(d.getDate() + fwd);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  })();

  const { filterValues } = useListContext();
  const { counts: blCounts } = useBundeslandCounts(filterValues || {});

  return (
    <ResponsiveFilters
      searchInput={{
        placeholder: "Suche (AZ, Ort, Titel)",
      }}
    >
      <FilterCategory label="Favoriten" icon={<Heart />}>
        <ToggleFilterButton
          className="w-auto md:w-full justify-between h-10 md:h-8"
          label={`Nur Favoriten${favZids.length ? ` (${favZids.length})` : ""}`}
          value={favFilterValue}
          size={isMobile ? "lg" : undefined}
        />
      </FilterCategory>

      <FilterCategory label="Status" icon={<TrendingUp />}>
        {ZVG_STATUSES.map((status) => (
          <StatusTriToggle
            key={status.value}
            statusValue={status.value}
            label={status.label}
            isMobile={isMobile}
          />
        ))}
      </FilterCategory>

      <FilterCategory label="Verkehrswert" icon={<Coins />}>
        <VkwFilter />
      </FilterCategory>

      <FilterCategory label="Termin" icon={<Clock />}>
        <TerminDatumPicker />
        <ToggleFilterButton
          className="w-auto md:w-full justify-between h-10 md:h-8"
          label={`Heute (${heuteLabel})`}
          value={{
            "termin@gte": heuteStart,
            "termin@lte": heuteEnd,
            "status@neq": "aufgehoben",
          }}
          size={isMobile ? "lg" : undefined}
        />
        <ToggleFilterButton
          className="w-auto md:w-full justify-between h-10 md:h-8"
          label={`Letzter Werktag (${letzterWerktagLabel})`}
          value={{
            "termin@gte": letzterWerktagStart,
            "termin@lte": letzterWerktagEnd,
            "status@neq": "aufgehoben",
          }}
          size={isMobile ? "lg" : undefined}
        />
        <ToggleFilterButton
          className="w-auto md:w-full justify-between h-10 md:h-8"
          label="Diese Woche"
          value={{
            "termin@gte": wocheStart,
            "termin@lte": wocheEnd,
            "status@neq": "aufgehoben",
          }}
          size={isMobile ? "lg" : undefined}
        />
        <ToggleFilterButton
          className="w-auto md:w-full justify-between h-10 md:h-8"
          label="Nächste 30 Tage"
          value={{ "termin@gte": nowIso, "termin@lte": in30 }}
          size={isMobile ? "lg" : undefined}
        />
        <ToggleFilterButton
          className="w-auto md:w-full justify-between h-10 md:h-8"
          label="Nächste 90 Tage"
          value={{ "termin@gte": nowIso, "termin@lte": in90 }}
          size={isMobile ? "lg" : undefined}
        />
      </FilterCategory>

      <FilterCategory label="Gutachten" icon={<FileText />}>
        <ToggleFilterButton
          className="w-auto md:w-full justify-between h-10 md:h-8"
          label="Frei verfügbar"
          value={{ gpreis_eur: 0 }}
          size={isMobile ? "lg" : undefined}
        />
      </FilterCategory>

      <FilterCategory label="Bundesland" icon={<MapPin />}>
        {[...states]
          .sort((a, b) => a.name.localeCompare(b.name, "de"))
          .filter(
            (s) =>
              (blCounts[s.id] ?? 0) > 0 || filterValues?.state_abbr === s.id,
          )
          .map((s) => {
            const n = blCounts[s.id] ?? 0;
            return (
              <ToggleFilterButton
                key={s.id}
                className="w-auto md:w-full justify-between h-10 md:h-8"
                label={
                  <span className="flex items-center justify-between w-full gap-2">
                    <span>{s.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {n}
                    </span>
                  </span>
                }
                value={{ state_abbr: s.id }}
                size={isMobile ? "lg" : undefined}
              />
            );
          })}
      </FilterCategory>
    </ResponsiveFilters>
  );
};

export default ZvgAkteList;
