import type { ReactNode } from "react";
import { useRecordContext } from "ra-core";
import { ExternalLink, FileText, Gavel } from "lucide-react";

import { ReferenceField } from "@/components/admin/reference-field";
import { Show } from "@/components/admin/show";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { ZVG_STATUSES, type ZvgAkte } from "./index";

const formatEur = (value?: number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(Number(value));

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const Row = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs text-muted-foreground">{label}</span>
    <div className="text-sm">{children}</div>
  </div>
);

const ZvgAkteShowContent = () => {
  const record = useRecordContext<ZvgAkte>();
  if (!record) return null;

  const statusLabel =
    ZVG_STATUSES.find((s) => s.value === record.status)?.label ?? record.status;

  const zvgUrl = `https://www.zvg.com/objekt/${encodeURIComponent(
    record.zid,
  )}/show`;
  const gutachtenUrl = record.gutachten_url
    ? `https://www.zvg.com${record.gutachten_url}`
    : null;

  const rawImg = (record.raw_json as any)?.img as string | undefined;
  const imgUrl = rawImg ? `https://www.zvg.com${rawImg}` : null;

  const addrParts = [
    [record.objekt_strasse, record.objekt_hausnummer]
      .filter(Boolean)
      .join(" "),
    [record.objekt_plz, record.objekt_ort].filter(Boolean).join(" "),
    record.objekt_ortsteil,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row gap-4 items-start">
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Gavel className="size-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">{record.az}</h2>
            <Badge variant="secondary">{statusLabel}</Badge>
            {record.is_teilung ? (
              <Badge variant="outline">Teilungsversteigerung</Badge>
            ) : null}
          </div>
          {record.obj_titel ? (
            <p className="text-base text-foreground">{record.obj_titel}</p>
          ) : null}
        </div>
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={record.obj_titel ?? record.az}
            className="w-48 h-32 object-cover rounded-md border"
          />
        ) : null}
      </div>

      <div className="flex flex-row gap-2 flex-wrap">
        <Button asChild variant="outline" size="sm">
          <a href={zvgUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" />
            zvg.com
          </a>
        </Button>
        {gutachtenUrl ? (
          <Button asChild variant="outline" size="sm">
            <a href={gutachtenUrl} target="_blank" rel="noopener noreferrer">
              <FileText className="size-4" />
              Gutachten
              {record.gpreis_eur === 0 ? " (kostenlos)" : null}
            </a>
          </Button>
        ) : null}
      </div>

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Objekt</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Row label="Adresse">
              {addrParts.length ? (
                <div className="whitespace-pre-line">
                  {addrParts.join("\n")}
                </div>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Objektart">{record.objektart ?? "—"}</Row>
            <Row label="Art">{record.art ?? "—"}</Row>
            <Row label="Beschreibung">
              <span className="whitespace-pre-line">
                {record.obj_beschreibung ?? "—"}
              </span>
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verfahren</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Row label="Aktenzeichen">{record.az}</Row>
            <Row label="Amtsgericht">
              {record.ag_company_id ? (
                <ReferenceField
                  source="ag_company_id"
                  reference="companies"
                  link="show"
                />
              ) : (
                (record.ag_name_raw ?? "—")
              )}
            </Row>
            <Row label="Termin">{formatDateTime(record.termin)}</Row>
            <Row label="Verkehrswert">{formatEur(record.vkw_eur)}</Row>
            <Row label="Gutachten-Preis">
              {record.gpreis_eur === 0
                ? "kostenlos"
                : formatEur(record.gpreis_eur)}
            </Row>
            <Row label="Rechtspfleger">
              {record.rechtspfleger_contact_id ? (
                <ReferenceField
                  source="rechtspfleger_contact_id"
                  reference="contacts"
                  link="show"
                />
              ) : (
                "—"
              )}
            </Row>
            <Row label="Sachverständiger">
              {record.sachverstaendiger_contact_id ? (
                <ReferenceField
                  source="sachverstaendiger_contact_id"
                  reference="contacts"
                  link="show"
                />
              ) : (
                "—"
              )}
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bewertung</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Row label="Status">{statusLabel}</Row>
            <Row label="Bietreichweite">
              {formatEur(record.bietreichweite_eur)}
            </Row>
            <Row label="Triage-Notiz">
              <span className="whitespace-pre-line">
                {record.triage_note ?? "—"}
              </span>
            </Row>
            {record.status === "stop" ? (
              <Row label="Stop-Grund">{record.stop_reason ?? "—"}</Row>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tracking</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Row label="Erstmals gesehen">{formatDateTime(record.first_seen)}</Row>
            <Row label="Zuletzt gesehen">{formatDateTime(record.last_seen)}</Row>
            <Row label="Angelegt am">{formatDateTime(record.created_at)}</Row>
            <Row label="Aktualisiert am">
              {formatDateTime(record.updated_at)}
            </Row>
            <Row label="ZID">
              <code className="text-xs">{record.zid}</code>
            </Row>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const ZvgAkteShow = () => (
  <Show>
    <ZvgAkteShowContent />
  </Show>
);

export default ZvgAkteShow;
