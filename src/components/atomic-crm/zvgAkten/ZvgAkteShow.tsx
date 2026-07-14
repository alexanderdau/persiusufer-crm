import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  useGetManyReference,
  useListContext,
  useNotify,
  useRecordContext,
} from "ra-core";
import {
  Bell,
  BellRing,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Gavel,
  Heart,
  Loader2,
  MapPin,
} from "lucide-react";

import { ReferenceField } from "@/components/admin/reference-field";
import { ReferenceManyField } from "@/components/admin/reference-many-field";
import { Show } from "@/components/admin/show";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { useFavoriten } from "./useFavoriten";

import { ZVG_STATUSES, type ZvgAkte } from "./index";
import { StatusanfrageButton } from "./StatusanfrageButton";
import { GeringstesGebotButton } from "./GeringstesGebotButton";

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL ?? "";
const BILDER_BUCKET = "zvg-bilder";

// --- Types ------------------------------------------------------------------

type Dokument = {
  id: number;
  zid: string;
  art: string;
  titel: string;
  storage_path: string;
  bucket: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  source?: string | null;
  hochgeladen_am?: string | null;
  reihenfolge?: number | null;
  notizen?: string | null;
};

const ContactNameDisplay = () => {
  const r = useRecordContext<any>();
  if (!r) return <span>—</span>;
  const anrede =
    r.gender === "female" ? "Frau" : r.gender === "male" ? "Herr" : "";
  const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
  const label = [anrede, name].filter(Boolean).join(" ") || r.title || "—";
  return (
    <span>
      {label}
      {r.title ? (
        <span className="text-xs text-muted-foreground ml-1">({r.title})</span>
      ) : null}
    </span>
  );
};

const ART_LABELS: Record<string, string> = {
  expose: "Exposé",
  anordnung: "Anordnung",
  biethinweis: "Biethinweis",
  glaeubiger: "Gläubiger",
  gutachten: "Gutachten",
  grundbuch: "Grundbuch",
  b_plan: "B-Plan",
  gma: "GMA",
  foto: "Foto",
  anwalt: "Anwalt",
  notiz: "Notiz",
  sonstiges: "Sonstiges",
};

const GLAEUBIGER_TYP_LABEL: Record<string, string> = {
  bank: "Bank",
  oeffentlich: "Öffentlich",
  weg: "WEG",
  versicherung: "Versicherung",
  anwalt: "Anwalt",
  insolvenz: "Insolvenz",
  privat: "Privat",
  unbekannt: "Unbekannt",
  sonstige: "Sonstige",
};

// --- Format helpers ---------------------------------------------------------

const formatEur = (value?: number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(Number(value));

// Wertgrenzen: 5/10 und 7/10 des Verkehrswerts (§§ 85a, 74a ZVG). Sind sie
// weggefallen (Zuschlag im 1. Termin versagt), gelten sie nicht mehr — dann
// kann auch darunter zugeschlagen werden (Chance).
const WertgrenzenAnzeige = ({
  vkw,
  weggefallen,
}: {
  vkw?: number | null;
  weggefallen?: boolean | null;
}) => {
  if (vkw == null) return <>—</>;
  const w5 = Math.round(Number(vkw) * 0.5);
  const w7 = Math.round(Number(vkw) * 0.7);
  return (
    <div className="flex flex-col gap-1">
      {weggefallen ? (
        <Badge className="self-start border-transparent bg-amber-500 text-white hover:bg-amber-500">
          weggefallen — kein Mindestgebot
        </Badge>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span
          className={weggefallen ? "text-muted-foreground line-through" : ""}
        >
          5/10 {formatEur(w5)}
        </span>
        <span
          className={weggefallen ? "text-muted-foreground line-through" : ""}
        >
          7/10 {formatEur(w7)}
        </span>
      </div>
    </div>
  );
};

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

const formatQm = (value?: number | null) =>
  value == null
    ? "—"
    : `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(
        Number(value),
      )} m²`;

const formatBytes = (n?: number | null) => {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs text-muted-foreground">{label}</span>
    <div className="text-sm">{children}</div>
  </div>
);

// --- Bilder-Slider ----------------------------------------------------------

const publicBilderUrl = (path: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/${BILDER_BUCKET}/${path}`;

const BilderSlider = ({ paths, alt }: { paths: string[]; alt: string }) => {
  const [idx, setIdx] = useState(0);
  if (!paths.length) return null;
  const total = paths.length;
  const cur = paths[idx];
  const prev = () => setIdx((i) => (i - 1 + total) % total);
  const next = () => setIdx((i) => (i + 1) % total);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative rounded-md overflow-hidden border bg-muted">
        <img
          src={publicBilderUrl(cur)}
          alt={`${alt} (${idx + 1}/${total})`}
          className="w-full h-[400px] object-contain bg-black/5"
          loading="lazy"
        />
        {total > 1 ? (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Vorheriges Bild"
              className="absolute left-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-background/80 hover:bg-background border flex items-center justify-center"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Nächstes Bild"
              className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-background/80 hover:bg-background border flex items-center justify-center"
            >
              <ChevronRight className="size-4" />
            </button>
            <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-background/80 text-xs">
              {idx + 1} / {total}
            </div>
          </>
        ) : null}
      </div>
      {total > 1 ? (
        <div className="flex flex-row gap-2 overflow-x-auto pb-1">
          {paths.map((p, i) => (
            <button
              type="button"
              key={p}
              onClick={() => setIdx(i)}
              aria-label={`Bild ${i + 1}`}
              className={`shrink-0 w-20 h-14 rounded border overflow-hidden ${
                i === idx
                  ? "ring-2 ring-primary"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              <img
                src={publicBilderUrl(p)}
                alt=""
                className="w-full h-full object-contain bg-muted"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

// --- Getypte Bild-Galerie (Fotos / Grundriss / Flurkarte …) -----------------

const publicUrlB = (bucket: string, path: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

const KIND_LABELS: Record<string, string> = {
  foto: "Foto",
  luftbild: "Luftbild",
  foto_aussen: "Außenansicht",
  foto_innen: "Innenansicht",
  grundriss: "Grundriss",
  lageplan_flurkarte: "Lageplan / Flurkarte",
  sonstiges: "Sonstiges",
};
const KIND_ORDER = [
  "foto",
  "luftbild",
  "foto_aussen",
  "foto_innen",
  "grundriss",
  "lageplan_flurkarte",
  "sonstiges",
];

type BildRow = {
  id: number | string;
  storage_path: string;
  bucket: string;
  kind: string | null;
};

// Quelle nie im Label anzeigen: entfernt einen abschließenden Zusatz
// wie " (zvg-portal)" / " (zvg.com)" aus Dokument-Titeln.
const stripSource = (t?: string | null) => {
  const s = (t ?? "").replace(/\s*\(\s*zvg[^)]*\)\s*$/i, "").trim();
  return s || (t ?? "");
};

const BildGalerie = ({
  zid,
  fallbackPaths,
  alt,
}: {
  zid: string;
  fallbackPaths: string[];
  alt: string;
}) => {
  const { data, isPending } = useGetManyReference<BildRow>("zvg_akte_bild", {
    target: "zid",
    id: zid,
    pagination: { page: 1, perPage: 100 },
    sort: { field: "image_index", order: "ASC" },
  });

  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const rows = data ?? [];
  // zvg.com-/Listing-Bilder (in bilder_paths, aber nicht in zvg_akte_bild) als
  // "foto" mit aufnehmen, damit sie identisch in Galerie + Lightbox erscheinen.
  const known = new Set(rows.map((r) => r.storage_path));
  const extra: BildRow[] = fallbackPaths
    .filter((p) => p && !known.has(p))
    .map((p, i) => ({
      id: `zvg-${i}`,
      storage_path: p,
      bucket: BILDER_BUCKET,
      kind: "foto",
    }));
  const allRows = [...extra, ...rows];

  const groups: Record<string, BildRow[]> = {};
  for (const r of allRows) {
    const k = r.kind || "sonstiges";
    (groups[k] ??= []).push(r);
  }
  const kinds = Object.keys(groups).sort(
    (a, b) =>
      (KIND_ORDER.indexOf(a) + 1 || 99) - (KIND_ORDER.indexOf(b) + 1 || 99),
  );
  // flache, sortierte Liste für die Lightbox-Navigation
  const flat = kinds.flatMap((k) => groups[k].map((r) => ({ r, kind: k })));

  useEffect(() => {
    if (openIdx == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIdx(null);
      else if (e.key === "ArrowRight" || e.key === "Tab") {
        e.preventDefault();
        setOpenIdx((i) => (i == null ? i : (i + 1) % flat.length));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setOpenIdx((i) =>
          i == null ? i : (i - 1 + flat.length) % flat.length,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIdx, flat.length]);

  if (isPending) return null;
  if (!allRows.length) return null;

  const cur = openIdx != null ? flat[openIdx] : null;
  const step = (d: number) =>
    setOpenIdx((i) => (i == null ? i : (i + d + flat.length) % flat.length));

  return (
    <div className="flex flex-col gap-3">
      {kinds.map((k) => (
        <div key={k} className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {KIND_LABELS[k] ?? k} ({groups[k].length})
          </span>
          <div className="flex flex-row gap-2 overflow-x-auto pb-1">
            {groups[k].map((r) => {
              const idx = flat.findIndex((f) => f.r.id === r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setOpenIdx(idx)}
                  title="Vergrößern"
                  className="shrink-0 h-40 w-56 flex items-center justify-center rounded-md border bg-muted/30 overflow-hidden hover:opacity-90 transition-opacity"
                >
                  {/* object-contain: volles Bild, nie beschnitten */}
                  <img
                    src={publicUrlB(r.bucket, r.storage_path)}
                    alt={alt}
                    loading="lazy"
                    className="max-h-full max-w-full object-contain"
                  />
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {cur ? (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setOpenIdx(null)}
        >
          <div className="absolute top-3 left-4 text-white/90 text-sm">
            {KIND_LABELS[cur.kind] ?? cur.kind} · {(openIdx ?? 0) + 1} /{" "}
            {flat.length}
          </div>
          <button
            type="button"
            aria-label="Schließen"
            onClick={() => setOpenIdx(null)}
            className="absolute top-2 right-4 text-white/90 hover:text-white text-3xl leading-none"
          >
            ×
          </button>
          {flat.length > 1 ? (
            <button
              type="button"
              aria-label="Zurück"
              onClick={(e) => {
                e.stopPropagation();
                step(-1);
              }}
              className="absolute left-3 top-1/2 -translate-y-1/2 size-12 rounded-full bg-white/10 hover:bg-white/25 text-white text-3xl flex items-center justify-center"
            >
              ‹
            </button>
          ) : null}
          <img
            src={publicUrlB(cur.r.bucket, cur.r.storage_path)}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-[92vw] object-contain rounded"
          />
          {flat.length > 1 ? (
            <button
              type="button"
              aria-label="Weiter"
              onClick={(e) => {
                e.stopPropagation();
                step(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 size-12 rounded-full bg-white/10 hover:bg-white/25 text-white text-3xl flex items-center justify-center"
            >
              ›
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

// --- Dokumente-Liste mit Inline-Viewer --------------------------------------

const DokumenteListe = () => {
  const { data, isPending } = useListContext<Dokument>();
  const [viewing, setViewing] = useState<Dokument | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const notify = useNotify();

  useEffect(() => {
    if (!viewing) {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    setUrlLoading(true);
    (async () => {
      try {
        const { data, error } = await getSupabaseClient()
          .storage.from(viewing.bucket || "zvg-documents")
          .createSignedUrl(viewing.storage_path, 3600);
        if (cancelled) return;
        if (error || !data?.signedUrl) throw error;
        setSignedUrl(data.signedUrl);
      } catch (e: any) {
        if (!cancelled)
          notify(`Konnte Dokument nicht laden: ${e?.message ?? e}`, {
            type: "error",
          });
      } finally {
        if (!cancelled) setUrlLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewing, notify]);

  if (isPending) {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Lade Dokumente …
      </div>
    );
  }
  if (!data?.length) {
    return (
      <div className="text-sm text-muted-foreground">Noch keine Dokumente.</div>
    );
  }

  return (
    <>
      <ul className="divide-y rounded-md border bg-card">
        {data.map((d) => (
          <li
            key={d.id}
            className="flex items-center gap-3 p-3 hover:bg-muted cursor-pointer"
            onClick={() => setViewing(d)}
          >
            <FileText className="size-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {stripSource(d.titel)}
              </div>
              <div className="text-xs text-muted-foreground flex flex-row gap-2 flex-wrap">
                <Badge variant="outline" className="font-normal h-5">
                  {ART_LABELS[d.art] ?? d.art}
                </Badge>
                {d.size_bytes ? (
                  <span>· {formatBytes(d.size_bytes)}</span>
                ) : null}
                {d.hochgeladen_am ? (
                  <span>· {formatDate(d.hochgeladen_am)}</span>
                ) : null}
              </div>
            </div>
            <Button variant="ghost" size="sm" tabIndex={-1}>
              Öffnen
            </Button>
          </li>
        ))}
      </ul>

      <Dialog
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
      >
        <DialogContent className="max-w-5xl w-[90vw] h-[85vh] flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-5" />
              {stripSource(viewing?.titel)}
              {viewing?.art ? (
                <Badge variant="outline" className="font-normal">
                  {ART_LABELS[viewing.art] ?? viewing.art}
                </Badge>
              ) : null}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 border rounded-md overflow-hidden bg-muted">
            {urlLoading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <Loader2 className="size-5 animate-spin mr-2" /> Lade …
              </div>
            ) : signedUrl ? (
              <iframe
                src={signedUrl}
                title={viewing?.titel}
                className="w-full h-full"
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                Kein Dokument geladen.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// --- Favorit-Button ---------------------------------------------------------

const FavoritButton = ({ zid }: { zid: string }) => {
  const { isFavorit, toggle, isToggling } = useFavoriten();
  const fav = isFavorit(zid);
  return (
    <Button
      variant={fav ? "default" : "outline"}
      size="sm"
      onClick={() => toggle(zid)}
      disabled={isToggling}
    >
      <Heart className={fav ? "size-4 fill-current" : "size-4"} />
      {fav ? "Favorit entfernt" : "Als Favorit merken"}
    </Button>
  );
};

// --- Notify-Button ----------------------------------------------------------

const NotifyButton = ({
  zid,
  subscribedAt,
  subscribedEmail,
  defaultEmail,
}: {
  zid: string;
  subscribedAt?: string | null;
  subscribedEmail?: string | null;
  defaultEmail: string;
}) => {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(!!subscribedAt);
  const [currentEmail, setCurrentEmail] = useState(
    subscribedEmail ?? defaultEmail,
  );
  const notify = useNotify();

  const onClick = async () => {
    setLoading(true);
    try {
      const sb = getSupabaseClient();
      const { data, error } = await sb.functions.invoke("zvg-notify", {
        body: { zid, email: defaultEmail },
      });
      if (error) throw error;
      if (data?.success) {
        setDone(true);
        setCurrentEmail(defaultEmail);
        notify(data.message ?? "Benachrichtigung angefordert.", {
          type: "success",
        });
      } else {
        notify(data?.message ?? "Fehler bei zvg.com.", { type: "error" });
      }
    } catch (e: any) {
      notify(`Konnte Benachrichtigung nicht aktivieren: ${e?.message ?? e}`, {
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <Button variant="outline" size="sm" disabled>
        <BellRing className="size-4 text-green-600" />
        Benachrichtigt ({currentEmail})
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={loading}>
      <Bell className="size-4" />
      Benachrichtigung aktivieren
    </Button>
  );
};

// --- Main view --------------------------------------------------------------

const ZvgAkteShowContent = () => {
  const record = useRecordContext<ZvgAkte>();
  if (!record) return null;

  const statusLabel =
    ZVG_STATUSES.find((s) => s.value === record.status)?.label ?? record.status;
  const zvgUrl = `https://www.zvg.com/objekt/${encodeURIComponent(record.zid)}/show`;
  const notifyDefaultEmail = record.notify_email || "anfrage@persiusufer.de";

  const allBilderPaths: string[] = useMemo(() => {
    const list: string[] = [];
    if (record.cover_bild_path) list.push(record.cover_bild_path);
    if (Array.isArray(record.bilder_paths)) {
      for (const p of record.bilder_paths) {
        if (p && p !== record.cover_bild_path) list.push(p);
      }
    }
    return list;
  }, [record.cover_bild_path, record.bilder_paths]);

  const addrSummary =
    record.objekt_anschrift ||
    [
      [record.objekt_strasse, record.objekt_hausnummer]
        .filter(Boolean)
        .join(" "),
      [record.objekt_plz, record.objekt_ort].filter(Boolean).join(" "),
      record.objekt_ortsteil,
    ]
      .filter(Boolean)
      .join(", ");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row gap-4 items-start">
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Gavel className="size-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">{record.az}</h2>
            <Badge variant="secondary">{statusLabel}</Badge>
            {record.is_teilung ? (
              <Badge variant="outline">Teilungsversteigerung</Badge>
            ) : null}
            {record.objektart ? (
              <Badge variant="outline" className="font-normal">
                {record.objektart.trim()}
              </Badge>
            ) : null}
          </div>
          {record.obj_titel ? (
            <p className="text-base text-foreground">{record.obj_titel}</p>
          ) : null}
          {addrSummary ? (
            <p className="text-sm text-muted-foreground">{addrSummary}</p>
          ) : null}
        </div>
      </div>

      <BildGalerie
        zid={record.zid}
        fallbackPaths={allBilderPaths}
        alt={record.obj_titel ?? record.az}
      />

      <div className="flex flex-row gap-2 flex-wrap">
        <Button asChild variant="outline" size="sm">
          <a href={zvgUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" />
            zvg.com
          </a>
        </Button>
        <FavoritButton zid={record.zid} />
        <NotifyButton
          zid={record.zid}
          subscribedAt={record.notify_subscribed_at}
          subscribedEmail={record.notify_email}
          defaultEmail={notifyDefaultEmail}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dokumente</CardTitle>
        </CardHeader>
        <CardContent>
          <ReferenceManyField
            reference="zvg_akte_dokumente"
            target="zid"
            sort={{ field: "reihenfolge", order: "ASC" }}
          >
            <DokumenteListe />
          </ReferenceManyField>
        </CardContent>
      </Card>

      {/* Gläubiger nur bei Forderungsversteigerungen (aus Portal-Feld bzw. Bekanntmachung extrahiert) */}
      {!record.is_teilung && (record.glaeubiger_name || record.glaeubiger) ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Gläubiger</CardTitle>
              {record.glaeubiger_typ &&
              record.glaeubiger_typ !== "unbekannt" ? (
                <Badge
                  variant={
                    record.glaeubiger_typ === "oeffentlich"
                      ? "default"
                      : "secondary"
                  }
                >
                  {GLAEUBIGER_TYP_LABEL[record.glaeubiger_typ] ??
                    record.glaeubiger_typ}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {record.glaeubiger_name ? (
              <p className="text-base font-medium">{record.glaeubiger_name}</p>
            ) : null}
            {record.glaeubiger_typ === "oeffentlich" ? (
              <p className="text-xs text-muted-foreground">
                Öffentlicher Gläubiger — erscheint erfahrungsgemäß oft nicht zum
                Termin; ein Gebot ohne Sicherheitsleistung kann dann möglich
                sein (hängt von den im Termin Anwesenden ab, keine Garantie).
              </p>
            ) : null}
            {record.glaeubiger_sachbearbeiter ||
            record.glaeubiger_telefon ||
            record.glaeubiger_az ||
            record.glaeubiger_email ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {record.glaeubiger_sachbearbeiter ? (
                  <Row label="Sachbearbeiter">
                    {record.glaeubiger_sachbearbeiter}
                  </Row>
                ) : null}
                {record.glaeubiger_telefon ? (
                  <Row label="Telefon">{record.glaeubiger_telefon}</Row>
                ) : null}
                {record.glaeubiger_az ? (
                  <Row label="Aktenzeichen">{record.glaeubiger_az}</Row>
                ) : null}
                {record.glaeubiger_email ? (
                  <Row label="E-Mail">{record.glaeubiger_email}</Row>
                ) : null}
              </div>
            ) : null}
            {record.glaeubiger ? (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">
                  Rohtext
                </summary>
                <p className="mt-1 whitespace-pre-line">{record.glaeubiger}</p>
              </details>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Objekt</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Row label="Adresse">
              <div className="flex flex-col gap-1">
                <span>{addrSummary || "—"}</span>
                {addrSummary ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrSummary)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="self-start inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs hover:bg-muted transition-colors"
                  >
                    <MapPin className="w-3 h-3" />
                    <span>Google Maps</span>
                  </a>
                ) : null}
              </div>
            </Row>

            <div className="rounded-md border bg-muted/40 p-3 flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Flurstück
              </span>
              {record.gemarkung ||
              record.flur ||
              record.flurstueck ||
              record.flurstueck_groesse_qm != null ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Row label="Gemarkung">{record.gemarkung ?? "—"}</Row>
                  <Row label="Flur">{record.flur ?? "—"}</Row>
                  <Row label="Flurstück">{record.flurstueck ?? "—"}</Row>
                  <Row label="Größe">
                    {formatQm(record.flurstueck_groesse_qm)}
                  </Row>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Noch nicht erfasst — über „Bearbeiten" eintragen.
                </span>
              )}
            </div>

            <Row label="Objektart">{record.objektart?.trim() ?? "—"}</Row>
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
            <Row label="Wertgrenzen">
              <WertgrenzenAnzeige
                vkw={record.vkw_eur}
                weggefallen={record.wertgrenzen_weggefallen}
              />
            </Row>
            <Row label="Gutachten-Preis">
              {record.gpreis_eur === 0
                ? "kostenlos"
                : formatEur(record.gpreis_eur)}
            </Row>
            <Row label="Rechtspfleger:in">
              {record.rechtspfleger_contact_id ? (
                <ReferenceField
                  source="rechtspfleger_contact_id"
                  reference="contacts"
                  link="show"
                >
                  <ContactNameDisplay />
                </ReferenceField>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Sachverständige:r">
              {record.sachverstaendiger_contact_id ? (
                <ReferenceField
                  source="sachverstaendiger_contact_id"
                  reference="contacts"
                  link="show"
                >
                  <ContactNameDisplay />
                </ReferenceField>
              ) : (
                "—"
              )}
            </Row>
            <div className="pt-2">
              <StatusanfrageButton akte={record} />
            </div>
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
            <Row label="Geringstes Gebot">
              {(() => {
                const q = record.geringstes_gebot_quelle;
                const hasResult = q && q !== "in_progress" && q !== "failed";
                if (!hasResult && q !== "failed") return "—";
                return (
                  <div className="flex flex-col gap-1">
                    {record.geringstes_gebot_eur != null ? (
                      <>
                        <span className="font-medium">
                          {formatEur(record.geringstes_gebot_eur)}
                        </span>
                        {record.geringstes_gebot_rang_betreibend ? (
                          <span className="text-xs text-muted-foreground">
                            Betrieben aus Rang{" "}
                            {record.geringstes_gebot_rang_betreibend} · Quelle:{" "}
                            {q}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Quelle: {q}
                          </span>
                        )}
                      </>
                    ) : q === "failed" ? (
                      <span className="text-sm text-red-700">
                        Haiku-Job fehlgeschlagen
                      </span>
                    ) : (
                      <span className="text-sm text-amber-700">
                        Analysiert — aber kein eindeutiger Wert ableitbar
                        {record.geringstes_gebot_rang_betreibend
                          ? ` (Rang ${record.geringstes_gebot_rang_betreibend})`
                          : ""}
                        <span className="ml-1 text-muted-foreground">
                          · Quelle: {q}
                        </span>
                      </span>
                    )}
                    {record.geringstes_gebot_warnung ? (
                      <span className="text-xs text-amber-700 whitespace-pre-line">
                        ⚠ {record.geringstes_gebot_warnung}
                      </span>
                    ) : null}
                    {record.geringstes_gebot_job_error ? (
                      <span className="text-xs text-red-700 whitespace-pre-line">
                        Fehler: {record.geringstes_gebot_job_error}
                      </span>
                    ) : null}
                    {record.geringstes_gebot_notiz ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          Begründung anzeigen
                        </summary>
                        <pre className="whitespace-pre-wrap mt-1 text-foreground/90 font-sans">
                          {record.geringstes_gebot_notiz}
                        </pre>
                      </details>
                    ) : null}
                    {record.geringstes_gebot_ermittelt_am ? (
                      <span className="text-xs text-muted-foreground">
                        Zuletzt analysiert:{" "}
                        {new Date(
                          record.geringstes_gebot_ermittelt_am,
                        ).toLocaleString("de-DE")}
                      </span>
                    ) : null}
                    {Array.isArray(record.bestehenbleibende_rechte_jsonb) &&
                    record.bestehenbleibende_rechte_jsonb.length > 0 ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          {record.bestehenbleibende_rechte_jsonb.length}{" "}
                          bestehenbleibende Rechte
                        </summary>
                        <ul className="mt-1 space-y-1 pl-4 list-disc">
                          {record.bestehenbleibende_rechte_jsonb.map(
                            (r: any, i: number) => (
                              <li key={i}>
                                Rang {r.rang ?? "?"} (Abt. {r.abteilung ?? "?"}
                                ): {r.art ?? ""}
                                {r.glaeubiger ? ` — ${r.glaeubiger}` : ""}
                                {r.valuta_eur_geschaetzt != null
                                  ? ` · ${Number(r.valuta_eur_geschaetzt).toLocaleString("de-DE")} EUR`
                                  : ""}
                                {r.bemerkung ? (
                                  <span className="text-muted-foreground">
                                    {" "}
                                    ({r.bemerkung})
                                  </span>
                                ) : null}
                              </li>
                            ),
                          )}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                );
              })()}
            </Row>
            <Row label="Triage-Notiz">
              <span className="whitespace-pre-line">
                {record.triage_note ?? "—"}
              </span>
            </Row>
            {record.status === "stop" ? (
              <Row label="Stop-Grund">{record.stop_reason ?? "—"}</Row>
            ) : null}
            <div className="pt-2">
              <GeringstesGebotButton akte={record} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tracking</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Row label="zvg.com-Aufnahmetag">
              {formatDate(record.aufnahmetag)}
            </Row>
            <Row label="Erstmals gesehen">
              {formatDateTime(record.first_seen)}
            </Row>
            <Row label="Zuletzt gesehen">
              {formatDateTime(record.last_seen)}
            </Row>
            <Row label="Benachrichtigung aktiv seit">
              {formatDateTime(record.notify_subscribed_at)}
            </Row>
            <Row label="ZID (zvg.com Objekt-Nr.)">
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
