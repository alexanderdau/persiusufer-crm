#!/usr/bin/env python3
"""
Setzt das Flag zvg_akte.wertgrenzen_weggefallen für Verfahren, bei denen die
5/10- und 7/10-Wertgrenzen entfallen sind (Zuschlag unter Wert möglich –
für Investoren die interessanten Fälle).

Mechanik: Die Terminsuche von zvg-portal.de hat dafür die Checkbox `hinweis`.
Mit `hinweis=on` + leerem ger_id + all=1 liefert eine Suche je Bundesland genau
diese Verfahren. Wir matchen per `az_norm` (wie portal-detail) und setzen das Flag.

Setzt nur auf TRUE (Wegfall ist dauerhaft); kein Reset, daher kein Datenverlust
bei az_norm-Mismatch. Regelmäßig laufen lassen, um neue Fälle zu erfassen.

Aufruf:
  SUPABASE_SERVICE_ROLE_KEY=... python3 tools/portal-detail/wertgrenzen.py
"""
import re, json, os, time, urllib.request, urllib.parse, http.cookiejar

SB = "https://ujiiaqvwpnniaasdhyrb.supabase.co"
K = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HDR = {"apikey": K, "Authorization": "Bearer " + K, "Content-Type": "application/json"}
BASE = "https://www.zvg-portal.de"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
AC = {"Accept": "text/html,application/xhtml+xml", "Accept-Language": "de-DE,de;q=0.9"}
STATE_TO_LAND = {
    "BW": "bw", "BY": "by", "BE": "be", "BB": "br", "HB": "hb", "HH": "hh",
    "HE": "he", "MV": "mv", "NI": "ni", "NW": "nw", "RP": "rp", "SL": "sl",
    "SN": "sn", "ST": "st", "SH": "sh", "TH": "th",
}
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def az_norm_v2(az):
    s = az.lower().strip().replace(" ", "")
    m = re.match(r"^0*(\d+)k0*(\d+)[-/](\d+)$", s)
    if not m:
        return s.replace("/", "-")
    p, n, y = m.groups()
    return f"{p}k{n}-{y[2:] if len(y) == 4 else y}"


def g(url):
    return op.open(urllib.request.Request(url, headers={"User-Agent": UA, **AC}),
                   timeout=40).read().decode("utf-8", "replace")


def search_weggefallen(land):
    form = urllib.parse.urlencode({
        "ger_name": "", "order_by": "2", "land_abk": land, "ger_id": "",
        "az1": "", "az2": "", "az3": "", "az4": "", "art": "", "obj": "",
        "str": "", "hnr": "", "plz": "", "ort": "", "ortsteil": "",
        "vtermin": "", "btermin": "", "hinweis": "on",
    }).encode()
    r = urllib.request.Request(
        BASE + "/index.php?button=Suchen&all=1", data=form,
        headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded",
                 "Referer": BASE + "/index.php?button=Termine%20suchen", **AC})
    html = op.open(r, timeout=40).read().decode("utf-8", "replace")
    norms = set()
    for blob in html.split("<a target=blank_ href=index.php?button=showZvg")[1:]:
        maz = re.search(r"<nobr>([\d\sK\/]+?)&nbsp;\(Detailansicht\)", blob)
        if maz:
            norms.add(az_norm_v2(maz.group(1).replace("&nbsp;", " ")))
    return norms


def sb_flag(state, norms):
    if not norms:
        return 0
    inlist = ",".join('"' + n + '"' for n in norms)
    q = (f"{SB}/rest/v1/zvg_akte?state_abbr=eq.{state}"
         f"&az_norm=in.({urllib.parse.quote(inlist)})"
         "&wertgrenzen_weggefallen=is.false")
    r = urllib.request.Request(q, data=json.dumps(
        {"wertgrenzen_weggefallen": True}).encode(), method="PATCH")
    [r.add_header(k, v) for k, v in {**HDR, "Prefer": "return=representation"}.items()]
    return len(json.loads(op.open(r, timeout=60).read()))


def main():
    g(BASE + "/index.php")
    g(BASE + "/index.php?button=Termine%20suchen")
    total = 0
    for state, land in STATE_TO_LAND.items():
        try:
            norms = search_weggefallen(land)
            n = sb_flag(state, norms)
            total += n
            print(f"  {state}: weggefallen im Portal={len(norms)}, neu geflaggt={n}")
            time.sleep(0.7)
        except Exception as e:
            print(f"  {state} fehlgeschlagen: {e}")
    print(f"FERTIG: insgesamt {total} Akten als wertgrenzen_weggefallen geflaggt.")


if __name__ == "__main__":
    main()
