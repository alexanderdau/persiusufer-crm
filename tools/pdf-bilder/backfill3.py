#!/usr/bin/env python3
"""PDF-Bild-Backfill v3: extrahiert alle Bilder, klassifiziert sie per Haiku
(ein Call pro Akte), speichert mit kind, Cover nach Objekttyp.
Usage: backfill3.py <limit>
"""
import base64, glob, json, os, subprocess, sys, tempfile, time, urllib.request, urllib.parse
from PIL import Image

SB = "https://ujiiaqvwpnniaasdhyrb.supabase.co"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HDR = {"Authorization": f"Bearer {KEY}", "apikey": KEY}
MODEL = "claude-haiku-4-5-20251001"
LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else 8
MIN_W, MIN_H, MAX_IMGS = 300, 200, 10

# Anzeige-/Sortier-Präferenz nach Objekttyp
ORDER_LAND = ["lageplan_flurkarte", "foto_aussen", "foto_innen", "grundriss", "sonstiges"]
ORDER_BLD = ["foto_aussen", "foto_innen", "grundriss", "lageplan_flurkarte", "sonstiges"]
DROP = {"logo", "tabelle_diagramm"}

PROMPT = (
    "Diese Bilder stammen aus einem Immobilien-Exposé/Gutachten, in Reihenfolge nummeriert ab 1. "
    "Klassifiziere JEDES in genau eine Kategorie: foto_aussen, foto_innen, grundriss, "
    "lageplan_flurkarte, tabelle_diagramm, logo, sonstiges. "
    "Antworte NUR mit einem JSON-Array der Kategorie-Strings in Bild-Reihenfolge."
)


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


def anthropic_key():
    return api("GET", "/rest/v1/app_anthropic_config?select=api_key")[0]["api_key"]


def dims(path):
    try:
        out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path],
                             capture_output=True, text=True, timeout=20).stdout
        w = h = 0
        for line in out.splitlines():
            if "pixelWidth" in line: w = int(line.split(":")[1])
            if "pixelHeight" in line: h = int(line.split(":")[1])
        return w, h
    except Exception:
        return 0, 0


def _edge(im, top):
    """Mittelwert-Pixel der obersten/untersten Zeile (für Kantenvergleich)."""
    w, h = im.size
    y = 0 if top else h - 1
    row = [im.getpixel((x, y)) for x in range(0, w, max(1, w // 64))]
    return row


def _edges_match(a_bottom, b_top):
    if len(a_bottom) != len(b_top):
        n = min(len(a_bottom), len(b_top))
        a_bottom, b_top = a_bottom[:n], b_top[:n]
    if not a_bottom:
        return False
    diff = 0
    for pa, pb in zip(a_bottom, b_top):
        diff += sum(abs(x - y) for x, y in zip(pa, pb))
    avg = diff / (len(a_bottom) * 3)
    return avg < 18  # kleine Differenz => durchgehendes Bild


def stitch_tiles(cand):
    """cand: Liste (path, art, w, h) in Extraktions-Reihenfolge.
    Fügt aufeinanderfolgende gleichbreite Streifen zusammen, wenn die
    angrenzenden Kanten zusammenpassen (echtes gekacheltes Foto)."""
    from PIL import Image
    groups = []  # Liste von Listen zusammengehöriger Bilder
    for c in cand:
        if not groups:
            groups.append([c])
            continue
        prev = groups[-1][-1]
        same_doc = prev[1] == c[1]
        same_w = abs(prev[2] - c[2]) <= 2
        if same_doc and same_w:
            try:
                pa = Image.open(prev[0]).convert("RGB")
                pb = Image.open(c[0]).convert("RGB")
                if _edges_match(_edge(pa, False), _edge(pb, True)):
                    groups[-1].append(c)
                    continue
            except Exception:
                pass
        groups.append([c])
    out = []
    for g in groups:
        if len(g) == 1:
            out.append(g[0])
            continue
        # vertikal zusammenfügen
        from PIL import Image as I
        imgs = [I.open(x[0]).convert("RGB") for x in g]
        w = min(im.width for im in imgs)
        parts = [im.resize((w, int(im.height * w / im.width))) if im.width != w else im for im in imgs]
        H = sum(im.height for im in parts)
        merged = I.new("RGB", (w, H), "white")
        y = 0
        for im in parts:
            merged.paste(im, (0, y)); y += im.height
        mpath = g[0][0] + ".stitched.jpg"
        merged.save(mpath, "JPEG", quality=90)
        out.append((mpath, g[0][1], w, H))
    return out


def ahash(path):
    """Average-Hash (64 bit) zum Erkennen gleicher Bilder in versch. Auflösung."""
    try:
        im = Image.open(path).convert("L").resize((8, 8))
    except Exception:
        return None
    px = list(im.getdata())
    avg = sum(px) / len(px)
    bits = 0
    for i, p in enumerate(px):
        if p >= avg:
            bits |= 1 << i
    return bits


def hamming(a, b):
    return bin(a ^ b).count("1")


def dedupe_keep_largest(cand):
    """cand: Liste (f, art, w, h). Behält pro Duplikat-Gruppe nur das größte."""
    out, hashes = [], []
    for c in sorted(cand, key=lambda c: -(c[2] * c[3])):  # größtes zuerst
        h = ahash(c[0])
        if h is not None and any(hamming(h, hh) <= 5 for hh in hashes):
            continue  # Duplikat eines bereits behaltenen, größeren Bildes
        if h is not None:
            hashes.append(h)
        out.append(c)
    return out


def classify_batch(paths, akey):
    content = []
    for p in paths:
        with open(p, "rb") as f:
            content.append({"type": "image", "source": {"type": "base64",
                            "media_type": "image/jpeg",
                            "data": base64.standard_b64encode(f.read()).decode()}})
    content.append({"type": "text", "text": PROMPT})
    body = {"model": MODEL, "max_tokens": 200,
            "messages": [{"role": "user", "content": content}]}
    req = urllib.request.Request("https://api.anthropic.com/v1/messages",
                                 data=json.dumps(body).encode(), method="POST")
    req.add_header("x-api-key", akey)
    req.add_header("anthropic-version", "2023-06-01")
    req.add_header("content-type", "application/json")
    with urllib.request.urlopen(req, timeout=120) as r:
        txt = json.loads(r.read())["content"][0]["text"]
    s = txt[txt.find("["): txt.rfind("]") + 1]
    labels = json.loads(s)
    return [str(x).strip().lower() for x in labels]


def storage_dl(bucket, path, dest):
    req = urllib.request.Request(f"{SB}/storage/v1/object/{bucket}/{urllib.parse.quote(path)}")
    for k, v in HDR.items(): req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as fh:
        fh.write(r.read())


def storage_up(zid, localfile, idx):
    dest = f"{zid}/extract_{idx}.jpg"
    with open(localfile, "rb") as fh:
        data = fh.read()
    req = urllib.request.Request(f"{SB}/storage/v1/object/zvg-bilder/{urllib.parse.quote(dest)}",
                                 data=data, method="POST")
    for k, v in HDR.items(): req.add_header(k, v)
    req.add_header("Content-Type", "image/jpeg")
    req.add_header("x-upsert", "true")
    urllib.request.urlopen(req, timeout=120).read()
    return dest, len(data)


def is_land(objektart):
    o = (objektart or "").lower()
    return any(t in o for t in ["grundstück", "grundstueck", "unbebaut", "bauland",
                                "acker", "wald", "wiese", "garten"]) and \
        not any(t in o for t in ["haus", "wohnung", "gebäude", "gebaeude"])


def process(akte, akey):
    zid = akte["zid"]
    docs = api("GET", f"/rest/v1/zvg_akte_dokumente?zid=eq.{urllib.parse.quote(zid)}"
               "&art=in.(gutachten,expose)&storage_path=not.is.null"
               "&select=art,storage_path,bucket&order=art.asc")
    cand = []  # (localpath, art, w, h)
    with tempfile.TemporaryDirectory() as td:
        for d in (docs or []):
            if len(cand) >= MAX_IMGS: break
            pdf = os.path.join(td, "in.pdf")
            try:
                storage_dl(d.get("bucket") or "zvg-documents", d["storage_path"], pdf)
            except Exception:
                continue
            outdir = os.path.join(td, f"o{len(cand)}"); os.makedirs(outdir, exist_ok=True)
            try:
                subprocess.run(["pdfimages", "-j", pdf, os.path.join(outdir, "img")],
                               capture_output=True, timeout=180)
            except Exception:
                continue
            for f in sorted(glob.glob(os.path.join(outdir, "*.jpg"))):
                if len(cand) >= MAX_IMGS: break
                w, h = dims(f)
                if w < MIN_W or h < MIN_H: continue
                ar = w / h if h else 0
                if ar < 0.5 or ar > 3.0: continue
                cand.append((f, d["art"], w, h))
        if not cand:
            return [], []
        cand = stitch_tiles(cand)  # gekachelte Fotos (Streifen) wieder zusammenfügen
        cand = dedupe_keep_largest(cand)  # Duplikate raus, größte Auflösung behalten
        labels = classify_batch([c[0] for c in cand], akey)
        # zu (path,art,w,h,kind), Drop logo/tabelle
        items = []
        for (f, art, w, h), lab in zip(cand, labels):
            kind = lab if lab in (ORDER_BLD + ["tabelle_diagramm", "logo"]) else "sonstiges"
            if kind in DROP: continue
            items.append({"f": f, "art": art, "w": w, "h": h, "kind": kind})
        if not items:
            return [], []
        order = ORDER_LAND if is_land(akte.get("objektart")) else ORDER_BLD
        items.sort(key=lambda it: (order.index(it["kind"]) if it["kind"] in order else 99,
                                   -(it["w"] * it["h"])))
        # Upload in sortierter Reihenfolge
        rows = []
        for i, it in enumerate(items):
            try:
                dest, sz = storage_up(zid, it["f"], i)
            except Exception:
                continue
            rows.append({"zid": zid, "source_doc_art": it["art"], "storage_path": dest,
                         "bucket": "zvg-bilder", "page_index": 0, "image_index": i,
                         "width": it["w"], "height": it["h"], "size_bytes": sz,
                         "mime_type": "image/jpeg", "kind": it["kind"]})
        return rows, [r["storage_path"] for r in rows]


def main():
    akey = anthropic_key()
    zid_filter = ""
    if len(sys.argv) > 2 and not sys.argv[2].isdigit():
        zid_filter = f"&zid=eq.{urllib.parse.quote(sys.argv[2])}"
    cands = api("GET", "/rest/v1/zvg_akte?select=zid,cover_bild_path,bilder_paths,objektart"
                "&or=(hat_gutachten_lokal.eq.true,hat_expose_lokal.eq.true)"
                f"{zid_filter}&bilder_extraction_at=is.null&limit={LIMIT}")
    print(f"Kandidaten: {len(cands or [])}", flush=True)
    done = imgs = errs = 0
    for a in (cands or []):
        zid = a["zid"]
        try:
            rows, paths = process(a, akey)
            # alte Metadaten dieser Akte ersetzen
            api("DELETE", f"/rest/v1/zvg_akte_bild?zid=eq.{urllib.parse.quote(zid)}",
                extra={"Prefer": "return=minimal"})
            if rows:
                api("POST", "/rest/v1/zvg_akte_bild", body=rows, extra={"Prefer": "return=minimal"})
            existing = [p for p in (a.get("bilder_paths") or []) if "/extract_" not in p]
            patch = {"bilder_extraction_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                     "bilder_extraction_count": len(paths),
                     "bilder_paths": existing + paths}
            cur = a.get("cover_bild_path")
            cur_ext = bool(cur) and "/extract_" in cur
            if paths and (not cur or cur_ext):
                patch["cover_bild_path"] = paths[0]
            elif not paths and cur_ext:
                patch["cover_bild_path"] = None
            api("PATCH", f"/rest/v1/zvg_akte?zid=eq.{urllib.parse.quote(zid)}",
                body=patch, extra={"Prefer": "return=minimal"})
            done += 1; imgs += len(paths)
            kinds = ",".join(r["kind"] for r in rows) if rows else "-"
            print(f"  {zid}: {len(paths)} [{kinds}]", flush=True)
        except Exception as e:
            errs += 1
            print(f"  {zid}: FEHLER {e}", flush=True)
    print(f"FERTIG: {done} Akten, {imgs} Bilder, {errs} Fehler", flush=True)


if __name__ == "__main__":
    main()
