import React from "react";
import { Gavel } from "lucide-react";
import type { Identifier, RaRecord } from "ra-core";

const ZvgAkteList = React.lazy(() => import("./ZvgAkteList"));
const ZvgAkteShow = React.lazy(() => import("./ZvgAkteShow"));
const ZvgAkteEdit = React.lazy(() => import("./ZvgAkteEdit"));

export type ZvgAkte = {
  zid: string;
  az: string;
  az_jahr?: number | null;
  art?: string | null;
  is_teilung?: boolean | null;
  glaeubiger?: string | null;
  glaeubiger_name?: string | null;
  glaeubiger_typ?: string | null;
  glaeubiger_sachbearbeiter?: string | null;
  glaeubiger_telefon?: string | null;
  glaeubiger_az?: string | null;
  glaeubiger_email?: string | null;
  ag_company_id?: Identifier | null;
  ag_name_raw?: string | null;
  termin?: string | null;
  termin_jahr?: number | null;
  vkw_eur?: number | null;
  gpreis_eur?: number | null;
  gutachten_url?: string | null;
  obj_titel?: string | null;
  obj_beschreibung?: string | null;
  objekt_strasse?: string | null;
  objekt_hausnummer?: string | null;
  objekt_plz?: string | null;
  objekt_ort?: string | null;
  objekt_ortsteil?: string | null;
  gemarkung?: string | null;
  flur?: string | null;
  flurstueck?: string | null;
  flurstueck_groesse_qm?: number | null;
  objektart?: string | null;
  status: string;
  triage_note?: string | null;
  stop_reason?: string | null;
  bietreichweite_eur?: number | null;
  geringstes_gebot_eur?: number | null;
  geringstes_gebot_rang_betreibend?: number | null;
  geringstes_gebot_quelle?: string | null;
  geringstes_gebot_notiz?: string | null;
  geringstes_gebot_warnung?: string | null;
  bestehenbleibende_rechte_jsonb?: any;
  geringstes_gebot_ermittelt_am?: string | null;
  geringstes_gebot_modell?: string | null;
  geringstes_gebot_job_started_at?: string | null;
  geringstes_gebot_job_error?: string | null;
  rechtspfleger_contact_id?: Identifier | null;
  sachverstaendiger_contact_id?: Identifier | null;
  deal_id?: Identifier | null;
  first_seen: string;
  last_seen: string;
  created_at: string;
  updated_at: string;
  raw_json?: Record<string, any> | null;
  detail_json?: Record<string, any> | null;
  objekt_anschrift?: string | null;
  aufnahmetag?: string | null;
  expose_path?: string | null;
  anordnung_path?: string | null;
  biethinweis_path?: string | null;
  glaeubiger_path?: string | null;
  cover_bild_path?: string | null;
  bilder_paths?: string[] | null;
  notify_subscribed_at?: string | null;
  notify_email?: string | null;
  letzte_anfrage_id?: number | null;
  letzte_anfrage_status?: string | null;
  letzte_anfrage_am?: string | null;
  letzte_anfrage_option?: number | null;
  vkw_unbekannt?: boolean | null;
  hat_gutachten_lokal?: boolean | null;
  hat_expose_lokal?: boolean | null;
  dokumente_count?: number | null;
  fotos_count?: number | null;
  geocoding_precision?: string | null;
} & Pick<RaRecord, "id">;

export const ZVG_STATUSES = [
  { value: "neu", label: "Neu" },
  { value: "vergangen", label: "Vergangen" },
  { value: "triagiert", label: "Triagiert" },
  { value: "phase1", label: "Phase 1 (Triage)" },
  { value: "phase2", label: "Phase 2 (Standortdossier)" },
  { value: "phase3a", label: "Phase 3a (Pre-Bid)" },
  { value: "phase3b", label: "Phase 3b (Post-Zuschlag)" },
  { value: "phase4", label: "Phase 4 (Erwartungswert)" },
  { value: "phase5", label: "Phase 5 (Spielplan)" },
  { value: "phase6", label: "Phase 6 (Verwertung)" },
  { value: "stop", label: "Stop" },
  { value: "aufgehoben", label: "Aufgehoben" },
  { value: "ersteigert", label: "Ersteigert" },
  { value: "verloren", label: "Verloren" },
];

export default {
  list: ZvgAkteList,
  show: ZvgAkteShow,
  edit: ZvgAkteEdit,
  icon: Gavel,
  recordRepresentation: (record: ZvgAkte) =>
    record
      ? `${record.az} · ${
          record.obj_titel ||
          [record.objektart, record.objekt_ort].filter(Boolean).join(", ") ||
          ""
        }`.trim()
      : "",
};
