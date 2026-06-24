import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useListContext, Link as RaLink } from "ra-core";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "../providers/supabase/supabase";
import type { ZvgAkte } from "./index";

// Default-Marker-Icons aus dem leaflet-Package-CDN
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const formatEur = (value?: number | null): string => {
  if (value == null) return "—";
  const n = Number(value);
  if (n <= 1) return "k. A.";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
};

const FitToMarkers = ({ akten }: { akten: ZvgAkte[] }) => {
  const map = useMap();
  useEffect(() => {
    const valid = akten.filter(
      (a) => a.objekt_lat != null && a.objekt_lon != null,
    );
    if (valid.length === 0) return;
    const bounds = L.latLngBounds(
      valid.map(
        (a) => [Number(a.objekt_lat), Number(a.objekt_lon)] as [number, number],
      ),
    );
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
  }, [akten, map]);
  return null;
};

// Leaflet muss nach jeder Container-Größenänderung neu vermessen werden,
// sonst bleiben Kacheln grau / falsch positioniert.
const InvalidateOnResize = ({ height }: { height: number }) => {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
  }, [height, map]);
  return null;
};

/**
 * Map-Ansicht der ZvgAkteList — zeigt alle Akten mit Geo-Koordinaten als Marker.
 * Lädt selbständig die gefilterten Akten aus Supabase (nicht nur die 25 der List-Page),
 * damit man die räumliche Verteilung sieht.
 */
export const ZvgAkteMap = () => {
  const { filterValues } = useListContext<ZvgAkte>();
  const [akten, setAkten] = useState<ZvgAkte[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Karte füllt die Höhe vom eigenen oberen Rand bis zum unteren Viewport-Rand.
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>(700);
  useLayoutEffect(() => {
    const update = () => {
      const top = containerRef.current?.getBoundingClientRect().top ?? 0;
      setHeight(Math.max(400, window.innerHeight - top - 16));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [loading, akten.length]);

  const filterSig = useMemo(
    () => JSON.stringify(filterValues ?? {}),
    [filterValues],
  );

  // Bundesland-Umriss: nur wenn genau ein Bundesland im Filter gewählt ist.
  const selectedState =
    typeof filterValues?.state_abbr === "string"
      ? filterValues.state_abbr
      : undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stateOutline, setStateOutline] = useState<any | null>(null);
  useEffect(() => {
    if (!selectedState) {
      setStateOutline(null);
      return;
    }
    let cancelled = false;
    fetch("/geo/bundeslaender.geo.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((fc) => {
        if (cancelled || !fc?.features) return;
        const feat = fc.features.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (f: any) => f.properties?.id === `DE-${selectedState}`,
        );
        setStateOutline(feat ?? null);
      })
      .catch(() => {
        /* Umriss ist optional – Fehler ignorieren */
      });
    return () => {
      cancelled = true;
    };
  }, [selectedState]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const sb = getSupabaseClient();
    let q = sb
      .from("zvg_akte")
      .select(
        "zid, az, ag_name_raw, objektart, objekt_strasse, objekt_plz, objekt_ort, objekt_lat, objekt_lon, termin, vkw_eur, status, letzte_anfrage_status",
        { count: "exact" },
      )
      .not("objekt_lat", "is", null)
      .not("objekt_lon", "is", null)
      .gt("objekt_lat", -1)
      .limit(2000);

    // Filter aus listContext anwenden — gleiches Schema wie in ZvgAkteList
    const filters = (filterValues ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(filters)) {
      const m = key.match(/^(.+?)@(\w+)$/);
      if (m) {
        q = q.filter(m[1], m[2], value as any);
      } else if (value === null) {
        q = q.is(key, null);
      } else {
        q = q.eq(key, value as any);
      }
    }

    q.then(({ data, count }) => {
      if (cancelled) return;
      setAkten((data as unknown as ZvgAkte[]) ?? []);
      setTotal(count ?? 0);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [filterSig]);

  if (loading) {
    return (
      <div
        ref={containerRef}
        style={{ height }}
        className="flex items-center justify-center bg-muted/20 rounded-md border"
      >
        <span className="text-sm text-muted-foreground">Lade Karte …</span>
      </div>
    );
  }

  // Default-Mittelpunkt Berlin/Brandenburg
  const center: [number, number] = [52.3, 13.4];

  if (akten.length === 0) {
    return (
      <div
        ref={containerRef}
        style={{ height }}
        className="flex flex-col items-center justify-center bg-muted/20 rounded-md border gap-2"
      >
        <span className="text-sm text-muted-foreground">
          Keine Akten mit Geo-Koordinaten im aktuellen Filter
        </span>
        <span className="text-xs text-muted-foreground">
          Geocoding läuft im Hintergrund — schau in ein paar Minuten wieder
          vorbei.
        </span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="relative rounded-md border overflow-hidden"
    >
      <div className="absolute top-2 right-2 z-[400] bg-white/90 backdrop-blur-sm rounded px-2 py-1 text-xs border shadow-sm">
        {akten.length} Marker
      </div>
      <MapContainer
        center={center}
        zoom={8}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToMarkers akten={akten} />
        <InvalidateOnResize height={height} />
        {stateOutline ? (
          <GeoJSON
            key={selectedState}
            data={stateOutline}
            style={() => ({ color: "#1d4ed8", weight: 2, fill: false })}
          />
        ) : null}
        {akten.map((a) => {
          const lat = Number(a.objekt_lat);
          const lon = Number(a.objekt_lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
          return (
            <Marker key={a.zid} position={[lat, lon]} icon={defaultIcon}>
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">{a.az}</div>
                  <div className="text-muted-foreground text-xs mb-1">
                    {a.ag_name_raw}
                  </div>
                  <div className="mb-1">{a.objektart}</div>
                  <div className="text-xs text-muted-foreground mb-1">
                    {a.objekt_strasse} · {a.objekt_plz} {a.objekt_ort}
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className="text-xs">{formatDate(a.termin)}</span>
                    <span className="text-xs">{formatEur(a.vkw_eur)}</span>
                  </div>
                  <a
                    href={`#/zvg_akte/${a.zid}/show`}
                    className="text-xs underline"
                  >
                    Details öffnen →
                  </a>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};
