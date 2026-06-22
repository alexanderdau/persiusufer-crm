import { useWatch } from "react-hook-form";
import { useRecordContext } from "ra-core";

import { Edit } from "@/components/admin/edit";
import { NumberInput } from "@/components/admin/number-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { SimpleForm } from "@/components/admin/simple-form";
import { TextInput } from "@/components/admin/text-input";
import { Card, CardContent } from "@/components/ui/card";

import { ZVG_STATUSES, type ZvgAkte } from "./index";

const ReadOnlyInfo = () => {
  const record = useRecordContext<ZvgAkte>();
  if (!record) return null;

  const fmtEur = (v?: number | null) =>
    v == null
      ? "—"
      : new Intl.NumberFormat("de-DE", {
          style: "currency",
          currency: "EUR",
          maximumFractionDigits: 0,
        }).format(Number(v));
  const fmtDate = (v?: string | null) => {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("de-DE");
  };

  return (
    <Card className="w-full">
      <CardContent className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">AZ</div>
          <div>{record.az}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Amtsgericht</div>
          <div>{record.ag_name_raw ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Termin</div>
          <div>{fmtDate(record.termin)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Verkehrswert</div>
          <div>{fmtEur(record.vkw_eur)}</div>
        </div>
        <div className="col-span-2">
          <div className="text-xs text-muted-foreground">Objekt</div>
          <div>{record.obj_titel ?? "—"}</div>
        </div>
      </CardContent>
    </Card>
  );
};

const ConditionalStopReason = () => {
  const status = useWatch({ name: "status" });
  if (status !== "stop") return null;
  return (
    <TextInput
      source="stop_reason"
      label="Stop-Grund"
      multiline
      rows={2}
      helperText={false}
    />
  );
};

const AgFilteredRechtspflegerInput = () => {
  const record = useRecordContext<ZvgAkte>();
  return (
    <ReferenceInput
      source="rechtspfleger_contact_id"
      reference="contacts"
      filter={
        record?.ag_company_id ? { company_id: record.ag_company_id } : {}
      }
    />
  );
};

const SachverstaendigerInput = () => (
  <ReferenceInput
    source="sachverstaendiger_contact_id"
    reference="contacts"
  />
);

const ZvgAkteEdit = () => (
  <Edit redirect="show">
    <SimpleForm className="max-w-2xl">
      <ReadOnlyInfo />
      <SelectInput
        source="status"
        label="Status"
        choices={ZVG_STATUSES}
        optionText="label"
        optionValue="value"
        helperText={false}
      />
      <TextInput
        source="triage_note"
        label="Triage-Notiz"
        multiline
        rows={4}
        helperText={false}
      />
      <ConditionalStopReason />
      <NumberInput
        source="bietreichweite_eur"
        label="Bietreichweite (EUR)"
        helperText={false}
      />
      <NumberInput
        source="geringstes_gebot_eur"
        label="Geringstes Gebot (EUR)"
        helperText="Summe der vorgehenden Rechte/Lasten + Verfahrenskosten (§ 44 ZVG)"
      />
      <NumberInput
        source="geringstes_gebot_rang_betreibend"
        label="Betrieben aus Rang"
        helperText="1 = höchster (idR nur öffentliche Lasten gehen vor) · 2+ = Abt-III-Vorränge zu berücksichtigen"
        min={1}
        max={20}
      />
      <TextInput
        source="geringstes_gebot_warnung"
        label="Warnhinweis (z. B. unklare Vorränge)"
        helperText={false}
      />
      <TextInput
        source="geringstes_gebot_notiz"
        label="Begründung / Quelle"
        multiline
        rows={3}
        helperText={false}
      />
      <AgFilteredRechtspflegerInput />
      <SachverstaendigerInput />
    </SimpleForm>
  </Edit>
);

export default ZvgAkteEdit;
