#!/usr/bin/env python3
"""
Detail-Enrichment für zvg-portal.de.

Holt pro Akte die Detailseite (showZvg) und speichert:
  - portal_detail_text : vollständiger Detail-Text (AZ … Exposé), inkl. Felder,
    die das Listing NICHT hat (Art der Versteigerung, Grundbuch, Sachverständigen-
    Beschreibung mit Wohnfläche, Exposé-Link).
  - is_teilung         : aus "Art der Versteigerung" abgeleitet
                         ("…zum Zwecke der Aufhebung der Gemeinschaft" -> True).

WARUM ein Skript statt Edge-Function: showZvg ist stateful und braucht die
PHPSESSID aus einer vorherigen Gerichts-Suche. Das Supabase-Edge-Runtime
entfernt Set-Cookie aus fetch-Antworten -> Session nicht haltbar. http.cookiejar
hier hält sie.

Resumierbar: verarbeitet nur Akten mit portal_detail_text IS NULL. Gedrosselt
(SLEEP zwischen Requests), nach Gericht gruppiert (Suche je Gericht nur 1×).

Aufruf:
  SUPABASE_SERVICE_ROLE_KEY=... python3 tools/portal-detail/enrich.py [LIMIT]
  (LIMIT = max. Akten pro Lauf; Default 200)
"""
import re, json, os, time, sys, urllib.request, urllib.parse, http.cookiejar
from datetime import datetime, timezone

SB = "https://ujiiaqvwpnniaasdhyrb.supabase.co"
K = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HDR = {"apikey": K, "Authorization": "Bearer " + K, "Content-Type": "application/json"}
BASE = "https://www.zvg-portal.de"
# Browser-UA: zvg-portal.de vergibt einem Bot-UA keine PHPSESSID -> das stateful
# showZvg liefert dann nur eine leere Seite. Suche allein bräuchte das nicht.
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
SLEEP = 0.7  # Drosselung gegen Portal-Blocking
LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else 200

STATE_TO_LAND = {
    "BW": "bw", "BY": "by", "BE": "be", "BB": "br", "HB": "hb", "HH": "hh",
    "HE": "he", "MV": "mv", "NI": "ni", "NW": "nw", "RP": "rp", "SL": "sl",
    "SN": "sn", "ST": "st", "SH": "sh", "TH": "th",
}

cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def az_norm_v2(az):
    """Identisch zu portal-ingest: erzeugt denselben az_norm-Schlüssel."""
    s = az.lower().strip().replace(" ", "")
    m = re.match(r"^0*(\d+)k0*(\d+)[-/](\d+)$", s)
    if not m:
        return s.replace("/", "-")
    p, n, y = m.groups()
    if len(y) == 4:
        y = y[2:]
    return f"{p}k{n}-{y}"


# Browser-artige Header: ohne Accept/Accept-Language liefert das Portal die
# Detailseite NUR als leere Hülle (Inhalt fehlt). Mit ihnen kommt der volle Text.
ACCEPT = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9",
}


def portal_get(url, referer=None):
    h = {"User-Agent": UA, **ACCEPT}
    if referer:
        h["Referer"] = referer
    r = urllib.request.Request(url, headers=h)
    return op.open(r, timeout=40).read().decode("utf-8", "replace")


def portal_search(land, ger=""):
    # Leeres ger_id + all=1 (nach Priming) = ganzes Bundesland in EINEM Request.
    form = urllib.parse.urlencode({
        "ger_name": "", "order_by": "2", "land_abk": land, "ger_id": ger,
        "az1": "", "az2": "", "az3": "", "az4": "", "art": "", "obj": "",
        "str": "", "hnr": "", "plz": "", "ort": "", "ortsteil": "",
        "vtermin": "", "btermin": "",
    }).encode()
    r = urllib.request.Request(
        BASE + "/index.php?button=Suchen&all=1", data=form,
        headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded",
                 "Referer": BASE + "/index.php?button=Termine%20suchen", **ACCEPT})
    html = op.open(r, timeout=40).read().decode("utf-8", "replace")
    # Live-Listing -> {az_norm: aktuelle zvg_id}. Match per Aktenzeichen, da die
    # zvg_id bei Termin-Verlegung wechselt (gespeicherte ID veraltet schnell).
    # Mehrdeutige az_norm (gleiches AZ an zwei Gerichten desselben BL) ausschließen.
    pairs, cnt = {}, {}
    for blob in html.split("<a target=blank_ href=index.php?button=showZvg")[1:]:
        mid = re.search(r"zvg_id=(\d+)&land_abk=", blob)
        maz = re.search(r"<nobr>([\d\sK\/]+?)&nbsp;\(Detailansicht\)", blob)
        if mid and maz:
            key = az_norm_v2(maz.group(1).replace("&nbsp;", " "))
            cnt[key] = cnt.get(key, 0) + 1
            pairs[key] = mid.group(1)
    return {k: v for k, v in pairs.items() if cnt[k] == 1}


def sb_get(path):
    r = urllib.request.Request(f"{SB}/rest/v1/{path}")
    [r.add_header(k, v) for k, v in HDR.items()]
    return json.loads(op.open(r, timeout=60).read())


def sb_patch(zid, body):
    r = urllib.request.Request(
        f"{SB}/rest/v1/zvg_akte?zid=eq.{urllib.parse.quote(zid)}",
        data=json.dumps(body).encode(), method="PATCH")
    [r.add_header(k, v) for k, v in {**HDR, "Prefer": "return=minimal"}.items()]
    op.open(r, timeout=60).read()


def unesc(s):
    for a, b in [("&nbsp;", " "), ("&amp;", "&"), ("&szlig;", "ß"), ("&auml;", "ä"),
                 ("&ouml;", "ö"), ("&uuml;", "ü"), ("&Auml;", "Ä"), ("&Ouml;", "Ö"),
                 ("&Uuml;", "Ü"), ("&sup2;", "²"), ("&sup3;", "³"),
                 ("&#128;", "€"), ("&euro;", "€"), ("&lt;", "<"), ("&gt;", ">")]:
        s = s.replace(a, b)
    return re.sub(r"&#\d+;", " ", s)


def parse_detail(html):
    """-> (text, is_teilung) oder (None, None) wenn keine Detailseite."""
    start = html.find("letzte Aktualisierung:")
    if start < 0:
        return None, None
    tr = html.rfind("<tr", 0, start)
    begin = tr if tr >= 0 else start
    anchor = max(html.find("Exposee", start), html.find("amtliche Bekanntmachung", start),
                 html.find("Ort der Versteigerung", start))
    end = html.find("</table>", anchor if anchor > 0 else start)
    if end < 0:
        end = len(html)
    seg = unesc(re.sub(r"<[^>]+>", " ", html[begin:end]))
    seg = re.sub(r"[ \t]+", " ", re.sub(r"\s*\n\s*", "\n", seg)).strip()
    if not seg:
        return None, None
    return seg, ("aufhebung der gemeinschaft" in seg.lower())


def main():
    # Kandidaten: ohne Detailtext, mit Portal-ID, aktiv, Gericht mit Portal-ID.
    sel = ("zid,zvg_portal_id,az_norm,zvg_portal_land_abk,termin,"
           "companies!inner(zvg_portal_ag_id,state_abbr)")
    # Nur Akten mit echt ZUKÜNFTIGEM Termin (> jetzt): nur die sind noch im
    # Portal gelistet. Bereits abgelaufene (auch heutige) sind entfernt ->
    # showZvg gäbe "error". gt.now statt gte.heute, sonst füllen abgelaufene
    # heutige Termine das LIMIT und verdrängen die echten zukünftigen.
    now_iso = datetime.now(timezone.utc).isoformat()
    q = (f"zvg_akte?select={urllib.parse.quote(sel)}"
         "&portal_detail_text=is.null&zvg_portal_id=not.is.null"
         "&status=neq.aufgehoben&companies.zvg_portal_ag_id=not.is.null"
         f"&termin=gt.{urllib.parse.quote(now_iso)}&order=termin.asc&limit={LIMIT}")
    cand = sb_get(q)
    print(f"Kandidaten: {len(cand)}")

    # nach Bundesland gruppieren (eine Suche je BL deckt alle Gerichte ab)
    groups = {}
    for r in cand:
        land = r.get("zvg_portal_land_abk") or STATE_TO_LAND.get(r["companies"]["state_abbr"])
        if not land:
            continue
        groups.setdefault(land, []).append(r)

    # Session anwärmen
    portal_get(BASE + "/index.php")
    portal_get(BASE + "/index.php?button=Termine%20suchen")

    st = {"laender": 0, "fetched": 0, "updated": 0, "teilung": 0,
          "empty": 0, "gone": 0, "err": 0}
    for land, rows in groups.items():
        st["laender"] += 1
        try:
            live = portal_search(land)  # ganzes Bundesland, leeres ger_id
            if os.environ.get("DBG"):
                hit = [r["az_norm"] for r in rows if r["az_norm"] in live]
                print(f"  LAND {land}: live={len(live)} cand={len(rows)} hit={len(hit)}")
            time.sleep(SLEEP)
        except Exception as e:
            st["err"] += 1
            print(f"  Suche {land} fehlgeschlagen: {e}")
            continue
        for r in rows:
            # Aktuelle zvg_id per Aktenzeichen aus dem Live-Listing. Fehlt sie,
            # ist die Akte nicht (mehr) gelistet -> showZvg gäbe "error".
            zvg = live.get(r["az_norm"])
            if not zvg:
                st["gone"] += 1
                continue
            try:
                html = portal_get(
                    BASE + f"/index.php?button=showZvg&zvg_id={zvg}&land_abk={land}",
                    referer=BASE + "/index.php?button=Suchen")
                st["fetched"] += 1
                if os.environ.get("DBG"):
                    print(f"    DBG zid={r['zid']} zvg_id={r['zvg_portal_id']} land={land} "
                          f"len={len(html)} marker={'letzte Aktualisierung:' in html}")
                text, teil = parse_detail(html)
                if not text:
                    st["empty"] += 1
                else:
                    sb_patch(r["zid"], {"portal_detail_text": text, "is_teilung": teil})
                    st["updated"] += 1
                    if teil:
                        st["teilung"] += 1
                time.sleep(SLEEP)
            except Exception as e:
                st["err"] += 1
                print(f"  Detail {r['zid']} fehlgeschlagen: {e}")
        print(f"  ... {land} -> {st}")
    print("FERTIG:", st)


if __name__ == "__main__":
    main()
