import { useState } from "react";
import { useRecordContext, useUpdate, useNotify } from "ra-core";
import { Show } from "@/components/admin/show";
import {
  Copy,
  ExternalLink,
  Heart,
  MapPin,
  TreePine,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import { BAUG_STATUSES, BAUG_TRIAGE, type Baugrundstueck } from "./index";
import { useBaugFavoriten } from "./useBaugFavoriten";

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

const BilderSlider = () => {
  const r = useRecordContext<Baugrundstueck>();
  const [idx, setIdx] = useState(0);
  if (!r?.bilder_paths || r.bilder_paths.length === 0) {
    return (
      <div className="aspect-video bg-muted rounded flex items-center justify-center">
        <TreePine className="size-12 text-muted-foreground" />
      </div>
    );
  }
  const base = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/kleinanzeigen-bilder/`;
  const paths = r.bilder_paths;
  return (
    <div className="space-y-2">
      <div className="aspect-video bg-muted rounded overflow-hidden">
        <img
          src={base + paths[idx]}
          alt={`Bild ${idx + 1} von ${paths.length}`}
          className="w-full h-full object-contain"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {paths.map((p, i) => (
          <button
            key={p}
            onClick={() => setIdx(i)}
            className={`shrink-0 size-16 rounded overflow-hidden border-2 ${
              i === idx ? "border-primary" : "border-transparent"
            }`}
          >
            <img
              src={base + p}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        {paths.length} Bild{paths.length === 1 ? "" : "er"}
      </div>
    </div>
  );
};

const Anschrift = () => {
  const r = useRecordContext<Baugrundstueck>();
  const notify = useNotify();
  if (!r?.plz) return null;
  const anschrift = `${r.plz} ${r.ort}${r.ortsteil ? " · " + r.ortsteil : ""}`;
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(anschrift)}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          navigator.clipboard.writeText(anschrift);
          notify("Anschrift kopiert", { type: "success" });
        }}
      >
        <Copy className="size-3 mr-1" />
        {anschrift}
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a href={gmaps} target="_blank" rel="noopener noreferrer">
          <MapPin className="size-3 mr-1" />
          Google Maps
        </a>
      </Button>
    </div>
  );
};

const TriageBlock = () => {
  const r = useRecordContext<Baugrundstueck>();
  const [update, { isPending }] = useUpdate();
  const notify = useNotify();
  if (!r) return null;
  const set = (triage: string | null) =>
    update(
      "kleinanzeigen_grundstueck",
      { id: r.id, data: { triage }, previousData: r },
      {
        onSuccess: () => notify("Triage gesetzt", { type: "success" }),
        onError: (e: any) =>
          notify(`Fehler: ${e?.message ?? e}`, { type: "error" }),
      },
    );
  return (
    <div className="flex flex-wrap gap-2">
      {BAUG_TRIAGE.map((t) => (
        <Button
          key={t.value}
          variant={r.triage === t.value ? "default" : "outline"}
          size="sm"
          disabled={isPending}
          onClick={() => set(t.value)}
        >
          {t.label}
        </Button>
      ))}
      {r.triage && (
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => set(null)}
        >
          Zurücksetzen
        </Button>
      )}
    </div>
  );
};

const NotizBlock = () => {
  const r = useRecordContext<Baugrundstueck>();
  const [update] = useUpdate();
  const notify = useNotify();
  const [value, setValue] = useState(r?.notiz ?? "");
  if (!r) return null;
  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Notiz…"
        rows={4}
      />
      <Button
        size="sm"
        onClick={() =>
          update(
            "kleinanzeigen_grundstueck",
            { id: r.id, data: { notiz: value }, previousData: r },
            {
              onSuccess: () => notify("Notiz gespeichert", { type: "success" }),
              onError: (e: any) =>
                notify(`Fehler: ${e?.message ?? e}`, { type: "error" }),
            },
          )
        }
      >
        Notiz speichern
      </Button>
    </div>
  );
};

const FavoritButton = () => {
  const r = useRecordContext<Baugrundstueck>();
  const { isFavorit, toggle, isToggling } = useBaugFavoriten();
  if (!r) return null;
  const fav = isFavorit(r.kid);
  return (
    <Button
      variant={fav ? "default" : "outline"}
      size="sm"
      disabled={isToggling}
      onClick={() => toggle(r.kid)}
    >
      <Heart className={`size-4 mr-1 ${fav ? "fill-current" : ""}`} />
      {fav ? "Favorit" : "Als Favorit markieren"}
    </Button>
  );
};

const ShowBody = () => {
  const r = useRecordContext<Baugrundstueck>();
  if (!r) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-4">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start gap-4">
              <div>
                <CardTitle className="text-lg leading-tight">
                  {r.title}
                </CardTitle>
                {r.tags && r.tags.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {r.tags.map((t) => (
                      <Badge key={t} variant="outline">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <Badge>
                {BAUG_STATUSES.find((s) => s.value === r.status)?.label ??
                  r.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <BilderSlider />
            <Anschrift />
            <Button variant="outline" asChild>
              <a href={r.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4 mr-2" />
                Original-Inserat auf kleinanzeigen.de
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Beschreibung</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">
              {r.beschreibung ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eigenschaften</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Preis</span>
              <span className="font-medium">
                {formatEur(r.preis_eur)}
                {r.preis_vb ? " VB" : ""}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fläche</span>
              <span>{formatQm(r.flaeche_qm)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">€/m²</span>
              <span>
                {r.preis_pro_qm ? formatEur(r.preis_pro_qm) : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Grundstücksart</span>
              <span>{r.grundstuecksart ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Angebotsart</span>
              <span>{r.angebotsart ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Provision</span>
              <span>{r.provision ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Inseriert</span>
              <span>{r.inserat_erstellt ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Aufrufe</span>
              <span>{r.aufrufe ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Kleinanzeigen-ID</span>
              <span className="tabular-nums">{r.kid}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Anbieter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium text-right max-w-[60%]">
                {r.anbieter_name ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Typ</span>
              <span>
                {r.anbieter_typ === "privat"
                  ? "Privater Nutzer"
                  : r.anbieter_typ === "gewerblich"
                    ? "Gewerblicher Nutzer"
                    : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Aktiv seit</span>
              <span>
                {r.anbieter_aktiv_seit
                  ? new Date(r.anbieter_aktiv_seit).toLocaleDateString("de-DE")
                  : "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aktionen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FavoritButton />
            <div>
              <div className="text-xs text-muted-foreground mb-1">Triage</div>
              <TriageBlock />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Notiz</div>
              <NotizBlock />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const BaugrundstueckShow = () => (
  <Show>
    <ShowBody />
  </Show>
);

export default BaugrundstueckShow;
