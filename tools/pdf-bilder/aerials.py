#!/usr/bin/env python3
"""Generiert amtliche DOP-Luftbilder fuer Grundstuecke (pro Bundesland-WMS),
laedt sie nach zvg-bilder, setzt cover_bild_path. Usage: aerials.py <STATE> <limit>
"""
import json, math, os, sys, time, urllib.request, urllib.parse

SB = "https://ujiiaqvwpnniaasdhyrb.supabase.co"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HDR = {"Authorization": f"Bearer {KEY}", "apikey": KEY}
STATE = sys.argv[1] if len(sys.argv) > 1 else "NW"
LIMIT = int(sys.argv[2]) if len(sys.argv) > 2 else 200
GROUND_M = 160.0  # Bildausschnitt am Boden

# Amtliche offene DOP-WMS je Bundesland (Datenlizenz Deutschland)
WMS = {
    "NW": {"url": "https://www.wms.nrw.de/geobasis/wms_nw_dop", "layer": "nw_dop_rgb", "ver": "1.3.0"},
    "BY": {"url": "https://geoservices.bayern.de/od/wms/dop/v1/dop20", "layer": "by_dop20c", "ver": "1.3.0"},
    "SN": {"url": "https://geodienste.sachsen.de/wms_geosn_dop-rgb/guest", "layer": "sn_dop_020", "ver": "1.3.0"},
    "TH": {"url": "https://www.geoproxy.geoportal-th.de/geoproxy/services/DOP", "layer": "th_dop200rgb", "ver": "1.3.0"},
    "NI": {"url": "https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms", "layer": "ni_dop20", "ver": "1.3.0"},
    "ST": {"url": "https://www.geodatenportal.sachsen-anhalt.de/wss/service/ST_LVermGeo_DOP_WMS_OpenData/guest", "layer": "lsa_lvermgeo_dop20_2", "ver": "1.3.0"},
}


def api(method, path, body=None, extra=None):
    req = urllib.request.Request(f"{SB}{path}",
                                 data=json.dumps(body).encode() if body is not None else None,
                                 method=method)
    for k, v in {**HDR, **(extra or {})}.items():
        req.add_header(k, v)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=90) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def bbox3857(lat, lon, ground_m):
    R = 20037508.342789244
    x = lon * R / 180
    y = math.log(math.tan(math.radians(90 + lat) / 2)) * R / math.pi
    d = (ground_m / 2) / math.cos(math.radians(lat))
    return x - d, y - d, x + d, y + d


def fetch_dop(cfg, lat, lon):
    minx, miny, maxx, maxy = bbox3857(lat, lon, GROUND_M)
    q = {"service": "WMS", "version": cfg["ver"], "request": "GetMap",
         "layers": cfg["layer"], "styles": "", "crs": "EPSG:3857",
         "bbox": f"{minx},{miny},{maxx},{maxy}", "width": "900", "height": "900",
         "format": "image/jpeg"}
    url = cfg["url"] + "?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(url, headers={"User-Agent": "persiusufer-crm/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    if data[:2] != b"\xff\xd8":  # kein JPEG -> Fehler/XML
        raise RuntimeError("kein JPEG: " + data[:120].decode("utf-8", "replace"))
    return data


def upload(zid, data):
    dest = f"{zid}/luftbild.jpg"
    req = urllib.request.Request(f"{SB}/storage/v1/object/zvg-bilder/{urllib.parse.quote(dest)}",
                                 data=data, method="POST")
    for k, v in HDR.items():
        req.add_header(k, v)
    req.add_header("Content-Type", "image/jpeg")
    req.add_header("x-upsert", "true")
    urllib.request.urlopen(req, timeout=120).read()
    return dest


def main():
    cfg = WMS.get(STATE)
    if not cfg:
        print(f"Kein WMS fuer {STATE} konfiguriert"); return
    cands = api("GET", "/rest/v1/zvg_akte?select=zid,objekt_lat,objekt_lon,bilder_paths"
                f"&state_abbr=eq.{STATE}&status=not.in.(aufgehoben)"
                "&objektart=ilike.*grundst*"
                "&objekt_lat=gt.-1&cover_bild_path=is.null"
                "&geocoding_precision=in.(house,street)"
                f"&limit={LIMIT}")
    print(f"{STATE}: {len(cands or [])} Kandidaten", flush=True)
    ok = errs = 0
    for a in (cands or []):
        zid = a["zid"]
        try:
            data = fetch_dop(cfg, float(a["objekt_lat"]), float(a["objekt_lon"]))
            dest = upload(zid, data)
            api("DELETE", f"/rest/v1/zvg_akte_bild?zid=eq.{urllib.parse.quote(zid)}&kind=eq.luftbild",
                extra={"Prefer": "return=minimal"})
            api("POST", "/rest/v1/zvg_akte_bild",
                body=[{"zid": zid, "source_doc_art": "dop", "storage_path": dest,
                       "bucket": "zvg-bilder", "page_index": 0, "image_index": 0,
                       "width": 900, "height": 900, "size_bytes": len(data),
                       "mime_type": "image/jpeg", "kind": "luftbild"}],
                extra={"Prefer": "return=minimal"})
            existing = [p for p in (a.get("bilder_paths") or []) if p != dest]
            api("PATCH", f"/rest/v1/zvg_akte?zid=eq.{urllib.parse.quote(zid)}",
                body={"cover_bild_path": dest, "bilder_paths": [dest] + existing},
                extra={"Prefer": "return=minimal"})
            ok += 1
            print(f"  {zid}: ok ({len(data)//1024} KB)", flush=True)
            time.sleep(0.3)
        except Exception as e:
            errs += 1
            print(f"  {zid}: FEHLER {e}", flush=True)
    print(f"FERTIG {STATE}: {ok} Luftbilder, {errs} Fehler", flush=True)


if __name__ == "__main__":
    main()
