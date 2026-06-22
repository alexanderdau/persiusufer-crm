import { useRecordContext } from "ra-core";
import { Clock, FileText, Mail, MailCheck, MailX } from "lucide-react";

import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";
import { ToggleFilterButton } from "@/components/admin/toggle-filter-button";
import { Badge } from "@/components/ui/badge";
import { ReferenceField } from "@/components/admin/reference-field";

import { FilterCategory } from "../filters/FilterCategory";
import { ResponsiveFilters } from "../misc/ResponsiveFilters";
import { useIsMobile } from "@/hooks/use-mobile";

import {
  type ZvgAnfrage,
  ZVG_ANFRAGE_STATI,
  ZVG_ANFRAGE_OPTIONEN,
} from "./index";

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const StatusBadge = () => {
  const r = useRecordContext<ZvgAnfrage>();
  if (!r) return null;
  const variant: Record<ZvgAnfrage["status"], "default" | "secondary" | "outline" | "destructive"> = {
    entwurf: "outline",
    gesendet: "default",
    beantwortet: "secondary",
    verworfen: "destructive",
  };
  return <Badge variant={variant[r.status]}>{r.status}</Badge>;
};

const AntwortInfo = () => {
  const r = useRecordContext<ZvgAnfrage>();
  if (!r) return null;
  if (!r.antwort_option) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="text-sm">
      <span className="font-mono">{r.antwort_option}</span>{" "}
      {ZVG_ANFRAGE_OPTIONEN[r.antwort_option] ?? ""}
    </span>
  );
};

const AnfrageFilters = () => {
  const isMobile = useIsMobile();
  return (
    <ResponsiveFilters searchInput={{ placeholder: "Suche (AZ, E-Mail)" }}>
      <FilterCategory label="Status" icon={<Mail />}>
        {ZVG_ANFRAGE_STATI.map((st) => (
          <ToggleFilterButton
            key={st.value}
            className="w-auto md:w-full justify-between h-10 md:h-8"
            label={st.label}
            value={{ status: st.value }}
            size={isMobile ? "lg" : undefined}
          />
        ))}
      </FilterCategory>
      <FilterCategory label="Antwortstatus" icon={<MailCheck />}>
        <ToggleFilterButton
          className="w-auto md:w-full justify-between h-10 md:h-8"
          label="Offen (ohne Antwort)"
          value={{ "antwort_eingegangen_am@is": null }}
          size={isMobile ? "lg" : undefined}
        />
        <ToggleFilterButton
          className="w-auto md:w-full justify-between h-10 md:h-8"
          label="Mit Antwort"
          value={{ "antwort_eingegangen_am@not.is": null }}
          size={isMobile ? "lg" : undefined}
        />
      </FilterCategory>
      <FilterCategory label="Re-Anfrage" icon={<MailX />}>
        <ToggleFilterButton
          className="w-auto md:w-full justify-between h-10 md:h-8"
          label="Re-Anfrage heute fällig"
          value={{ "re_anfrage_faellig_am@lte": new Date().toISOString().slice(0, 10) }}
          size={isMobile ? "lg" : undefined}
        />
      </FilterCategory>
    </ResponsiveFilters>
  );
};

const ZvgAnfrageList = () => {
  return (
    <List
      title="Statusanfragen"
      perPage={25}
      sort={{ field: "gesendet_am", order: "DESC" }}
      filters={<AnfrageFilters />}
      exporter={false}
    >
      <DataTable rowClick="show">
        <DataTable.Col source="status" label="Status" render={() => <StatusBadge />} />
        <DataTable.Col
          source="zid"
          label="Akte"
          render={(r) => (
            <ReferenceField source="zid" reference="zvg_akte" link="show">
              <span className="font-mono text-xs">{r.zid}</span>
            </ReferenceField>
          )}
        />
        <DataTable.Col
          source="ag_company_id"
          label="AG"
          render={(r) =>
            r.ag_company_id ? (
              <ReferenceField source="ag_company_id" reference="companies" link="show" />
            ) : (
              "—"
            )
          }
        />
        <DataTable.Col source="gesendet_am" label="Gesendet" render={(r) => formatDate(r.gesendet_am)} />
        <DataTable.Col source="antwort_eingegangen_am" label="Antwort" render={(r) => formatDate(r.antwort_eingegangen_am)} />
        <DataTable.Col source="antwort_option" label="Option" render={() => <AntwortInfo />} />
        <DataTable.Col
          source="re_anfrage_faellig_am"
          label="Re-Anfrage fällig"
          render={(r) => formatDate(r.re_anfrage_faellig_am)}
        />
      </DataTable>
    </List>
  );
};

export default ZvgAnfrageList;
