import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useListContext, useNotify, useRecordContext } from "ra-core";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { Heart, Loader2, Map as MapIcon, MapPin, Sparkles, TreePine } from "lucide-react";

import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";
import { ToggleFilterButton } from "@/components/admin/toggle-filter-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { FilterCategory } from "../filters/FilterCategory";
import { ResponsiveFilters } from "../misc/ResponsiveFilters";
import { useIsMobile } from "@/hooks/use-mobile";
import { BAUG_STATUSES, BAUG_TRIAGE, type Baugrundstueck } from "./index";
import { useBaugFavoriten } from "./useBaugFavoriten";
import { getSupabaseClient } from "../providers/supabase/supabase";


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

const KiCell = () => {
  const r = useRecordContext<Baugrundstueck>();
  const notify = useNotify();
  const [running, setRunning] = useState(false);
  if (!r) return null;
  const done = !!r.ki_analyse_at;
  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (running) return;
    setRunning(true);
    try {
      const { data, error } = await getSupabaseClient().functions.invoke(
        "kleinanzeigen-ki-analyse",
        { body: { kid: r.kid } },
      );
      if (error) {
        notify(`KI: ${error.message ?? error}`, { type: "error" });
      } else if ((data as any)?.error) {
        notify(`KI: ${(data as any).error}`, { type: "error" });
      } else {
        const changed = (data as any)?.changed ?? 0;
        notify(`KI: +${changed} Feld${changed === 1 ? "" : "er"}`, {
          type: "success",
        });
      }
    } catch (err: any) {
      notify(`KI-Fehler: ${err?.message ?? err}`, { type: "error" });
    } finally {
      setRunning(false);
    }
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-6 hover:bg-transparent"
      disabled={running}
      onClick={onClick}
      aria-label={done ? "KI erneut analysieren" : "KI-Analyse starten"}
      title={
        done
          ? `KI-Analyse: ${new Date(r.ki_analyse_at!).toLocaleString("de-DE")} — Klick: erneut`
          : "KI-Analyse starten"
      }
    >
      {running ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <Sparkles
          className={
            done
              ? "size-4 fill-violet-200 text-violet-600"
              : "size-4 text-muted-foreground"
          }
        />
      )}
    </Button>
  );
};

const FavoritHerz = () => {
  const r = useRecordContext<Baugrundstueck>();
  const { isFavorit, toggle, isToggling } = useBaugFavoriten();
  if (!r) return null;
  const fav = isFavorit(r.kid);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-6 hover:bg-transparent"
      disabled={isToggling}
      onClick={(e) => {
        e.stopPropagation();
        toggle(r.kid);
      }}
      aria-label={fav ? "Favorit entfernen" : "Als Favorit markieren"}
    >
      <Heart
        className={
          fav ? "size-4 fill-red-500 text-red-500" : "size-4 text-muted-foreground"
        }
      />
    </Button>
  );
};

const Thumb = () => {
  const r = useRecordContext<Baugrundstueck>();
  if (!r?.cover_bild_path) {
    return (
      <div className="size-12 bg-muted rounded flex items-center justify-center">
        <TreePine className="size-5 text-muted-foreground" />
      </div>
    );
  }
  const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/kleinanzeigen-bilder/${r.cover_bild_path}`;
  return (
    <img
      src={url}
      alt=""
      className="size-12 object-cover rounded"
      loading="lazy"
    />
  );
};

const OrtCell = () => {
  const r = useRecordContext<Baugrundstueck>();
  if (!r) return null;
  return (
    <div className="text-sm">
      <div className="text-muted-foreground">{r.plz}</div>
      <div>
        {cleanText(r.ort)}
        {r.ortsteil ? ` · ${cleanText(r.ortsteil)}` : ""}
      </div>
    </div>
  );
};

const TitelCell = () => {
  const r = useRecordContext<Baugrundstueck>();
  if (!r) return null;
  return (
    <div className="max-w-md">
      <div className="font-medium line-clamp-2 flex items-start gap-1.5">
        {r.hat_anschrift && (
          <span
            className="inline-block size-2 rounded-full bg-red-500 mt-1.5 shrink-0"
            title="Vollständige Anschrift in der Anzeige (Straße + Hausnummer im Standort)"
            aria-label="Anschrift in Anzeige"
          />
        )}
        <span>{r.title}</span>
      </div>
      <div className="flex flex-wrap gap-1 mt-1">
        {r.bauerwartungsland && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-500 text-amber-700 bg-amber-50">
            Bauerwartungsland
          </Badge>
        )}
        {r.bpl_vorhanden && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 border-blue-500 text-blue-700 bg-blue-50">
            B-Plan
          </Badge>
        )}
        {r.grz != null && (
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            GRZ {r.grz}
          </Badge>
        )}
        {r.gfz != null && (
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            GFZ {r.gfz}
          </Badge>
        )}
        {r.teilbar && (
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            teilbar
          </Badge>
        )}
        {r.paragraph_34 && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 border-purple-500 text-purple-700 bg-purple-50">
            §34 Umgebung
          </Badge>
        )}
        {r.bautraegerfrei === true && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 border-emerald-500 text-emerald-700 bg-emerald-50">
            Bauträgerfrei
          </Badge>
        )}
        {r.bautraegerfrei === false && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 border-orange-500 text-orange-700 bg-orange-50">
            BT-gebunden
          </Badge>
        )}
        {r.baubarkeit_typ?.map((t) => (
          <Badge
            key={t}
            variant="outline"
            className="text-[10px] px-1 py-0 border-slate-500 text-slate-700 bg-slate-50"
          >
            {t}
          </Badge>
        ))}
      </div>
      {r.tags && r.tags.length > 0 && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {r.tags.map((t) => (
            <Badge key={t} variant="outline" className="text-[10px] px-1 py-0">
              {t}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};

const PreisCell = () => {
  const r = useRecordContext<Baugrundstueck>();
  if (!r?.preis_eur)
    return (
      <span className="block text-right text-muted-foreground">—</span>
    );
  return (
    <span className="block text-right tabular-nums">
      {r.preis_vb ? "VB " : ""}
      {formatEur(r.preis_eur)}
    </span>
  );
};

const StatusBadge = () => {
  const r = useRecordContext<Baugrundstueck>();
  if (!r) return null;
  const variants: Record<string, string> = {
    aktiv: "bg-green-100 text-green-800",
    reserviert: "bg-yellow-100 text-yellow-800",
    verkauft: "bg-gray-100 text-gray-600",
    verschwunden: "bg-gray-100 text-gray-500",
  };
  return (
    <Badge className={variants[r.status] ?? ""}>
      {BAUG_STATUSES.find((s) => s.value === r.status)?.label ?? r.status}
    </Badge>
  );
};

const Sidebar = () => {
  const isMobile = useIsMobile();
  return (
    <ResponsiveFilters>
      <Card
        className={
          isMobile
            ? "p-4 mb-4"
            : "p-4 sticky top-4 max-w-xs flex-none overflow-y-auto"
        }
      >
        <div className="space-y-6">
          <FilterCategory icon={<Heart className="size-4" />} label="Favoriten">
            <ToggleFilterButton
              label="Nur Favoriten"
              value={{ favorit: true }}
            />
          </FilterCategory>

          <FilterCategory icon={<MapPin className="size-4" />} label="Status">
            {BAUG_STATUSES.map((s) => (
              <ToggleFilterButton
                key={s.value}
                label={s.label}
                value={{ status: s.value }}
              />
            ))}
          </FilterCategory>

          <FilterCategory icon={<Sparkles className="size-4" />} label="KI-Analyse">
            <ToggleFilterButton
              label="Bereits analysiert"
              value={{ "ki_analyse_at@not.is": null }}
            />
            <ToggleFilterButton
              label="Noch nicht analysiert"
              value={{ "ki_analyse_at@is": null }}
            />
          </FilterCategory>

          <FilterCategory icon={<TreePine className="size-4" />} label="Triage">
            {BAUG_TRIAGE.map((t) => (
              <ToggleFilterButton
                key={t.value}
                label={t.label}
                value={{ triage: t.value }}
              />
            ))}
            <ToggleFilterButton
              label="Unbearbeitet"
              value={{ "triage@is": null }}
            />
          </FilterCategory>

          <FilterCategory label="Preis">
            <ToggleFilterButton
              label="bis 100.000 €"
              value={{ "preis_eur@lte": 100000 }}
            />
            <ToggleFilterButton
              label="100.000 – 250.000 €"
              value={{ "preis_eur@gte": 100000, "preis_eur@lte": 250000 }}
            />
            <ToggleFilterButton
              label="250.000 – 500.000 €"
              value={{ "preis_eur@gte": 250000, "preis_eur@lte": 500000 }}
            />
            <ToggleFilterButton
              label="über 500.000 €"
              value={{ "preis_eur@gte": 500000 }}
            />
          </FilterCategory>

          <FilterCategory label="Fläche">
            <ToggleFilterButton
              label="bis 500 m²"
              value={{ "flaeche_qm@lte": 500 }}
            />
            <ToggleFilterButton
              label="500 – 1.000 m²"
              value={{ "flaeche_qm@gte": 500, "flaeche_qm@lte": 1000 }}
            />
            <ToggleFilterButton
              label="1.000 – 2.000 m²"
              value={{ "flaeche_qm@gte": 1000, "flaeche_qm@lte": 2000 }}
            />
            <ToggleFilterButton
              label="über 2.000 m²"
              value={{ "flaeche_qm@gte": 2000 }}
            />
          </FilterCategory>

          <FilterCategory label="Baurecht">
            <ToggleFilterButton
              label="Nur baureif"
              value={{ baureif: true }}
            />
            <ToggleFilterButton
              label="Bauerwartungsland"
              value={{ bauerwartungsland: true }}
            />
            <ToggleFilterButton
              label="Mit B-Plan"
              value={{ bpl_vorhanden: true }}
            />
            <ToggleFilterButton
              label="Teilbar"
              value={{ teilbar: true }}
            />
            <ToggleFilterButton
              label="§34 Umgebungsbebauung"
              value={{ paragraph_34: true }}
            />
            <ToggleFilterButton
              label="Bauträgerfrei"
              value={{ bautraegerfrei: true }}
            />
            <ToggleFilterButton
              label="Bauträger-gebunden"
              value={{ bautraegerfrei: false }}
            />
          </FilterCategory>

          <FilterCategory label="Anbieter">
            <ToggleFilterButton
              label="Privater Nutzer"
              value={{ anbieter_typ: "privat" }}
            />
            <ToggleFilterButton
              label="Gewerblicher Nutzer"
              value={{ anbieter_typ: "gewerblich" }}
            />
          </FilterCategory>

          <FilterCategory label="Provision">
            <ToggleFilterButton
              label="Ohne Provision"
              value={{ provision: "ohne" }}
            />
            <ToggleFilterButton
              label="Mit Provision"
              value={{ provision: "mit" }}
            />
          </FilterCategory>
        </div>
      </Card>
    </ResponsiveFilters>
  );
};

const ListSearch = () => {
  const { filterValues, setFilters, displayedFilters } = useListContext();
  // Initial-Wert aus aktuellem Filter
  const initial =
    (filterValues.kid != null ? String(filterValues.kid) : null) ??
    (filterValues["plz@like"] as string | undefined)?.replace("*", "") ??
    ((filterValues["title@ilike"] as string | undefined) ?? "").replaceAll(
      "*",
      "",
    );
  const [q, setQ] = useState(initial);

  // Debounce: 300ms nach letztem Tastendruck Filter setzen
  useEffect(() => {
    const t = setTimeout(() => {
      const v = q.trim();
      const base = { ...filterValues };
      delete (base as any)["title@ilike"];
      delete (base as any)["plz@like"];
      delete (base as any)["ort@ilike"];
      delete (base as any).kid;
      if (!v) {
        setFilters(base, displayedFilters);
        return;
      }
      // Ziffern: 1-5 = PLZ-Prefix, ab 6 = Anzeigen-ID (kid)
      if (/^\d{6,}$/.test(v)) {
        setFilters({ ...base, kid: Number(v) }, displayedFilters);
      } else if (/^\d{1,5}$/.test(v)) {
        setFilters({ ...base, "plz@like": v + "*" }, displayedFilters);
      } else {
        setFilters({ ...base, "title@ilike": `*${v}*` }, displayedFilters);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex items-center gap-2 mb-3">
      <Input
        type="search"
        placeholder="Titel, PLZ (z.B. 154) oder Anzeigen-ID (ab 6 Ziffern)…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-sm"
      />
      <Button variant="outline" size="sm" asChild>
        <Link
          to={{
            pathname: "/baugrundstuecke-statistik",
            search: window.location.hash.includes("?")
              ? "?" + window.location.hash.split("?")[1]
              : "",
          }}
        >
          <MapIcon className="size-4 mr-2" /> Karte
        </Link>
      </Button>
    </div>
  );
};

const BaugrundstueckList = () => {
  return (
    <List
      resource="kleinanzeigen_grundstueck"
      sort={{ field: "last_seen_at", order: "DESC" }}
      perPage={25}
      filterDefaultValues={{ status: "aktiv" }}
      aside={<Sidebar />}
      title="Baugrundstücke (kleinanzeigen.de)"
    >
      <ListSearch />
      <DataTable rowClick="show">
        <DataTable.Col label="" disableSort>
          <FavoritHerz />
        </DataTable.Col>
        <DataTable.Col label="" disableSort>
          <KiCell />
        </DataTable.Col>
        <DataTable.Col label="" disableSort>
          <Thumb />
        </DataTable.Col>
        <DataTable.Col source="title" label="Titel" disableSort>
          <TitelCell />
        </DataTable.Col>
        <DataTable.Col<Baugrundstueck> source="plz" label="Ort">
          <OrtCell />
        </DataTable.Col>
        <DataTable.Col<Baugrundstueck>
          source="flaeche_qm"
          label="Fläche"
          className="text-right tabular-nums"
          render={(r) => formatQm(r.flaeche_qm)}
        />
        <DataTable.Col
          source="preis_eur"
          label="Preis"
          className="text-right tabular-nums"
        >
          <PreisCell />
        </DataTable.Col>
        <DataTable.Col<Baugrundstueck>
          source="preis_pro_qm"
          label="€/m²"
          className="text-right tabular-nums"
          render={(r) => (r.preis_pro_qm ? formatEur(r.preis_pro_qm) : "—")}
        />
        <DataTable.Col<Baugrundstueck>
          source="aufrufe"
          label="Aufrufe"
          className="text-right tabular-nums"
          render={(r) =>
            r.aufrufe != null
              ? new Intl.NumberFormat("de-DE").format(r.aufrufe)
              : "—"
          }
        />
        <DataTable.Col<Baugrundstueck>
          source="last_seen_at"
          label="Gesehen"
          render={(r) => formatDate(r.last_seen_at)}
        />
        <DataTable.Col label="Status" disableSort>
          <StatusBadge />
        </DataTable.Col>
      </DataTable>
    </List>
  );
};

export default BaugrundstueckList;
