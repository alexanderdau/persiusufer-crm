#!/usr/bin/env python3
# UNIKA (zwangsversteigerung.de) Voll-Lauf: Listings paginiert -> Match (PLZ,VKW)
# -> Flächen + unika_id + Quelle 'zwangsversteigerung.de' + Wiederholungstermin (aus Detail).
import re, json, os, time, urllib.request, http.cookiejar, sys
SB="https://ujiiaqvwpnniaasdhyrb.supabase.co"; K=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HDR={"Authorization":f"Bearer {K}","apikey":K,"Content-Type":"application/json"}
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36 Chrome/124 Safari/537.36"
cj=http.cookiejar.CookieJar(); op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def get(url):
    r=urllib.request.Request(url, headers={"User-Agent":UA})
    return op.open(r, timeout=25).read().decode('iso-8859-1','replace')
def clean(s):
    for a,b in [('&nbsp;',' '),('&euro;','EUR'),('&uuml;','ü'),('&auml;','ä'),('&ouml;','ö'),('&szlig;','ß'),('&sup2;','²'),('&Uuml;','Ü')]: s=s.replace(a,b)
    return s
def num(mm):
    if not mm: return None
    s=re.sub(r'\D','', mm.group(1) if hasattr(mm,'group') else str(mm))
    return int(s) if s else None
def rest(p):
    r=urllib.request.Request(f"{SB}/rest/v1/{p}"); [r.add_header(k,v) for k,v in HDR.items()]; r.add_header("Range","0-99999")
    return json.loads(urllib.request.urlopen(r).read())
def patch(zid,body):
    r=urllib.request.Request(f"{SB}/rest/v1/zvg_akte?zid=eq.{urllib.parse.quote(zid)}",data=json.dumps(body).encode(),method='PATCH')
    [r.add_header(k,v) for k,v in {**HDR,'Prefer':'return=minimal'}.items()]; urllib.request.urlopen(r).read()
def upq(zid,eid):
    r=urllib.request.Request(f"{SB}/rest/v1/zvg_akte_quelle?on_conflict=zid,quelle",
        data=json.dumps({"zid":zid,"quelle":"zwangsversteigerung.de","externe_id":eid,"last_seen":"now()"}).encode(),method='POST')
    [r.add_header(k,v) for k,v in {**HDR,'Prefer':'resolution=merge-duplicates,return=minimal'}.items()]; urllib.request.urlopen(r).read()

# Session + alle Listings paginiert
get("https://www.zwangsversteigerung.de/immobiliensuche")
objs={}
for pg in range(1, 400):
    try:
        h=clean(get(f"https://www.zwangsversteigerung.de/suche?ol=1&suchpage={pg}&ergebnisZeigen=1&sprache=DE"))
    except Exception: break
    parts=re.split(r'/detail/([A-Z]\d+)', h)
    found=0
    for i in range(1,len(parts),2):
        uid=parts[i];
        if uid in objs: found+=1; continue
        body=re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',parts[i+1] if i+1<len(parts) else ''))[:400]
        plz=re.search(r'\b(\d{5})\b',body); g=re.search(r'Grundst[üu]ck:?\s*([\d.]+)\s*m',body); w=re.search(r'Wohnfl[äa]che:?\s*([\d.]+)\s*m',body)
        eur=[int(re.sub(r'\D','',e)) for e in re.findall(r'([\d.]+)\s*EUR',body) if re.sub(r'\D','',e)]
        objs[uid]={'uid':uid,'plz':plz.group(1) if plz else None,'g':num(g),'w':num(w),'vkw':eur[-1] if eur else None}
        found+=1
    if found==0: break
    time.sleep(0.2)
print(f"UNIKA-Objekte gesammelt: {len(objs)}", flush=True)

# Match-Map (plz,vkw)->[zid]
from collections import defaultdict
m=defaultdict(list)
for a in rest("zvg_akte?select=zid,objekt_plz,vkw_eur"):
    if a['objekt_plz'] and a['vkw_eur'] and float(a['vkw_eur'])>1: m[(a['objekt_plz'],int(float(a['vkw_eur'])))].append(a['zid'])

enr=wt_set=gaps=ambig=0
for o in objs.values():
    if not o['plz'] or not o['vkw'] or o['vkw']<=1: continue
    z=m.get((o['plz'],o['vkw']),[])
    if len(z)!=1:
        if len(z)>1: ambig+=1
        else: gaps+=1
        continue
    zid=z[0]; body={'unika_id':o['uid']}
    if o['g']: body['grundstuecksflaeche_qm']=o['g']
    if o['w']: body['wohnflaeche_qm']=o['w']
    # Detail für Wiederholungstermin + Gewerbe
    try:
        d=clean(get(f"https://www.zwangsversteigerung.de/detail/{o['uid']}")); dt=re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',d))
        wm=re.search(r'Wiederholungstermin\s+(Ja|Nein)', dt)
        if wm: body['wiederholungstermin']=(wm.group(1)=='Ja'); wt_set+=1
        gm=num(re.search(r'Gewerbefl[äa]che\s*([\d.]+)\s*m', dt))
        if gm: body['gewerbeflaeche_qm']=gm
    except Exception: pass
    try: patch(zid,body); upq(zid,o['uid']); enr+=1
    except Exception as e: print("patch err",zid,e,flush=True)
    time.sleep(0.25)
print(f"FERTIG: angereichert {enr} | Wiederholungstermin gesetzt {wt_set} | mehrdeutig {ambig} | Gap-Kandidaten {gaps}", flush=True)
