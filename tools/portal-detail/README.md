# portal-detail — Detail-Enrichment für zvg-portal.de

Holt pro Akte die **Detailseite** (`showZvg`) von zvg-portal.de und speichert in
`zvg_akte`:

- **`portal_detail_text`** — vollständiger Detail-Text (von der Aktenzeichen-Zeile
  bis zum Exposé). Enthält Felder, die das Listing **nicht** hat:
  *Art der Versteigerung*, *Grundbuch*, Sachverständigen-Beschreibung inkl.
  *Wohnfläche*, *Exposé*-Link.
- **`is_teilung`** — abgeleitet aus „Art der Versteigerung": enthält der Text
  „…zum Zwecke der Aufhebung der Gemeinschaft" → `true` (Teilungsversteigerung),
  sonst `false` (Forderungsversteigerung).

Zusammen mit `portal_listing_text` (vom Listing-Scan in `portal-ingest`) liegt
damit der komplette Roh-Text je Akte vor — Basis für eine spätere, bessere
strukturierte Auswertung (z. B. per LLM) ohne erneutes Scrapen.

## So funktioniert der Zugriff (wichtig)

`showZvg` liefert nur Inhalt, wenn ALLE drei Bedingungen erfüllt sind:

1. **Browser-artige Header** (`User-Agent` Mozilla, `Accept`, `Accept-Language: de`)
   — ohne sie kommt nur eine leere Hülle bzw. „error". (Cookies braucht es NICHT.)
2. In derselben Session lief vorher eine **Suche** (etabliert den Kontext IP-seitig),
   und der Detail-Request trägt **`Referer: …?button=Suchen`**.
3. Die **aktuelle** `zvg_id` — die wechselt bei Termin-Verlegung. Wir matchen die
   Akte per **`az_norm`** gegen das Live-Listing und nehmen die dort gelistete ID.
   (Die in der DB gespeicherte `zvg_portal_id` veraltet und gibt sonst „error".)

**Abgelaufene Termine sind unwiederbringlich weg** (vom Portal entfernt, kein
Zugriff per ID mehr) — daher cachen wir, solange der Termin in der Zukunft liegt.

Effizienz: Suche **pro Bundesland** (leeres `ger_id` + `all=1` nach Priming) liefert
das ganze Bundesland in einem Request → ~16 Suchen statt ~400 Gerichts-Suchen.

Läuft als Skript (wie `tools/unika/`), nicht als Edge-Function — könnte aber mit
denselben Headern auch serverless laufen; der Skript-Weg war für den zeitkritischen
Erst-Backfill der schnellste.

## Aufruf

```bash
SUPABASE_SERVICE_ROLE_KEY=... python3 tools/portal-detail/enrich.py [LIMIT]
```

- `LIMIT` = max. Akten pro Lauf (Default 200).
- **Resumierbar:** verarbeitet nur Akten mit `portal_detail_text IS NULL`,
  aktive zuerst (nach Termin). Mehrfach aufrufen, bis alles befüllt ist.
- **Gedrosselt** (`SLEEP = 0.7s` zwischen Requests), nach Gericht gruppiert
  (Suche je Gericht nur 1×).

## Hinweis Rate-Limiting

zvg-portal.de drosselt IPs bei zu vielen schnellen Anfragen (Symptom: Suche
liefert 0 Treffer, kein PHPSESSID-Cookie, leere 6809-Byte-Seite). Dann von einer
anderen IP laufen lassen oder eine Weile warten. `SLEEP` nicht zu klein setzen.
