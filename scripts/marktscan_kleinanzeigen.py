#!/usr/bin/env python3
"""
Marktscan kleinanzeigen.de — Brandenburg, Baugrundstücke, Kaufen.

Pro Lauf:
- Listing-Seiten 1..N abklappern bis Anzahl < 27 (letzte Seite)
- Neue adids → Detail-Page parsen, Bilder lokal in Bucket spiegeln, INSERT
- Bekannte adids → last_seen_at + Preis updaten
- Nicht-mehr-gelistete adids → status='verschwunden'

ENV:
  SUPABASE_URL          z.B. https://ujiiaqvwpnniaasdhyrb.supabase.co
  SUPABASE_SERVICE_KEY  Service-Role-Key
  MAX_PAGES             optional, default 100
  THROTTLE_MIN          optional, default 4.0
  THROTTLE_MAX          optional, default 8.0
"""
from __future__ import annotations

import json
import os
import random
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import urllib.request
import urllib.parse
import urllib.error

# ───────────────────────────────────────────────────────────────────────────
# Konfiguration
# ───────────────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
if not (SUPABASE_URL and SUPABASE_KEY):
    sys.exit("ERROR: SUPABASE_URL + SUPABASE_SERVICE_KEY müssen gesetzt sein")

MAX_PAGES = int(os.environ.get("MAX_PAGES", "100"))
# Per-Inserat-Throttle (kleinanzeigen.de-Schonung zwischen Detail-Requests).
# Default niedrig, weil wir pro Seite eh schon 10 s warten.
THROTTLE_MIN = float(os.environ.get("THROTTLE_MIN", "0.5"))
THROTTLE_MAX = float(os.environ.get("THROTTLE_MAX", "1.0"))
# Per-Seite-Throttle (random 8-12 s zwischen Listing-Seiten)
PAGE_THROTTLE_MIN = float(os.environ.get("PAGE_THROTTLE_MIN", "3.0"))
PAGE_THROTTLE_MAX = float(os.environ.get("PAGE_THROTTLE_MAX", "5.0"))
BUCKET = "kleinanzeigen-bilder"

BASE = "https://www.kleinanzeigen.de"
# Default-Sortierung (Empfohlen)
LIST_TPL = (
    "{base}/s-grundstuecke-garten/baugrundstueck/brandenburg/seite:{n}"
    "/c207l7711+grundstuecke_garten.type_s:baugrundstueck"
)
LIST_TPL_PAGE1 = (
    "{base}/s-grundstuecke-garten/baugrundstueck/brandenburg"
    "/c207l7711+grundstuecke_garten.type_s:baugrundstueck"
)
# Sortierung: Neueste zuerst (für since-Mode / Daily-Run)
LIST_TPL_NEUESTE = (
    "{base}/s-grundstuecke-garten/baugrundstueck/brandenburg"
    "/sortierung:neueste/seite:{n}"
    "/c207l7711+grundstuecke_garten.type_s:baugrundstueck"
)
LIST_TPL_NEUESTE_PAGE1 = (
    "{base}/s-grundstuecke-garten/baugrundstueck/brandenburg"
    "/sortierung:neueste"
    "/c207l7711+grundstuecke_garten.type_s:baugrundstueck"
)

# SCAN_MODE = "full" (default — durch alle Seiten) | "since" (stop bei bekanntem Inserat)
SCAN_MODE = os.environ.get("SCAN_MODE", "full")
# Wenn since: nach wie vielen konsekutiv bekannten/älteren Inseraten wir abbrechen
SINCE_STOP_AFTER = int(os.environ.get("SINCE_STOP_AFTER", "10"))

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15"
)

# LOG_DIR: per ENV oder Auto-Detect via Glob (Sandbox-Hostname wechselt)
import glob as _glob
_log_env = os.environ.get("LOG_DIR")
if _log_env:
    LOG_DIR = Path(_log_env)
else:
    _candidates = _glob.glob("/sessions/*/mnt/Grundst*/Versteigerungen/_logs") + \
                  _glob.glob("/sessions/*/mnt/Grundst*/Versteigerungen")
    LOG_DIR = Path(_candidates[0]) if _candidates else Path("/tmp")
    if LOG_DIR.name == "Versteigerungen":
        LOG_DIR = LOG_DIR / "_logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / f"marktscan_kleinanzeigen_{datetime.now().strftime('%Y-%m-%d_%H%M')}.log"


def log(msg: str) -> None:
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


# ───────────────────────────────────────────────────────────────────────────
# HTTP
# ───────────────────────────────────────────────────────────────────────────


def http_get(url: str, *, referer: str | None = None, retries: int = 2) -> tuple[int, bytes]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/*;q=0.8,*/*;q=0.5",
            "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": referer or "https://www.kleinanzeigen.de/",
            "Connection": "keep-alive",
        },
    )
    last_err = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                log(f"  WAF {e.code} on {url} — backoff 60 s")
                time.sleep(60)
                continue
            return e.code, b""
        except Exception as e:
            last_err = e
            time.sleep(5)
    log(f"  FAIL after retries: {url} ({last_err})")
    return 0, b""


def throttle() -> None:
    time.sleep(random.uniform(THROTTLE_MIN, THROTTLE_MAX))


def page_throttle() -> None:
    time.sleep(random.uniform(PAGE_THROTTLE_MIN, PAGE_THROTTLE_MAX))


def fetch_aufrufe(adid: int, referer: str) -> int | None:
    """Ruft den Aufrufe-Zähler über s-vac-inc-get.json ab.
    Achtung: der Endpoint inkrementiert den Counter — daher pro Marktscan-
    Lauf höchstens einmal pro Inserat aufrufen.
    """
    try:
        url = f"https://www.kleinanzeigen.de/s-vac-inc-get.json?adId={adid}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": UA,
                "Accept": "application/json",
                "Referer": referer,
            },
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        return int(data.get("numVisits", 0))
    except Exception as e:
        log(f"    aufrufe-fetch fail kid={adid}: {e}")
        return None


# ───────────────────────────────────────────────────────────────────────────
# Supabase REST helpers
# ───────────────────────────────────────────────────────────────────────────


def sb_request(method: str, path: str, *, body: bytes | None = None,
               extra_headers: dict[str, str] | None = None) -> tuple[int, bytes]:
    url = f"{SUPABASE_URL}/{path.lstrip('/')}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def sb_select(path: str) -> Any:
    code, data = sb_request("GET", f"rest/v1/{path}")
    if code >= 300:
        log(f"  Supabase GET {path} → {code} {data[:200]!r}")
        return None
    return json.loads(data)


def sb_upsert(table: str, rows: list[dict[str, Any]]) -> int:
    code, _ = sb_request(
        "POST",
        f"rest/v1/{table}?on_conflict=kid",
        body=json.dumps(rows).encode("utf-8"),
        extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
    )
    return code


def sb_update(table: str, filter_kv: str, patch: dict[str, Any]) -> int:
    code, _ = sb_request(
        "PATCH",
        f"rest/v1/{table}?{filter_kv}",
        body=json.dumps(patch).encode("utf-8"),
        extra_headers={"Prefer": "return=minimal"},
    )
    return code


def storage_upload(path: str, content: bytes, content_type: str) -> bool:
    code, _ = sb_request(
        "POST",
        f"storage/v1/object/{BUCKET}/{path}",
        body=content,
        extra_headers={
            "Content-Type": content_type,
            "x-upsert": "true",
        },
    )
    return code < 300


# ───────────────────────────────────────────────────────────────────────────
# HTML-Parsing
# ───────────────────────────────────────────────────────────────────────────


RE_ARTICLE = re.compile(
    r'<article\s+[^>]*class="aditem"[^>]*data-adid="(?P<adid>\d+)"[^>]*data-href="(?P<href>[^"]+)"[^>]*>(?P<body>.*?)</article>',
    re.DOTALL,
)
RE_TITLE_LIST = re.compile(r'<a class="ellipsis"[^>]*>\s*(.*?)\s*</a>', re.DOTALL)
RE_ORT_LIST = re.compile(r'class="aditem-main--top--left"[^>]*>(.*?)</div>', re.DOTALL)
RE_PRICE_LIST = re.compile(r'class="aditem-main--middle--price-shipping--price"[^>]*>\s*(.*?)\s*</p>', re.DOTALL)
RE_TAG = re.compile(r'class="simpletag[^"]*"[^>]*>\s*([^<]+?)\s*</span>')

RE_TITLE_DETAIL = re.compile(r'<h1[^>]*id="viewad-title"[^>]*>(.*?)</h1>', re.DOTALL)
RE_PRICE_DETAIL = re.compile(r'<h2[^>]*id="viewad-price"[^>]*>(.*?)</h2>', re.DOTALL)
RE_LOCALITY = re.compile(r'id="viewad-locality"[^>]*>(.*?)</span>', re.DOTALL)
RE_DESC = re.compile(r'id="viewad-description-text"[^>]*>(.*?)</p>', re.DOTALL)
RE_DETAIL_LI = re.compile(
    r'<li class="addetailslist--detail">\s*([^<]+?)\s*<span class="addetailslist--detail--value"[^>]*>\s*([^<]+?)\s*</span>',
    re.DOTALL,
)
RE_IMG = re.compile(r'data-imgsrc="([^"]+)"|<img[^>]+id="viewad-image"[^>]+src="([^"]+)"')
RE_CREATED = re.compile(r'id="viewad-extra-info"[^>]*>(.*?)</div>', re.DOTALL)
RE_DATE_TXT = re.compile(r'(\d{2}\.\d{2}\.\d{4})')
# Aufrufe stehen nach dem Datum (z.B. "22.05.2026 ... 40"); nicht das Jahr matchen.
RE_VIEWS = re.compile(
    r'\d{2}\.\d{2}\.\d{4}\s+(\d{1,5})(?!\d)|(\d{1,5})\s*(?:Aufrufe|gesehen)'
)
RE_RESERVIERT = re.compile(r'Reserviert', re.IGNORECASE)
RE_GELOESCHT = re.compile(r'Gel(ö|&ouml;)scht', re.IGNORECASE)
# Strikter Match: nur class endet auf "userprofile-vip" (nicht userprofile-vip-details*)
RE_ANBIETER_NAME = re.compile(
    r'class="[^"]*\buserprofile-vip"[^>]*>\s*([^<]+?)\s*</span>', re.DOTALL
)
_GENERIC_USER_NAMES = {"Privater Nutzer", "Gewerblicher Nutzer", ""}
RE_ANBIETER_TYP = re.compile(
    r'<span class="userprofile-vip-details-text">\s*(Privater Nutzer|Gewerblicher Nutzer)\s*</span>',
    re.DOTALL,
)
RE_ANBIETER_AKTIV = re.compile(
    r'<span class="userprofile-vip-details-text">\s*Aktiv seit\s*(\d{2}\.\d{2}\.\d{4})\s*</span>',
    re.DOTALL,
)
# Heuristik-Regex für Baurecht-Felder aus Beschreibung
RE_BAUERWARTUNG = re.compile(
    r"\bBauerwartungs?land\b|\bnicht\s+baureif\b|\bvor\s+B-?Plan\b|noch\s+nicht\s+ausgewiesen",
    re.IGNORECASE,
)
RE_GRZ = re.compile(
    r"\bGRZ\b[^\w]{0,5}(0[,.]\d{1,2})", re.IGNORECASE
)
RE_GFZ = re.compile(
    r"\bGFZ\b[^\w]{0,5}(\d[,.]\d{1,2})", re.IGNORECASE
)
RE_VOLLGESCH = re.compile(
    r"(\d)\s*Vollgeschoss", re.IGNORECASE
)
RE_BPLAN_NUMMER = re.compile(
    r"B-?Plan(?:[- ]Nr\.?)?\s*(?:Nr\.?)?\s*([\w./-]+)", re.IGNORECASE
)
RE_BPLAN_VORHANDEN = re.compile(
    r"\b(?:rechtskräftiger?|qualifizierter?|gültiger?|bestehender?)\s+B-?Plan|"
    r"\bB-?Plan\s+(?:liegt\s+vor|vorhanden|festgesetzt)|"
    r"§\s*30\s+BauGB",
    re.IGNORECASE,
)
RE_ANBIETER_OBJ_ID = re.compile(
    r"(?:Objekt[- ]?(?:Nr\.?|Nummer|ID)|Obj(?:ekt)?[- ]?ID|"
    r"Referenz(?:[- ]?Nr\.?)?|Maklerobjekt|Auftrags[- ]?(?:Nr\.?|nummer)|"
    r"Immobilien[- ]?ID|Exposé[- ]?Nr\.?|Expose[- ]?Nr\.?)"
    r"\s*[:.#]?\s*([A-Za-z0-9][A-Za-z0-9.\-/_]{2,40})",
    re.IGNORECASE,
)

RE_ERBBAURECHT = re.compile(
    r"\bErbbaurecht\b|\bErbpacht\b|\bErbbau(?:zins|berechtigt)?\b",
    re.IGNORECASE,
)

RE_GEMARKUNG = re.compile(
    r"Gemarkung\s+([A-ZÄÖÜ][A-Za-zäöüßÄÖÜ\-]{2,40})",
)
RE_FLUR = re.compile(
    r"\bFlur\s+(?:Nr\.?\s*)?(\d{1,4}[a-z]?)\b",
    re.IGNORECASE,
)
RE_FLURSTUECK = re.compile(
    r"Flurst(?:ü|ue)ck(?:en?|s)?\s*(?:Nr\.?\s*)?([\d\s/,.-]{1,60}?)(?:\s|,|;|\.|$)",
    re.IGNORECASE,
)

RE_BAUTRAEGER_FREI = re.compile(
    r"\bbautr(?:ä|ae)gerfrei\b|"
    r"\bohne\s+Bautr(?:ä|ae)ger(?:bindung)?\b|"
    r"\bkeine?\s+Bautr(?:ä|ae)gerbindung\b|"
    r"\bfrei(?:e)?r?\s+Architektenwahl\b",
    re.IGNORECASE,
)
RE_BAUTRAEGER_GEBUNDEN = re.compile(
    r"\bbautr(?:ä|ae)gergebunden\b|"
    r"\bmit\s+Bautr(?:ä|ae)gerbindung\b|"
    r"\bnur\s+(?:mit|in\s+Verbindung\s+mit)\s+(?:unserem\s+)?Bautr(?:ä|ae)ger\b",
    re.IGNORECASE,
)

RE_BAUBARKEIT = re.compile(
    r"\b(Mehrfamilienhaus|MFH|Doppelhaush(?:ä|ae)lfte|Doppelhaus|DHH|"
    r"Einfamilienhaus\s*(?:mit\s+)?Einliegerwohnung|EFH\s*[/+]\s*EW|EFH/EW|"
    r"Einfamilienhaus|EFH)\b",
    re.IGNORECASE,
)
RE_ORTSTEIL = re.compile(
    r"(?:Ortsteil|OT\b|\bO\.\s*T\.|im\s+Ortsteil)\s+([A-ZÄÖÜ][A-Za-zäöüßÄÖÜ-]{2,30})",
)
RE_GRUNDFLAECHE = re.compile(
    r"(?:Grundfl(?:ä|ae)che|\bGR\b)"
    r"(?:\s*\(?GR\)?)?\s*(?:von|=|:)?\s*"
    r"(?:ca\.|circa|rd\.)?\s*(\d{2,5})\s*(?:m²|qm|m2)",
    re.IGNORECASE,
)
RE_BAUFELD = re.compile(
    r"Baufeld\s*(?:von|=|:)?\s*(?:ca\.|circa|rd\.)?\s*(\d{2,5})\s*(?:m²|qm|m2)",
    re.IGNORECASE,
)
RE_WOHNFLAECHE = re.compile(
    r"(?:Wohnfl(?:ä|ae)che|\bWFL\b|WF\b)\s*(?:von|=|:)?\s*"
    r"(?:ca\.|circa|rd\.|bis\s+zu)?\s*(\d{2,5})\s*(?:m²|qm|m2)",
    re.IGNORECASE,
)

RE_PROV_SATZ = re.compile(
    r"(?:Provision|Courtage|K(?:ä|ae)ufer(?:provision|courtage)|Maklerlohn|Maklerprovision)"
    r"[\s\S]{0,80}?(\d{1,2}[,.]\d{1,2})\s*%|"
    r"(\d{1,2}[,.]\d{1,2})\s*%(?:\s*(?:zzgl\.?|inkl\.?|inkl|incl|netto|brutto)?\s*"
    r"(?:Mw[Ss]t|MwSt\.?|MWSt|USt|MWST))",
    re.IGNORECASE,
)

RE_PARAGRAPH_34 = re.compile(
    r"§\s*34\s*BauGB|"
    r"nach\s+§\s*34\b|"
    r"gem(?:äß|\.)\s*§\s*34\b|"
    r"Einf(?:ü|ue)gungsgebot|"
    r"angepasste\s+Umgebungsbebauung|"
    r"unbeplant(?:er|en)?\s+Innenbereich",
    re.IGNORECASE,
)
RE_TEILBAR = re.compile(
    r"\b(?:real\s+)?teilbar(?:es)?\b|\bTeilung\s+möglich|"
    r"\bAufteilung\b|\bin\s+\d+\s+Parzellen?",
    re.IGNORECASE,
)
RE_ERSCHL_VOLL = re.compile(
    r"\b(?:voll|komplett|fertig)\s*erschlossen|\bvollerschlossen\b",
    re.IGNORECASE,
)
RE_ERSCHL_TEIL = re.compile(
    r"\bteil(?:weise\s+)?erschlossen|\bteilerschlossen\b",
    re.IGNORECASE,
)
RE_ERSCHL_UN = re.compile(
    r"\bunerschlossen\b|\bnoch\s+nicht\s+erschlossen|\bohne\s+Erschliessung",
    re.IGNORECASE,
)

RE_DOC = re.compile(
    r'<a\s+href="(https://dl\.kleinanzeigen-user-content\.de/dokumente/[^"]+)"[^>]*class="[^"]*ad-documents[^"]*"[^>]*>'
    r'.*?<span\s+class="iconlist-text[^"]*">\s*([^<]+?)\s*</span>',
    re.DOTALL,
)


import html as _html_mod
import unicodedata as _unicode_mod

# Unsichtbare Zeichen (Zero-Width Space, Soft-Hyphen, ZW-Joiner, BiDi-Marks etc.),
# die kleinanzeigen.de in Orts- und Titelfeldern für Such-Cosmetics einstreut.
_INVISIBLE_RE = re.compile(
    r"[­​‌‍‎‏  ‪-‮⁠﻿]"
)


def strip_html(s: str) -> str:
    if not s:
        return ""
    # 1) Tags raus
    s = re.sub(r"<[^>]+>", "", s)
    # 2) Alle benannten + numerischen HTML-Entities auflösen
    #    (&amp; &ouml; &#8203; &#x200B; etc.)
    s = _html_mod.unescape(s)
    # 3) Unicode-Normalisierung (NFC) — z.B. á aus a+◌́ zusammenführen
    s = _unicode_mod.normalize("NFC", s)
    # 4) Unsichtbare Zeichen entfernen
    s = _INVISIBLE_RE.sub("", s)
    # 5) Whitespace normalisieren
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_price(txt: str) -> tuple[float | None, bool]:
    """'995.000 €' → (995000.00, False); '60.000 € VB' → (60000.00, True)."""
    if not txt:
        return None, False
    vb = " VB" in txt or "Verhandlung" in txt
    m = re.search(r'([\d.]+)', txt)
    if not m:
        return None, vb
    val = m.group(1).replace(".", "")
    try:
        return float(val), vb
    except ValueError:
        return None, vb


def parse_flaeche(txt: str | None) -> float | None:
    if not txt:
        return None
    m = re.search(r'([\d.,]+)', txt)
    if not m:
        return None
    val = m.group(1).replace(".", "").replace(",", ".")
    try:
        return float(val)
    except ValueError:
        return None


def parse_plz_ort(ort_str: str) -> tuple[str | None, str | None, str | None]:
    """'14532 Kleinmachnow' → ('14532', 'Kleinmachnow', None).
       '15827 Blankenfelde-Mahlow' → ('15827', 'Blankenfelde-Mahlow', None).
       '15741 Bestensee OT Pätz' → ('15741', 'Bestensee', 'Pätz').
       '15741 Brandenburg - Bestensee' → ('15741', 'Bestensee', None)."""
    if not ort_str:
        return None, None, None
    ort_str = ort_str.strip()
    m = re.match(r"^(\d{5})\s+(.+?)$", ort_str)
    if not m:
        return None, ort_str, None
    plz = m.group(1)
    rest = m.group(2).strip()
    # "Brandenburg - Bestensee" → Bestensee (Bundesland-Präfix abschneiden)
    rest = re.sub(
        r"^(Brandenburg|Berlin|Mecklenburg-Vorpommern|Sachsen|Sachsen-Anhalt)\s*-\s*",
        "",
        rest,
    )
    # OT-Token: "Stadt OT Ortsteil" oder "Stadt, OT Ortsteil"
    m_ot = re.search(r"^(.+?)\s*[,]?\s*OT\s+(.+)$", rest, re.IGNORECASE)
    if m_ot:
        ort_, ot_ = m_ot.group(1).strip(), m_ot.group(2).strip()
        return plz, ort_, (None if _norm_name(ot_) == _norm_name(ort_) else ot_)
    # Fallback: "Stadt - Ortsteil"
    if " - " in rest:
        ort, ortsteil = rest.split(" - ", 1)
        ort, ortsteil = ort.strip(), ortsteil.strip()
        return plz, ort, (None if _norm_name(ortsteil) == _norm_name(ort) else ortsteil)
    # Sonst: alles ist Ort
    return plz, rest, None


@dataclass
class ListItem:
    adid: int
    href: str
    title: str
    ort_str: str
    price_str: str
    tags: list[str] = field(default_factory=list)


def parse_listing(html: str) -> list[ListItem]:
    items: list[ListItem] = []
    for m in RE_ARTICLE.finditer(html):
        adid = int(m.group("adid"))
        href = m.group("href")
        body = m.group("body")
        title_m = RE_TITLE_LIST.search(body)
        ort_m = RE_ORT_LIST.search(body)
        price_m = RE_PRICE_LIST.search(body)
        tags = [strip_html(t) for t in RE_TAG.findall(body)]
        items.append(
            ListItem(
                adid=adid,
                href=href,
                title=strip_html(title_m.group(1)) if title_m else "",
                ort_str=strip_html(ort_m.group(1)) if ort_m else "",
                price_str=strip_html(price_m.group(1)) if price_m else "",
                tags=tags,
            )
        )
    return items


@dataclass
class DetailData:
    title: str
    price_str: str
    locality: str
    desc: str
    details: dict[str, str]
    images: list[str]
    created_date: str | None
    aufrufe: int | None
    reserviert: bool
    geloescht: bool
    anbieter_name: str | None = None
    anbieter_typ: str | None = None
    anbieter_aktiv_seit: str | None = None
    dokumente: list[tuple[str, str]] = field(default_factory=list)  # [(href, dateiname), ...]


def parse_detail(html: str) -> DetailData:
    title_m = RE_TITLE_DETAIL.search(html)
    price_m = RE_PRICE_DETAIL.search(html)
    loc_m = RE_LOCALITY.search(html)
    desc_m = RE_DESC.search(html)
    created_m = RE_CREATED.search(html)
    title = strip_html(title_m.group(1)) if title_m else ""
    price = strip_html(price_m.group(1)) if price_m else ""
    loc = strip_html(loc_m.group(1)) if loc_m else ""
    desc = strip_html(desc_m.group(1)) if desc_m else ""
    details = {strip_html(k): strip_html(v) for k, v in RE_DETAIL_LI.findall(html)}
    images: list[str] = []
    seen_uuids: set[str] = set()
    # WICHTIG: nur echte Inserat-Bilder aus dem prod-ads-CDN nehmen.
    # Werbung/AdSense kommt aus anderen Domains, UI-Icons aus /static/.
    PROD_ADS_RE = re.compile(
        r"^https?://img\.kleinanzeigen\.de/api/v1/prod-ads/images/[a-f0-9]{2}/([a-f0-9-]+)"
    )
    for m in RE_IMG.finditer(html):
        url = m.group(1) or m.group(2)
        if not url:
            continue
        match = PROD_ADS_RE.match(url)
        if not match:
            continue  # Werbung / UI-Icon / fremde Domain
        uuid = match.group(1)
        if uuid in seen_uuids:
            continue
        seen_uuids.add(uuid)
        # Auf größte Auflösung normalisieren ($_59 ≈ large)
        clean = url.split("?")[0] + "?rule=$_59.AUTO"
        images.append(clean)
    created_blob = strip_html(created_m.group(1)) if created_m else ""
    date_m = RE_DATE_TXT.search(created_blob)
    views_m = RE_VIEWS.search(strip_html(created_m.group(1)) if created_m else "")
    created_date = None
    if date_m:
        try:
            d, m_, y = date_m.group(1).split(".")
            created_date = f"{y}-{m_}-{d}"
        except ValueError:
            pass
    aufrufe = None  # wird per separatem fetch_aufrufe() geholt — JS-only im HTML
    # Anbieter
    an_name_m = RE_ANBIETER_NAME.search(html)
    an_typ_m = RE_ANBIETER_TYP.search(html)
    an_seit_m = RE_ANBIETER_AKTIV.search(html)
    anbieter_typ = None
    if an_typ_m:
        t = an_typ_m.group(1)
        anbieter_typ = "privat" if "Privater" in t else "gewerblich"
    anbieter_seit = None
    if an_seit_m:
        try:
            d, m_, y = an_seit_m.group(1).split(".")
            anbieter_seit = f"{y}-{m_}-{d}"
        except ValueError:
            pass
    # Dokumente (PDFs)
    dokumente: list[tuple[str, str]] = []
    for href, name in RE_DOC.findall(html):
        dokumente.append((href, strip_html(name)))
    return DetailData(
        title=title,
        price_str=price,
        locality=loc,
        desc=desc,
        details=details,
        images=images,
        created_date=created_date,
        aufrufe=aufrufe,
        reserviert=bool(RE_RESERVIERT.search(title)),
        geloescht=bool(RE_GELOESCHT.search(title)),
        anbieter_name=(
            (lambda n: None if n in _GENERIC_USER_NAMES else n)(
                strip_html(an_name_m.group(1))
            )
            if an_name_m
            else None
        ),
        anbieter_typ=anbieter_typ,
        anbieter_aktiv_seit=anbieter_seit,
        dokumente=dokumente,
    )


# ───────────────────────────────────────────────────────────────────────────
# Bilder
# ───────────────────────────────────────────────────────────────────────────


def upload_documents(kid: int, docs: list[tuple[str, str]], referer: str) -> int:
    """Lädt PDFs runter, legt sie unter kid/<idx>.pdf im Bucket ab,
    und schreibt Einträge in kleinanzeigen_dokumente. Returns Anzahl."""
    if not docs:
        return 0
    # Erst alte Einträge dieser kid löschen (Re-Import-Safe)
    sb_request("DELETE", f"rest/v1/kleinanzeigen_dokumente?kid=eq.{kid}",
               extra_headers={"Prefer": "return=minimal"})
    saved = 0
    for idx, (href, dateiname) in enumerate(docs):
        code, content = http_get(href, referer=referer, retries=1)
        if code != 200 or not content:
            log(f"    Dok {idx} fail: HTTP {code}")
            continue
        # Sanitize dateiname für Pfad
        safe = re.sub(r"[^a-zA-Z0-9._-]", "_", dateiname)[:80] or f"doc_{idx}"
        if not safe.lower().endswith(".pdf"):
            safe += ".pdf"
        path = f"{kid}/{idx:02d}_{safe}"
        # Upload zum privaten Bucket
        c2, _ = sb_request(
            "POST",
            f"storage/v1/object/kleinanzeigen-dokumente/{path}",
            body=content,
            extra_headers={"Content-Type": "application/pdf", "x-upsert": "true"},
        )
        if c2 >= 300:
            log(f"    Dok upload fail {path} HTTP {c2}")
            continue
        c3, _ = sb_request(
            "POST",
            "rest/v1/kleinanzeigen_dokumente",
            body=json.dumps({
                "kid": kid,
                "idx": idx,
                "dateiname": dateiname,
                "pfad": path,
                "herkunft_url": href,
                "bytes": len(content),
            }).encode("utf-8"),
            extra_headers={"Prefer": "return=minimal"},
        )
        if c3 < 300:
            saved += 1
        time.sleep(0.5)
    return saved


def upload_images(kid: int, image_urls: list[str], referer: str) -> tuple[str | None, list[str]]:
    """Lädt alle Bilder runter und legt sie unter <kid>/<idx>.jpg im Bucket ab."""
    paths: list[str] = []
    cover: str | None = None
    for idx, url in enumerate(image_urls):
        # CDN-URL: $_59.AUTO ist 'large'; können wir behalten.
        code, content = http_get(url, referer=referer, retries=1)
        if code != 200 or not content:
            log(f"    Bild {idx} fail: HTTP {code}")
            continue
        # ContentType anhand der URL-Endung schätzen
        ct = "image/jpeg"
        if url.lower().endswith(".png"):
            ct = "image/png"
        path = f"{kid}/{idx}.jpg"
        ok = storage_upload(path, content, ct)
        if ok:
            paths.append(path)
            if cover is None:
                cover = path
        else:
            log(f"    Storage upload fail: {path}")
        # Mini-Throttle zwischen Bildern
        time.sleep(0.5)
    return cover, paths


# ───────────────────────────────────────────────────────────────────────────
# Hauptlauf
# ───────────────────────────────────────────────────────────────────────────




def nominatim_geocode(query: str) -> tuple[float, float] | None:
    """OSM-Nominatim für freie Geocoding-Anfragen. Rate-Limit 1 req/sec,
    daher sleep nach jedem Call."""
    if not query:
        return None
    try:
        url = (
            "https://nominatim.openstreetmap.org/search?"
            + urllib.parse.urlencode({
                "q": query,
                "format": "json",
                "limit": "1",
                "countrycodes": "de",
                "addressdetails": "0",
            })
        )
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "persiusufer-crm/1.0 (alex@persiusufer.de)",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
        time.sleep(1.0)  # rate-limit
        if not data:
            return None
        return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        log(f"    Nominatim fail: {e}")
        return None



def _norm_name(n: str | None) -> str:
    """Normalisiert Ortsnamen für Vergleich: '(Mark)', 'an der Havel' etc. entfernen."""
    if not n:
        return ""
    x = n.lower()
    x = re.sub(r"\s*\([^)]*\)\s*", "", x)
    x = re.sub(r"\s+(an der|an|am|im|auf|in|bei|ob der|ob)\s+.+$", "", x)
    return x.strip()


def parse_baurecht(beschreibung: str | None) -> dict:
    """Heuristik-Parser für Baurecht-Felder aus dem Beschreibungstext."""
    if not beschreibung:
        return {}
    out: dict = {}
    b = beschreibung
    # Bauerwartungsland
    if RE_BAUERWARTUNG.search(b):
        out["bauerwartungsland"] = True
    # GRZ
    m = RE_GRZ.search(b)
    if m:
        try:
            out["grz"] = float(m.group(1).replace(",", "."))
        except ValueError:
            pass
    # GFZ
    m = RE_GFZ.search(b)
    if m:
        try:
            out["gfz"] = float(m.group(1).replace(",", "."))
        except ValueError:
            pass
    # Vollgeschosse
    m = RE_VOLLGESCH.search(b)
    if m:
        try:
            out["vollgeschosse"] = int(m.group(1))
        except ValueError:
            pass
    # B-Plan
    if RE_BPLAN_VORHANDEN.search(b):
        out["bpl_vorhanden"] = True
    m = RE_BPLAN_NUMMER.search(b)
    if m and len(m.group(1)) <= 30:
        out["bpl_nummer"] = m.group(1)
    # Erschließung
    if RE_ERSCHL_VOLL.search(b):
        out["erschliessung"] = "voll"
    elif RE_ERSCHL_TEIL.search(b):
        out["erschliessung"] = "teilweise"
    elif RE_ERSCHL_UN.search(b):
        out["erschliessung"] = "unerschlossen"
    # Teilbar
    if RE_TEILBAR.search(b):
        out["teilbar"] = True
    # §34 BauGB — Bebauung muss sich in nähere Umgebung einfügen
    if RE_PARAGRAPH_34.search(b):
        out["paragraph_34"] = True
    # Baubarkeit-Typen (Array: alle gefundenen Optionen)
    types: set[str] = set()
    for m in RE_BAUBARKEIT.finditer(b):
        token = m.group(1).lower()
        if "mehrfamilien" in token or token == "mfh":
            types.add("MFH")
        elif "doppelhaus" in token or token == "dhh":
            types.add("DHH")
        elif "einliegerwohnung" in token or "ew" in token:
            types.add("EFH/EW")
        elif "einfamilien" in token or token == "efh":
            types.add("EFH")
    if types:
        out["baubarkeit_typ"] = sorted(types)
    # Ortsteil
    m = RE_ORTSTEIL.search(b)
    if m:
        ot = m.group(1).strip()
        if ot.lower() not in ("der","die","das","ein","eine","am","im"):
            out["ortsteil_ki"] = ot
    # Grundfläche / Baufeld / Wohnfläche aus Beschreibung
    m = RE_GRUNDFLAECHE.search(b)
    if m:
        try:
            v = float(m.group(1))
            if 10 <= v <= 5000:
                out["grundflaeche_qm"] = v
        except ValueError:
            pass
    m = RE_BAUFELD.search(b)
    if m:
        try:
            v = float(m.group(1))
            if 10 <= v <= 5000:
                out["baufeld_qm"] = v
        except ValueError:
            pass
    m = RE_WOHNFLAECHE.search(b)
    if m:
        try:
            v = float(m.group(1))
            if 20 <= v <= 5000:
                out["wohnflaeche_qm"] = v
        except ValueError:
            pass
    # Kataster: Gemarkung / Flur / Flurstück
    m = RE_GEMARKUNG.search(b)
    if m:
        out["gemarkung"] = m.group(1).strip()
    m = RE_FLUR.search(b)
    if m:
        out["flur"] = m.group(1).strip()
    m = RE_FLURSTUECK.search(b)
    if m:
        fs = m.group(1).strip(" ,.")
        if fs and any(c.isdigit() for c in fs) and len(fs) <= 60:
            out["flurstueck"] = fs
    # Bauträgerfrei / -gebunden
    if RE_BAUTRAEGER_GEBUNDEN.search(b):
        out["bautraegerfrei"] = False
    elif RE_BAUTRAEGER_FREI.search(b):
        out["bautraegerfrei"] = True
    # Erbbaurecht
    if RE_ERBBAURECHT.search(b):
        out["erbbaurecht"] = True
    # Anbieter-Objekt-ID
    m = RE_ANBIETER_OBJ_ID.search(b)
    if m:
        val = m.group(1).strip()
        if val and val.lower() not in ("siehe", "anfrage", "auf", "im"):
            out["anbieter_objekt_id"] = val
    # Provisionssatz aus Beschreibung
    m = RE_PROV_SATZ.search(b)
    if m:
        val = m.group(1) or m.group(2)
        if val:
            try:
                v = float(val.replace(",", "."))
                if 0 < v < 20:
                    out["provision_satz_pct"] = v
            except ValueError:
                pass
    return out


def claude_analyse(beschreibung: str, titel: str) -> dict | None:
    """Optional: Anthropic-Claude-Call für KI-Analyse.
    Springt nur an wenn ANTHROPIC_API_KEY gesetzt. Liefert None bei Fehler.
    """
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key or not beschreibung:
        return None
    prompt = f"""Du bist Immobilien-Investor. Analysiere folgendes Inserat eines Brandenburger Baugrundstücks und gib NUR valides JSON zurück, kein Fließtext.

Titel: {titel}
Beschreibung: {beschreibung[:4000]}

Extrahiere genau diese Felder (alle optional, weglassen wenn nicht klar):
- bauerwartungsland (bool): true wenn nicht baureif, Erwartungsland, vor B-Plan
- grz (float, z.B. 0.4): Grundflächenzahl
- gfz (float, z.B. 0.8): Geschossflächenzahl
- vollgeschosse (int)
- bpl_vorhanden (bool): rechtskräftiger B-Plan vorhanden
- bpl_nummer (string)
- erschliessung (string): "voll" | "teilweise" | "unerschlossen"
- teilbar (bool)
- paragraph_34 (bool): Bebauung nach §34 BauGB — Einfügungsgebot, kein qualifizierter B-Plan
- provision_satz_pct (float, z.B. 3.57 oder 7.14): Maklerprovisionssatz in Prozent, falls in der Beschreibung genannt
- baubarkeit_typ (string): "EFH" (Einfamilienhaus), "DHH" (Doppelhaushälfte), "EFH/EW" (EFH mit Einliegerwohnung), "MFH" (Mehrfamilienhaus), "gemischt" (mehrere Optionen)
- bebaubare_flaeche_qm (float): bebaubare Grundfläche in m² (oft = Grundstücksfläche × GRZ; falls explizit in Beschreibung genannt, den genannten Wert nehmen)
- ortsteil (string): genauer Ortsteil falls in Beschreibung erwähnt (z.B. "Finkenkrug" wenn 'OT Finkenkrug' oder 'Ortsteil Finkenkrug' im Text)
- bebaubarkeit_kurz (string, max 200 Zeichen): ein Satz für den Investor
- risiken (string[]): konkrete Risiken (Altlasten, Naturschutz, Erbpacht, Hochwasser, Denkmalschutz etc.)

Antwort nur als JSON-Objekt, keine Erklärungen."""

    try:
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps({
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 600,
                "messages": [{"role": "user", "content": prompt}],
            }).encode("utf-8"),
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.loads(r.read())
        text = resp.get("content", [{}])[0].get("text", "").strip()
        # JSON aus dem Text extrahieren
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            return None
        return json.loads(m.group(0))
    except Exception as e:
        log(f"    KI-Analyse fail: {e}")
        return None



def _map_provision(raw: str | None) -> str | None:
    if not raw:
        return None
    low = raw.strip().lower()
    if "keine" in low:
        return "ohne"
    if "mit" in low and "provision" in low:
        return "mit"
    return raw

def to_db_row(item: ListItem, detail: DetailData) -> dict[str, Any]:
    plz, ort, ortsteil = parse_plz_ort(item.ort_str)
    preis_eur, preis_vb = parse_price(item.price_str or detail.price_str)
    flaeche = parse_flaeche(detail.details.get("Grundstücksfläche"))
    # Titel ohne "Reserviert •" Prefix
    clean_title = re.sub(r'^(Reserviert\s*•\s*|Gelöscht\s*•\s*)+', '', item.title or detail.title).strip()
    locality_full = detail.locality or item.ort_str or None
    # Bundesland-Präfix bei kleinanzeigen.de fälschlich im Ort drin:
    # "14641 Brandenburg - Nauen" → "14641 Nauen"
    if locality_full:
        locality_full = re.sub(
            r"(\d{5}\s+)?(Brandenburg|Berlin|Mecklenburg-Vorpommern|Sachsen|Sachsen-Anhalt)\s*-\s*",
            r"\1",
            locality_full,
        )
    # Baurecht aus Beschreibung extrahieren
    baurecht = parse_baurecht(detail.desc)
    ki = claude_analyse(detail.desc or "", detail.title or item.title or "")
    if ki:
        # KI-Werte überschreiben Heuristik (qualitativ besser)
        for k, v in ki.items():
            if v is not None and v != "":
                baurecht[k] = v
        baurecht["ki_analyse_at"] = datetime.now(timezone.utc).isoformat()

    # Geocoding: Wenn locality_full eine Straße+Hausnummer enthält → Nominatim
    geo_lat, geo_lon = None, None
    if locality_full and re.search(
        r"(?:straße|strasse|str\.?|weg|allee|platz|gasse|chaussee|ring|damm|ufer|hof|steig)\s+\d",
        locality_full,
        re.IGNORECASE,
    ):
        coords = nominatim_geocode(locality_full)
        if coords:
            geo_lat, geo_lon = coords
    # Roher Snapshot der Detail-Page in den Cache — bei Parser-Bugs später
    # lokal nach-parsbar, ohne kleinanzeigen.de erneut zu treffen.
    details_raw = {
        "title": detail.title,
        "price_str": detail.price_str,
        "locality": detail.locality,
        "desc": detail.desc,
        "details": detail.details,
        "image_urls": detail.images,
        "created_date": detail.created_date,
        "reserviert": detail.reserviert,
        "geloescht": detail.geloescht,
        "anbieter": {
            "name": detail.anbieter_name,
            "typ": detail.anbieter_typ,
            "aktiv_seit": detail.anbieter_aktiv_seit,
        },
        "dokumente": [
            {"url": href, "dateiname": name}
            for href, name in detail.dokumente
        ],
    }
    status = "aktiv"
    if detail.geloescht:
        status = "verkauft"  # gelöscht ist quasi verkauft/zurückgezogen
    elif detail.reserviert:
        status = "reserviert"
    return {
        "kid": item.adid,
        "url": f"{BASE}{item.href}",
        "href": item.href,
        "title": clean_title,
        "beschreibung": detail.desc[:8000] if detail.desc else None,
        "preis_eur": preis_eur,
        "preis_vb": preis_vb,
        "flaeche_qm": flaeche,
        "plz": plz,
        "ort": ort,
        "ortsteil": (
            ortsteil
            if ortsteil
            else (
                baurecht.get("ortsteil_ki")
                if baurecht.get("ortsteil_ki")
                and _norm_name(baurecht.get("ortsteil_ki")) != _norm_name(ort)
                else None
            )
        ),
        "locality_full": locality_full,
        "state_abbr": "BB",
        "grundstuecksart": detail.details.get("Grundstücksart"),
        "angebotsart": detail.details.get("Angebotsart"),
        "provision": _map_provision(detail.details.get("Provision")),
        "tags": item.tags,
        "status": status,
        "inserat_erstellt": detail.created_date,
        "aufrufe": detail.aufrufe,
        "anbieter_name": detail.anbieter_name,
        "anbieter_typ": detail.anbieter_typ,
        "anbieter_aktiv_seit": detail.anbieter_aktiv_seit,
        "details_raw": details_raw,
        "bauerwartungsland": baurecht.get("bauerwartungsland"),
        "grz": baurecht.get("grz"),
        "gfz": baurecht.get("gfz"),
        "vollgeschosse": baurecht.get("vollgeschosse"),
        "bpl_vorhanden": baurecht.get("bpl_vorhanden"),
        "bpl_nummer": baurecht.get("bpl_nummer"),
        "erschliessung": baurecht.get("erschliessung"),
        "teilbar": baurecht.get("teilbar"),
        "paragraph_34": baurecht.get("paragraph_34"),
        "provision_satz_pct": baurecht.get("provision_satz_pct"),
        "baubarkeit_typ": baurecht.get("baubarkeit_typ"),
        "grundflaeche_qm": (
            None
            if baurecht.get("grundflaeche_qm") is None
            or (flaeche is not None and baurecht.get("grundflaeche_qm") >= flaeche * 0.95)
            or baurecht.get("grz") is None
            else baurecht.get("grundflaeche_qm")
        ),
        "baufeld_qm": baurecht.get("baufeld_qm"),
        "wohnflaeche_qm": baurecht.get("wohnflaeche_qm"),
        "bautraegerfrei": baurecht.get("bautraegerfrei"),
        "erbbaurecht": baurecht.get("erbbaurecht"),
        "anbieter_objekt_id": baurecht.get("anbieter_objekt_id"),
        "gemarkung": baurecht.get("gemarkung"),
        "flur": baurecht.get("flur"),
        "flurstueck": baurecht.get("flurstueck"),
        "bebaubarkeit_kurz": baurecht.get("bebaubarkeit_kurz"),
        "risiken": baurecht.get("risiken"),
        "ki_analyse_at": baurecht.get("ki_analyse_at"),
        "lat": geo_lat,
        "lon": geo_lon,
        "geocoded_at": datetime.now(timezone.utc).isoformat() if geo_lat else None,
        "geocode_quelle": "nominatim" if geo_lat else None,
        "last_seen_at": datetime.now(timezone.utc).isoformat(),
    }


def fetch_existing_kids() -> set[int]:
    rows = sb_select("kleinanzeigen_grundstueck?select=kid&status=neq.verschwunden&limit=10000")
    if not rows:
        return set()
    return {int(r["kid"]) for r in rows}


# Bewusst KEIN nachträgliches Refresh fehlender Felder — jeder Detail-Fetch
# verbraucht kleinanzeigen.de-Quota (Akamai-Risiko) und inkrementiert den
# Aufrufe-Counter unnötig. Beim Erst-Import wird alles in den Cache geschrieben;
# bei bekannten Akten nur leichtes Refresh (last_seen_at + Preis).


def run_scan(*, kaufen_only: bool = True, hard_limit: int | None = None) -> None:
    log(f"=== marktscan_kleinanzeigen start (mode={SCAN_MODE}, max_pages={MAX_PAGES}, "
        f"kaufen_only={kaufen_only}, hard_limit={hard_limit}) ===")
    existing = fetch_existing_kids()
    log(f"Bekannte aktive Akten in DB: {len(existing)}")

    seen_today: set[int] = set()
    new_count = 0
    update_count = 0
    fail_count = 0
    full_scan = (SCAN_MODE == "full")   # nur im full-Mode dürfen wir "verschwunden" markieren
    consecutive_known = 0   # für since-Mode

    for page in range(1, MAX_PAGES + 1):
        if hard_limit and new_count >= hard_limit:
            log(f"hard_limit {hard_limit} erreicht, Abbruch (verschwunden-Mark übersprungen)")
            full_scan = False
            break
        if SCAN_MODE == "since":
            url = (
                LIST_TPL_NEUESTE_PAGE1.format(base=BASE)
                if page == 1
                else LIST_TPL_NEUESTE.format(base=BASE, n=page)
            )
        else:
            url = LIST_TPL_PAGE1.format(base=BASE) if page == 1 else LIST_TPL.format(base=BASE, n=page)
        log(f"--- Seite {page} ---")
        code, html_bytes = http_get(url, referer=f"{BASE}/")
        if code != 200:
            log(f"  Listing fail: HTTP {code} — Abbruch")
            full_scan = False
            break
        html = html_bytes.decode("utf-8", errors="replace")
        items = parse_listing(html)
        log(f"  Inserate gefunden: {len(items)}")
        if not items:
            break

        for item in items:
            if kaufen_only:
                # filtert spätestens beim Detail aus; Listing zeigt nicht Angebotsart
                pass
            seen_today.add(item.adid)
            is_new = item.adid not in existing

            if not is_new:
                # Bekannte Akte → nur leichtes Refresh, KEIN Detail-Re-Fetch
                preis_eur, preis_vb = parse_price(item.price_str)
                sb_update(
                    "kleinanzeigen_grundstueck",
                    f"kid=eq.{item.adid}",
                    {
                        "last_seen_at": datetime.now(timezone.utc).isoformat(),
                        **({"preis_eur": preis_eur} if preis_eur is not None else {}),
                        **({"preis_vb": preis_vb} if preis_eur is not None else {}),
                    },
                )
                update_count += 1
                # since-Mode: konsekutiv bekannte Inserate zählen
                if SCAN_MODE == "since":
                    consecutive_known += 1
                    if consecutive_known >= SINCE_STOP_AFTER:
                        log(f"  since-Mode: {SINCE_STOP_AFTER} konsekutiv bekannte → STOP")
                        full_scan = False
                        # break inner loop, then outer
                        break
                continue
            # neue Akte gefunden → Zähler resetten
            if SCAN_MODE == "since":
                consecutive_known = 0

            # neu → Detail + Bilder
            log(f"  NEU {item.adid} {item.title[:60]}")
            throttle()
            code2, det_bytes = http_get(f"{BASE}{item.href}", referer=url)
            if code2 != 200:
                log(f"    Detail HTTP {code2}")
                fail_count += 1
                continue
            try:
                detail = parse_detail(det_bytes.decode("utf-8", errors="replace"))
            except Exception as e:
                log(f"    Parse-Fehler: {e}")
                fail_count += 1
                continue

            if kaufen_only and detail.details.get("Angebotsart") not in (None, "", "Kaufen"):
                log(f"    skip Angebotsart={detail.details.get('Angebotsart')}")
                continue

            row = to_db_row(item, detail)

            # Aufrufe nachladen (Ajax-Endpoint, da im HTML leer)
            aufrufe = fetch_aufrufe(item.adid, referer=f"{BASE}{item.href}")
            if aufrufe is not None:
                row["aufrufe"] = aufrufe

            # Bilder hochladen
            cover, paths = upload_images(item.adid, detail.images, referer=f"{BASE}{item.href}")
            row["cover_bild_path"] = cover
            row["bilder_paths"] = paths
            row["bilder_anzahl"] = len(paths)

            # Dokumente hochladen (PDFs)
            dok_anzahl = upload_documents(item.adid, detail.dokumente, referer=f"{BASE}{item.href}")
            row["dokumente_anzahl"] = dok_anzahl

            code3 = sb_upsert("kleinanzeigen_grundstueck", [row])
            if code3 < 300:
                new_count += 1
                existing.add(item.adid)
                log(f"    ✓ inserted ({len(paths)} Bilder)")
            else:
                fail_count += 1
                log(f"    ✗ upsert fail HTTP {code3}")

            throttle()

        # since-Mode: nach inner-break auch outer-break
        if SCAN_MODE == "since" and consecutive_known >= SINCE_STOP_AFTER:
            break

        if len(items) < 25:
            log("  (Weniger als 25 Treffer — letzte Seite)")
            break

        # Random-Pause zwischen Listing-Seiten (Alex' Wunsch: ~10 s)
        page_throttle()

    # Verschwundene NUR nach vollständigem Scan markieren
    vanished_count = 0
    if full_scan:
        vanished = existing - seen_today
        if vanished:
            log(f"--- {len(vanished)} Akten als 'verschwunden' markieren ---")
            v_list = list(vanished)
            for i in range(0, len(v_list), 100):
                batch = v_list[i:i + 100]
                sb_update(
                    "kleinanzeigen_grundstueck",
                    f"kid=in.({','.join(map(str, batch))})",
                    {"status": "verschwunden"},
                )
            vanished_count = len(vanished)
    else:
        log("--- Scan war partiell (hard_limit/HTTP-fail) — kein verschwunden-Markieren ---")

    log(f"=== Done. Neu: {new_count}, Updated: {update_count}, Fail: {fail_count}, "
        f"Verschwunden: {vanished_count} ===")


if __name__ == "__main__":
    hard = int(os.environ.get("HARD_LIMIT", "0")) or None
    run_scan(kaufen_only=True, hard_limit=hard)
