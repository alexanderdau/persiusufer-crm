#!/usr/bin/env python3
"""Diagnose: fährt die showZvg-Sequenz für eine bekannte Akte (Neuruppin 7187,
zukünftiger Termin) und zeigt nach jedem Schritt, wo es bricht."""
import urllib.request, urllib.parse, http.cookiejar

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
BASE = "https://www.zvg-portal.de"
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def g(url, ref=None):
    h = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml",
         "Accept-Language": "de-DE,de;q=0.9"}
    if ref:
        h["Referer"] = ref
    r = op.open(urllib.request.Request(url, headers=h), timeout=40)
    return r.read().decode("utf-8", "replace"), r.geturl()


h1, u1 = g(BASE + "/index.php")
print(f"1) home: len={len(h1)} final_url={u1}")
print(f"   Cookies im Jar: {[c.name + '=' + c.value[:8] for c in cj]}")

g(BASE + "/index.php?button=Termine%20suchen")
print(f"2) Termine-suchen ok. Cookies: {[c.name for c in cj]}")

form = urllib.parse.urlencode({
    "ger_name": "", "order_by": "2", "land_abk": "br", "ger_id": "G1309",
    "az1": "", "az2": "", "az3": "", "az4": "", "art": "", "obj": "", "str": "",
    "hnr": "", "plz": "", "ort": "", "ortsteil": "", "vtermin": "", "btermin": "",
}).encode()
req = urllib.request.Request(
    BASE + "/index.php?button=Suchen&all=1", data=form,
    headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded",
             "Referer": BASE + "/index.php?button=Termine%20suchen",
             "Accept": "text/html", "Accept-Language": "de-DE,de;q=0.9"})
sr = op.open(req, timeout=40).read().decode("utf-8", "replace")
print(f"3) Suche G1309: len={len(sr)} showZvg-Treffer={sr.count('button=showZvg')} "
      f"enthaelt_7187={'zvg_id=7187' in sr}")

det, du = g(BASE + "/index.php?button=showZvg&zvg_id=7187&land_abk=br",
            ref=BASE + "/index.php?button=Suchen")
print(f"4) showZvg 7187: len={len(det)} final_url={du}")
print(f"   'Art der Versteigerung' enthalten: {'Art der Versteigerung' in det}")
print(f"   'letzte Aktualisierung:' enthalten: {'letzte Aktualisierung:' in det}")
print("--- erste 280 Zeichen Detail ---")
import re
print(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", det))[:280])
