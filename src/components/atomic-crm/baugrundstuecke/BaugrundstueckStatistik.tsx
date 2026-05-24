import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { MapContainer, TileLayer, GeoJSON, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseClient } from "../providers/supabase/supabase";

type Aggregate = { plz: string; count: number; sumFlaeche: number; pricesPerSqm: number[] };

const formatEur = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(v);

// Choropleth-Farbe nach count
const colorFor = (n: number) => {
  if (n === 0) return "#f3f4f6";
  if (n <= 2) return "#fef3c7";
  if (n <= 5) return "#fcd34d";
  if (n <= 10) return "#f59e0b";
  if (n <= 20) return "#dc2626";
  return "#7f1d1d";
};

const BaugrundstueckStatistik = () => {
  const [params] = useSearchParams();
  const [geo, setGeo] = useState<any>(null);
  const [agg, setAgg] = useState<Record<string, Aggregate>>({});
  const [loading, setLoading] = useState(true);
  // Default-Filter: kleine Garten-Parzellen ausschließen (verzerren €/m²)
  const [minFlaeche, setMinFlaeche] = useState<number>(300);

  // Filter aus URL übernehmen (gleiche Keys wie List)
  const dbFilter = useMemo(() => {
    const f: Record<string, any> = {};
    // Status default = aktiv (wie List)
    const s = params.get("status") ?? "aktiv";
    if (s) f.status = s;
    // optionale Filter, die List setzen kann
    for (const key of [
      "favorit",
      "triage",
      "provision",
      "anbieter_typ",
      "plz@like",
      "preis_eur@gte",
      "preis_eur@lte",
      "flaeche_qm@gte",
      "flaeche_qm@lte",
    ]) {
      const v = params.get(key);
      if (v != null && v !== "") f[key] = v;
    }
    return f;
  }, [params]);

  // PLZ-GeoJSON einmalig laden
  useEffect(() => {
    fetch("/data/plz-brandenburg.geojson")
      .then((r) => r.json())
      .then((g) => setGeo(g))
      .catch((e) => console.error("plz-geojson load fail", e));
  }, []);

  // Aktuell selektierte Inserate aggregieren
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const sb = getSupabaseClient();
      let q = sb
        .from("kleinanzeigen_grundstueck")
        .select("plz, preis_eur, flaeche_qm, bauerwartungsland")
        .not("plz", "is", null)
        // Bauerwartungsland zählt nicht in den €/m²-Median (kein baureifes Land)
        .or("bauerwartungsland.is.null,bauerwartungsland.eq.false")
        .limit(5000);
      for (const [k, v] of Object.entries(dbFilter)) {
        if (k.includes("@gte")) q = q.gte(k.split("@")[0], v as any);
        else if (k.includes("@lte")) q = q.lte(k.split("@")[0], v as any);
        else if (k.includes("@like")) q = q.like(k.split("@")[0], String(v).replace(/\*/g, "%"));
        else q = q.eq(k, v as any);
      }
      const { data, error } = await q;
      if (cancelled) return;
      if (error || !data) {
        console.error(error);
        setLoading(false);
        return;
      }
      const map: Record<string, Aggregate> = {};
      for (const r of data as any[]) {
        const plz = r.plz as string;
        if (!plz) continue;
        const preis = Number(r.preis_eur);
        const flaeche = Number(r.flaeche_qm);
        // Default-Filter: nur Inserate ab Mindestfläche
        if (minFlaeche > 0 && (!flaeche || flaeche < minFlaeche)) continue;
        if (!map[plz])
          map[plz] = { plz, count: 0, sumFlaeche: 0, pricesPerSqm: [] };
        map[plz].count++;
        if (flaeche > 0) map[plz].sumFlaeche += flaeche;
        if (preis > 0 && flaeche > 0)
          map[plz].pricesPerSqm.push(preis / flaeche);
      }
      setAgg(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [dbFilter, minFlaeche]);

  const totals = useMemo(() => {
    const list = Object.values(agg);
    return {
      anzahl_plz: list.length,
      anzahl_inserate: list.reduce((s, x) => s + x.count, 0),
      max_pro_plz: list.reduce((s, x) => Math.max(s, x.count), 0),
    };
  }, [agg]);

  const styleFn = (feat: any) => {
    const plz = feat?.properties?.plz;
    const n = agg[plz]?.count ?? 0;
    return {
      fillColor: colorFor(n),
      weight: 0.6,
      opacity: 1,
      color: "#374151",
      fillOpacity: n > 0 ? 0.7 : 0.15,
    };
  };

  const onEachFeature = (feat: any, layer: any) => {
    const plz = feat?.properties?.plz;
    const note = feat?.properties?.note;
    const a = agg[plz];
    const lines: string[] = [`<strong>${plz}</strong> ${note ?? ""}`];
    if (a) {
      lines.push(`Inserate: ${a.count}`);
      if (a.pricesPerSqm.length > 0) {
        const sorted = [...a.pricesPerSqm].sort((x, y) => x - y);
        const n = sorted.length;
        const quantile = (q: number) => {
          const pos = (n - 1) * q;
          const lo = Math.floor(pos);
          const hi = Math.ceil(pos);
          if (lo === hi) return sorted[lo];
          return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
        };
        const median = quantile(0.5);
        const q1 = quantile(0.25);
        const q3 = quantile(0.75);
        const min = sorted[0];
        const max = sorted[n - 1];
        lines.push(`Median ${formatEur(median)} / m²`);
        if (n >= 4) {
          lines.push(
            `Q1–Q3: ${formatEur(q1)} – ${formatEur(q3)} / m²`,
          );
        }
        if (n >= 2) {
          lines.push(`Spanne: ${formatEur(min)} – ${formatEur(max)} / m²`);
        }
        if (a.sumFlaeche > 0) {
          lines.push(
            `Σ Fläche: ${new Intl.NumberFormat("de-DE").format(Math.round(a.sumFlaeche))} m²`,
          );
        }
      }
    } else {
      lines.push(`Keine Inserate`);
    }
    layer.bindTooltip(lines.join("<br/>"), { sticky: true });
    layer.on("click", () => {
      // Zur Liste mit PLZ-Filter
      const url = `/kleinanzeigen_grundstueck?filter=${encodeURIComponent(
        JSON.stringify({ status: dbFilter.status ?? "aktiv", "plz@like": `${plz}*` }),
      )}`;
      window.location.hash = url;
    });
  };

  // Karten-Bounds fix Brandenburg
  const center: [number, number] = [52.4, 13.4];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">
            Baugrundstücke — Statistik nach PLZ
          </h1>
          <p className="text-sm text-muted-foreground">
            {totals.anzahl_inserate} Inserate in {totals.anzahl_plz} PLZ-Gebieten
            {minFlaeche > 0 && ` (gefiltert: Fläche ≥ ${minFlaeche} m²)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Min. Fläche:</span>
          {[0, 300, 500, 1000].map((m) => (
            <Button
              key={m}
              variant={minFlaeche === m ? "default" : "outline"}
              size="sm"
              onClick={() => setMinFlaeche(m)}
            >
              {m === 0 ? "alle" : `≥ ${m} m²`}
            </Button>
          ))}
          <Button variant="outline" asChild>
            <Link to="/kleinanzeigen_grundstueck">
              <ArrowLeft className="size-4 mr-2" />
              Zurück
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading || !geo ? (
            <div className="h-[600px] flex items-center justify-center text-muted-foreground">
              Lade Karte …
            </div>
          ) : (
            <MapContainer
              center={center}
              zoom={8}
              style={{ height: 600, width: "100%" }}
              key={JSON.stringify(dbFilter)}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <GeoJSON
                data={geo}
                style={styleFn as any}
                onEachFeature={onEachFeature}
              />
            </MapContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Legende</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 text-xs">
            {[
              { lbl: "0", color: "#f3f4f6" },
              { lbl: "1–2", color: "#fef3c7" },
              { lbl: "3–5", color: "#fcd34d" },
              { lbl: "6–10", color: "#f59e0b" },
              { lbl: "11–20", color: "#dc2626" },
              { lbl: "21+", color: "#7f1d1d" },
            ].map((s) => (
              <div key={s.lbl} className="flex items-center gap-1.5">
                <span
                  className="inline-block size-4 rounded border"
                  style={{ background: s.color }}
                />
                <span>{s.lbl} Inserate</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Klick auf ein PLZ-Polygon öffnet die gefilterte Liste.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default BaugrundstueckStatistik;
