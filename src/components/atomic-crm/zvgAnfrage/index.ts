import React from "react";
import { Mail } from "lucide-react";
import type { ResourceProps } from "ra-core";

const ZvgAnfrageList = React.lazy(() => import("./ZvgAnfrageList"));

export type ZvgAnfrage = {
  id: number;
  zid: string;
  ag_company_id: number | null;
  rechtspfleger_contact_id: number | null;
  anrede: string | null;
  gesendet_am: string | null;
  gesendet_an_email: string | null;
  gesendet_per: string;
  anlass: string | null;
  status: "entwurf" | "gesendet" | "beantwortet" | "verworfen";
  antwort_eingegangen_am: string | null;
  antwort_option: number | null;
  antwort_neuer_termin: string | null;
  antwort_neuer_termin_saal: string | null;
  antwort_zuschlag_im_termin: boolean | null;
  antwort_zuschlag_versagt: boolean | null;
  antwort_verfahren_eingestellt: boolean | null;
  antwort_verteilungstermin: string | null;
  antwort_freitext: string | null;
  re_anfrage_faellig_am: string | null;
  created_at: string;
  updated_at: string;
};

const zvgAnfrage: ResourceProps = {
  name: "zvg_anfrage",
  list: ZvgAnfrageList,
  icon: Mail,
  recordRepresentation: (r: ZvgAnfrage) =>
    `Anfrage ${r.zid}${r.status ? ` (${r.status})` : ""}`,
};

export const ZVG_ANFRAGE_STATI = [
  { value: "entwurf", label: "Entwurf" },
  { value: "gesendet", label: "Gesendet" },
  { value: "beantwortet", label: "Beantwortet" },
  { value: "verworfen", label: "Verworfen" },
] as const;

export const ZVG_ANFRAGE_OPTIONEN: Record<number, string> = {
  1: "Versteigerungstermin steht aus",
  2: "Zuschlag im Termin verkündet",
  3: "Verkündungstermin angesetzt",
  4: "Zuschlag versagt",
  5: "Verfahren aufgehoben",
  6: "Verteilungstermin angesetzt",
  7: "Sonstiger Stand",
};

export default zvgAnfrage;
