import React from "react";
import { TreePine } from "lucide-react";
import type { RaRecord } from "ra-core";

const BaugrundstueckList = React.lazy(() => import("./BaugrundstueckList"));
const BaugrundstueckShow = React.lazy(() => import("./BaugrundstueckShow"));

export type Baugrundstueck = {
  kid: number;
  url: string;
  href: string;
  title: string;
  beschreibung?: string | null;
  preis_eur?: number | null;
  preis_vb?: boolean | null;
  flaeche_qm?: number | null;
  preis_pro_qm?: number | null;
  plz?: string | null;
  ort?: string | null;
  ortsteil?: string | null;
  state_abbr?: string | null;
  grundstuecksart?: string | null;
  angebotsart?: string | null;
  provision?: string | null;
  tags?: string[] | null;
  cover_bild_path?: string | null;
  bilder_paths?: string[] | null;
  bilder_anzahl?: number | null;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  inserat_erstellt?: string | null;
  aufrufe?: number | null;
  anbieter_name?: string | null;
  anbieter_typ?: string | null;
  anbieter_aktiv_seit?: string | null;
  hat_anschrift?: boolean | null;
  locality_full?: string | null;
  dokumente_anzahl?: number | null;
  notiz?: string | null;
  favorit?: boolean | null;
  triage?: string | null;
  triage_grund?: string | null;
  created_at: string;
  updated_at: string;
} & Pick<RaRecord, "id">;

export const BAUG_STATUSES = [
  { value: "aktiv", label: "Aktiv" },
  { value: "reserviert", label: "Reserviert" },
  { value: "verkauft", label: "Verkauft" },
  { value: "verschwunden", label: "Verschwunden" },
];

export const BAUG_TRIAGE = [
  { value: "weiterpruefen", label: "Weiterprüfen" },
  { value: "mit_reserve", label: "Mit Reserve" },
  { value: "stop", label: "Stop" },
];

export default {
  list: BaugrundstueckList,
  show: BaugrundstueckShow,
  icon: TreePine,
  recordRepresentation: (record: Baugrundstueck) =>
    record ? `${record.plz ?? ""} ${record.ort ?? ""} · ${record.title ?? ""}`.trim() : "",
};
