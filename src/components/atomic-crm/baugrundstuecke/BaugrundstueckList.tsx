import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useListContext, useRecordContext } from "ra-core";
import { Heart, Map as MapIcon, MapPin, TreePine } from "lucide-react";

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
              value={{ provision: "Keine zusätzliche Käuferprovision" }}
            />
            <ToggleFilterButton
              label="Mit Provision"
              value={{ provision: "Mit Provision" }}
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
      if (!v) {
        setFilters(base, displayedFilters);
        return;
      }
      if (/^\d{1,5}$/.test(v)) {
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
        placeholder="Titel, Ort oder PLZ (z.B. 154 für PLZ-Prefix)…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-sm"
      />
      <Button variant="outline" size="sm" asChild>
        <Link
          to={{
            pathname: "/kleinanzeigen_grundstueck/statistik",
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
