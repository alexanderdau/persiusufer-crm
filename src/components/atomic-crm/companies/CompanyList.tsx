import { useGetIdentity, useListContext, useStore, useTranslate } from "ra-core";
import { LayoutGrid, List as ListIcon } from "lucide-react";

import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { ExportButton } from "@/components/admin/export-button";
import { List } from "@/components/admin/list";
import { ListPagination } from "@/components/admin/list-pagination";
import { SortButton } from "@/components/admin/sort-button";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { TopToolbar } from "../layout/TopToolbar";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company } from "../types";
import { CompanyEmpty } from "./CompanyEmpty";
import { CompanyListFilter } from "./CompanyListFilter";
import { ImageList } from "./GridList";
import { states } from "./states";

const VIEW_STORE_KEY = "companies.viewMode";

type ViewMode = "cards" | "list";

export const CompanyList = () => {
  const { identity } = useGetIdentity();
  if (!identity) return null;
  return (
    <List
      title={false}
      perPage={25}
      sort={{ field: "name", order: "ASC" }}
      actions={<CompanyListActions />}
      pagination={<ListPagination rowsPerPageOptions={[10, 25, 50, 100]} />}
    >
      <CompanyListLayout />
    </List>
  );
};

const CompanyListLayout = () => {
  const { data, isPending, filterValues } = useListContext();
  const [viewMode] = useStore<ViewMode>(VIEW_STORE_KEY, "cards");
  const hasFilters = filterValues && Object.keys(filterValues).length > 0;

  if (isPending) return null;
  if (!data?.length && !hasFilters) return <CompanyEmpty />;

  return (
    <div className="w-full flex flex-row gap-8">
      <CompanyListFilter />
      <div className="flex flex-col flex-1 gap-4">
        {viewMode === "list" ? <CompanyDataTable /> : <ImageList />}
      </div>
    </div>
  );
};

const CompanyDataTable = () => {
  const { companySectors } = useConfigurationContext();
  return (
    <Card className="py-0">
      <DataTable<Company> rowClick="show" bulkActionButtons={false}>
        <DataTable.Col<Company> source="name" label="Name" />
        <DataTable.Col<Company>
          source="sector"
          label="Branche"
          render={(record) =>
            companySectors.find((s) => s.value === record.sector)?.label ??
            record.sector ??
            "—"
          }
        />
        <DataTable.Col<Company>
          source="state_abbr"
          label="Bundesland"
          render={(record) =>
            states.find((s) => s.id === record.state_abbr)?.name ??
            record.state_abbr ??
            "—"
          }
        />
        <DataTable.Col<Company> source="city" label="Stadt" />
        <DataTable.Col<Company>
          source="nb_contacts"
          label="Kontakte"
          render={(record) => (
            <span className="tabular-nums">{record.nb_contacts ?? 0}</span>
          )}
        />
        <DataTable.Col<Company>
          source="nb_deals"
          label="Deals"
          render={(record) => (
            <span className="tabular-nums">{record.nb_deals ?? 0}</span>
          )}
        />
      </DataTable>
    </Card>
  );
};

const CompanyListActions = () => {
  const translate = useTranslate();
  const [viewMode, setViewMode] = useStore<ViewMode>(VIEW_STORE_KEY, "cards");
  return (
    <TopToolbar>
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(value) => {
          if (value === "cards" || value === "list") setViewMode(value);
        }}
        variant="outline"
        size="sm"
        aria-label="Ansicht"
      >
        <ToggleGroupItem value="cards" aria-label="Kachelansicht">
          <LayoutGrid className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="list" aria-label="Listenansicht">
          <ListIcon className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>
      <SortButton fields={["name", "created_at", "nb_contacts"]} />
      <ExportButton />
      <CreateButton
        label={translate("resources.companies.action.new", {
          _: "New Company",
        })}
      />
    </TopToolbar>
  );
};
