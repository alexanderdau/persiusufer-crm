# PDF-Bilder & Grundstücks-Luftbilder (lokale Backfill-Tools)

Lokale Python-Skripte (nur stdlib + Pillow) für den Bild-Backfill. Nutzen
`SUPABASE_SERVICE_ROLE_KEY` aus der Umgebung (`.env.local`), kein hartcodiertes Secret.

- **backfill3.py** `<limit>` — extrahiert eingebettete JPEGs aus Gutachten/Exposé-PDFs
  (`pdfimages`), fügt gekachelte Fotos kantenbasiert zusammen, entfernt Duplikate
  (höchste Auflösung behalten), klassifiziert je Akte mit Haiku (foto_aussen/innen,
  grundriss, lageplan_flurkarte; logo/tabelle raus), Cover nach Objekttyp, schreibt
  nach Bucket `zvg-bilder` + `bilder_paths`/`cover_bild_path` + `zvg_akte_bild.kind`.
- **aerials.py** `<STATE> <limit>` — amtliche DOP-Luftbilder (Open-Data-WMS je Land)
  für Grundstücke mit Koordinaten; setzt cover_bild_path. Kartenquelle: NW/BY/SN/TH/NI/ST
  konfiguriert (WMS-Dict im Skript).

Voraussetzung: `pdfimages` (poppler), `pdftoppm`, Pillow. Lange Läufe in Etappen
(idempotent: verarbeitete Akten via `bilder_extraction_at` überspringen).
