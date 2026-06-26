#!/usr/bin/env python3
"""
Per-Bundesland-Listing-Scan (16 Aufrufe statt ~400), DRY-RUN.

Klassifiziert je Bundesland jeden Listing-Eintrag gegen den Bestand:
  - eindeutig : genau eine Akte mit diesem az_norm im Bundesland -> Update-Kandidat
  - neu       : kein az_norm im Bundesland -> Gericht aus Detailseite auflösen, einfügen
  - mehrdeutig: az_norm an mehreren Gerichten -> Gericht aus Detailseite auflösen

Schreibt NICHTS (Dry-Run). Beweist, dass die Gericht-Zuordnung (und damit die
Dublettenfreiheit) korrekt ist, bevor produktiv umgestellt wird.

Aufruf: SUPABASE_SERVICE_ROLE_KEY=... python3 tools/portal-detail/scan.py [maxDetailProBL]
"""
import re, json, os, time, sys, urllib.request, urllib.parse, http.cookiejar

SB = "https://ujiiaqvwpnniaasdhyrb.supabase.co"
K = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HDR = {"apikey": K, "Authorization": "Bearer " + K}
BASE = "https://www.zvg-portal.de"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
AC = {"Accept": "text/html,application/xhtml+xml", "Accept-Language": "de-DE,de;q=0.9"}
MAXDET = int(sys.argv[1]) if len(sys.argv) > 1 else 6   # Detail-Abrufe je BL (Dry-Run-Limit)
STATE_TO_LAND = {"BW":"bw","BY":"by","BE":"be","BB":"br","HB":"hb","HH":"hh","HE":"he",
                 "MV":"mv","NI":"ni","NW":"nw","RP":"rp","SL":"sl","SN":"sn","ST":"st","SH":"sh","TH":"th"}
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def aznorm(az):
    s = az.lower().strip().replace(" ", "")
    m = re.match(r"^0*(\d+)k0*(\d+)[-/](\d+)$", s)
    if not m: return s.replace("/", "-")
    p, n, y = m.groups()
    return f"{p}k{n}-{y[2:] if len(y)==4 else y}"


def g(url, ref=None):
    h = {"User-Agent": UA, **AC}
    if ref: h["Referer"] = ref
    return op.open(urllib.request.Request(url, headers=h), timeout=40).read().decode("utf-8", "replace")


def sb(path):  # paginiert (PostgREST capt bei 1000/Seite)
    out, off = [], 0
    while True:
        r = urllib.request.Request(f"{SB}/rest/v1/{path}")
        [r.add_header(k, v) for k, v in HDR.items()]
        r.add_header("Range-Unit", "items")
        r.add_header("Range", f"{off}-{off+999}")
        chunk = json.loads(op.open(r, timeout=120).read())
        out += chunk
        if len(chunk) < 1000: break
        off += 1000
    return out


def search_land(land):
    form = urllib.parse.urlencode({"ger_name":"","order_by":"1","land_abk":land,"ger_id":"","az1":"","az2":"",
        "az3":"","az4":"","art":"","obj":"","str":"","hnr":"","plz":"","ort":"","ortsteil":"","vtermin":"","btermin":""}).encode()
    r = urllib.request.Request(BASE+"/index.php?button=Suchen&all=1", data=form,
        headers={"User-Agent":UA,"Content-Type":"application/x-www-form-urlencoded",
                 "Referer":BASE+"/index.php?button=Termine%20suchen",**AC})
    h = op.open(r, timeout=60).read().decode("utf-8","replace")
    out = []
    for blob in h.split("<a target=blank_ href=index.php?button=showZvg")[1:]:
        mid = re.search(r"zvg_id=(\d+)&land_abk=", blob)
        maz = re.search(r"<nobr>([\d\sK\/]+?)&nbsp;\(Detailansicht\)", blob)
        if mid and maz:
            out.append((aznorm(maz.group(1).replace("&nbsp;"," ")), mid.group(1), maz.group(1).strip()))
    return out


def court_from_detail(zvg_id, land):
    h = g(BASE+f"/index.php?button=showZvg&zvg_id={zvg_id}&land_abk={land}", ref=BASE+"/index.php?button=Suchen")
    t = re.sub(r"\s+"," ", re.sub(r"<[^>]+>"," ", h))
    m = re.search(r"Ort der Versteigerung:\s*Amtsgericht\s+([^,]+?)\s*,", t)
    return m.group(1).strip() if m else None


def main():
    # Bestand: state|az_norm -> Liste ag_company_id
    akten = sb("zvg_akte?select=az_norm,ag_company_id,state_abbr&status=neq.aufgehoben")
    byKey = {}
    for a in akten:
        if a["az_norm"] and a["ag_company_id"] and a["state_abbr"]:
            byKey.setdefault(a["state_abbr"]+"|"+a["az_norm"], set()).add(a["ag_company_id"])
    # Gerichte: Name -> id
    comps = sb("companies?select=id,name,state_abbr&sector=eq.Amtsgericht")
    byName = {c["name"]: c["id"] for c in comps}
    print(f"Bestand: {len(akten)} Akten, {len(comps)} Gerichte\n")

    g(BASE+"/index.php"); g(BASE+"/index.php?button=Termine%20suchen")
    tot = {"eindeutig":0,"neu":0,"mehrdeutig":0}
    for state, land in STATE_TO_LAND.items():
        try:
            entries = search_land(land)
        except Exception as e:
            print(f"  {state}: Suche fehlgeschlagen: {e}"); continue
        uniq=neu=amb=0; neu_bsp=[]
        det=0
        for az, zid, azraw in entries:
            courts = byKey.get(state+"|"+az, set())
            if len(courts)==1:
                uniq+=1
            else:
                kind = "neu" if not courts else "mehrdeutig"
                if kind=="neu": neu+=1
                else: amb+=1
                if det < MAXDET:  # Gericht aus Detail auflösen (Stichprobe)
                    det+=1
                    cn = court_from_detail(zid, land)
                    cid = byName.get("Amtsgericht "+cn) if cn else None
                    if kind=="neu": neu_bsp.append(f"{azraw}->AG '{cn}' {'OK#'+str(cid) if cid else 'UNAUFGELÖST'}")
                    time.sleep(0.5)
        tot["eindeutig"]+=uniq; tot["neu"]+=neu; tot["mehrdeutig"]+=amb
        print(f"  {state}: {len(entries):4} Einträge | eindeutig={uniq} neu={neu} mehrdeutig={amb}"
              + (f" | neu-Bsp: {neu_bsp[:3]}" if neu_bsp else ""))
        time.sleep(0.5)
    print(f"\nGESAMT: {tot}")


if __name__ == "__main__":
    main()
