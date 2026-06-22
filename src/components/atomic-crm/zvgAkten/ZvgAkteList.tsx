import { useEffect, useMemo, useState } from "react";
import { useGetIdentity, useListContext, useRecordContext } from "ra-core";
import { Clock, FileText, Heart, MapPin, TrendingUp } from "lucide-react";
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
import { states } from "../companies/states";
import { getSupabaseClient } from "../providers/supabase/supabase";

const formatEur = (value?: number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(Number(value));

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
      <Heart className={fav ? "size-4 fill-red-500 text-red-500" : "size-4 text-muted-foreground"} />
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
        <Card className="py-0">
          <DataTable<ZvgAkte> rowClick="show" bulkActionButtons={false}>
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
              source="gpreis_eur"
              label=""
              headerClassName="w-8"
              cellClassName="w-8"
              disableSort
              render={(record) => {
                if (record.gpreis_eur === 0 && record.gutachten_url) {
                  return (
                    <Badge
                      variant="outline"
                      className="bg-green-50 text-green-800 border-green-300 font-semibold px-1.5 py-0 h-5"
                      title="Kostenloses Gutachten vorhanden"
                    >
                      G
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
              source="objekt_ort"
              label="Ort"
              render={(record) =>
                record.objekt_ort ?? record.objekt_ortsteil ?? "—"
              }
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
          </DataTable>
        </Card>
      </div>
    </div>
  );
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
          Object.entries(filterValues).filter(
            ([k]) => k !== "state_abbr",
          ),
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
    ).then((entries) => {
      if (cancelled) return;
      setCounts(Object.fromEntries(entries));
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [filterSig]);

  return { counts, loading };
};

const ZvgAkteListFilter = () => {
  const isMobile = useIsMobile();
  const { favoriten } = useFavoriten();
  const favZids = Array.from(favoriten);
  // PostgREST "in"-Filter: zid in (z1,z2,...) → "zid@in": "(z1,z2,...)"
  // Wenn leer: Filter setzt impossible-value damit nichts gezeigt wird
  const favFilterValue = favZids.length > 0
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
  const heuteLabel = now.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });

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
  const letzterWerktagLabel = letzterWerktag.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });

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
          <ToggleFilterButton
            key={status.value}
            className="w-auto md:w-full justify-between h-10 md:h-8"
            label={status.label}
            value={{ status: status.value }}
            size={isMobile ? "lg" : undefined}
          />
        ))}
      </FilterCategory>

      <FilterCategory label="Termin" icon={<Clock />}>
        <ToggleFilterButton
          className="w-auto md:w-full justify-between h-10 md:h-8"
          label={`Heute (${heuteLabel})`}
          value={{ "termin@gte": heuteStart, "termin@lte": heuteEnd, "status@neq": "aufgehoben" }}
          size={isMobile ? "lg" : undefined}
        />
        <ToggleFilterButton
          className="w-auto md:w-full justify-between h-10 md:h-8"
          label={`Letzter Werktag (${letzterWerktagLabel})`}
          value={{ "termin@gte": letzterWerktagStart, "termin@lte": letzterWerktagEnd, "status@neq": "aufgehoben" }}
          size={isMobile ? "lg" : undefined}
        />
        <ToggleFilterButton
          className="w-auto md:w-full justify-between h-10 md:h-8"
          label="Diese Woche"
          value={{ "termin@gte": wocheStart, "termin@lte": wocheEnd, "status@neq": "aufgehoben" }}
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
          .sort((a, b) => (blCounts[b.id] ?? 0) - (blCounts[a.id] ?? 0))
          .filter((s) => (blCounts[s.id] ?? 0) > 0 || filterValues?.state_abbr === s.id)
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
