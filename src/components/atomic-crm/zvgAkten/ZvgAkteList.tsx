import { useGetIdentity, useListContext } from "ra-core";
import { Clock, FileText, Split, TrendingUp } from "lucide-react";
import { addDays } from "date-fns";

import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";
import { ToggleFilterButton } from "@/components/admin/toggle-filter-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

import { FilterCategory } from "../filters/FilterCategory";
import { ResponsiveFilters } from "../misc/ResponsiveFilters";
import { useIsMobile } from "@/hooks/use-mobile";
import { ZVG_STATUSES, type ZvgAkte } from "./index";

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
            <DataTable.Col<ZvgAkte> source="az" label="AZ" />
            <DataTable.Col<ZvgAkte>
              source="ag_name_raw"
              label="Amtsgericht"
              render={(record) => record.ag_name_raw ?? "—"}
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

const ZvgAkteListFilter = () => {
  const isMobile = useIsMobile();
  const now = new Date();
  const in30 = addDays(now, 30).toISOString();
  const in90 = addDays(now, 90).toISOString();
  const nowIso = now.toISOString();

  return (
    <ResponsiveFilters
      searchInput={{
        placeholder: "Suche (AZ, Ort, Titel)",
      }}
    >
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

      <FilterCategory label="Art" icon={<Split />}>
        <ToggleFilterButton
          className="w-auto md:w-full justify-between h-10 md:h-8"
          label="Teilungsversteigerung"
          value={{ is_teilung: true }}
          size={isMobile ? "lg" : undefined}
        />
      </FilterCategory>
    </ResponsiveFilters>
  );
};

export default ZvgAkteList;
