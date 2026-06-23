## Stand vom 2026-06-23

### Ziel des Projekts

Persiusufer-CRM (`crm.persiusufer.de`, Netlify+Supabase): React-Admin-basiertes Backoffice
für Zwangs-/Teilungsversteigerungs-Investments. Hauptdomäne `zvg_akte` —
~3.500 bundesweite ZVG-Verfahren mit Marktscan, Dokument-Backfill, automatischer
Bewertungs-Inferenz (Haiku), Statusanfragen an Vollstreckungsgerichte und Karten-Ansicht.

### Was in dieser Session erledigt wurde

**Mail-Versand-Pipeline komplett umgebaut:**
- `zvg-anfrage-send` v10 mit eigenem `RawSmtpClient` (Deno.connectTls) — denomailer
  raus, weil dessen multipart-Wrapper bei Justiz-Mailclients (Cochem) als roher
  MIME-Quelltext angezeigt wurde. Jetzt simple `text/plain; charset=UTF-8` mit
  quoted-printable Body.
- `asciifySubject()` ersetzt Sonderzeichen (`·` → `-`, `§` → `Paragraph`, Umlaute
  → `ae/oe/ue/ss`). Kein `=?utf-8?Q?...?=`-Encoding mehr.
- Mail-Body komplett umgeschrieben: schlank, mit Magic-Link statt Tabelle.
  Signatur jetzt mit "Alexander Dau" über "Persiusufer Verwaltungs GmbH".
- SMTP-Passwort wurde während Session rotiert (siehe Memory).

**Magic-Link-Form auf eigener Subdomain `anfrage.persiusufer.de`:**
- DNS-CNAME bei All-Inkl (KAS) auf `persius-crm.netlify.app` (gleiche Netlify-Site).
- `netlify/edge-functions/anfrage.ts`: Host-Check, bei `anfrage.*` HTML-Form,
  sonst `context.next()` → CRM-Bundle.
- URL-Schema `https://anfrage.persiusufer.de/<token>` — 22-Zeichen-Token aus
  `generate_reply_token()` PG-Function.
- POST schreibt strukturiert in `zvg_anfrage` (gleicher Mechanismus wie Mail-Reply-Parser).
- Env-Vars `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in Netlify gesetzt.
- Frontend `StatusanfrageButton.tsx`: generiert Token clientseitig (crypto.getRandomValues),
  baut Link, INSERT mit Token.

**Reply-Parser-Hardening:**
- `zvg-anfrage-reply` v5: Auto-Reply-Detection (RFC 3834 Auto-Submitted-Header
  + Subject- und Body-Pattern), MIME-Multipart-Parser, Token-First-Lookup
  (`[#PU-{zid}]`), AZ-Normalisierung.
- Auto-Replies (z.B. Ahaus eDA-Hinweis) werden geloggt aber setzen den Status
  NICHT auf "beantwortet".

**Batch-Versand:**
- `zvg-anfrage-batch-send` v2: synchroner Insert-Loop für Entwürfe (schnell),
  SMTP-Aufrufe via `EdgeRuntime.waitUntil()` im Hintergrund. Sofort 202 zurück,
  kein Browser-Timeout mehr.
- Frontend: Top-Toolbar-Button respektiert Multi-Select (selectedIds vor data).

**ZvgAkteList stark erweitert:**
- Multi-Select-Checkboxen (`bulkActionButtons` aktiviert).
- Spalten "Amtsgericht" (`ag_name_raw`) und "Anfrage" (zweifarbige Pille
  Versand/Antwort).
- Neue Pillen-Spalten mit Icon-Headern: Geringstes Gebot (Gavel), Fotos
  (Camera), Dokumente (Files), Gutachten/Exposé (BookText, G grün/E gelb/G€ grau),
  Geo-Präzision (Globe2 Header, Punkt-mit-Kreisen).
- Layout breiter: `Layout.tsx` von `max-w-screen-xl` auf `w-full`.
- Filter-Sidebar: Bundesländer alphabetisch, Termin von/bis (Von füllt leeres
  Bis automatisch), Status mit Tristate-Toggle (aus/ist/ist-nicht),
  Verkehrswert von/bis + k.A.-Tristate, Filter-Inputs auf max-w-[10rem].
- View-Toggle Liste/Karte (`ZvgAkteMap.tsx` mit Leaflet + OpenStreetMap,
  lädt alle gefilterten Akten mit Coords als Marker).

**Backend-Erweiterungen (DB-Schema):**
- `zvg_akte`: `letzte_anfrage_*` (4 Spalten + Trigger), `vkw_unbekannt`
  (generated boolean), `hat_gutachten_lokal`, `hat_expose_lokal`, `dokumente_count`,
  `fotos_count`, `bilder_extraction_*`, `geocoding_precision`, `geocoding_at`.
- `zvg_anfrage`: `reply_token`, `reply_token_used_at`, `reply_form_views_count`,
  `reply_form_first_viewed_at`.
- Neue Tabellen: `zvg_akte_bild` (extrahierte PDF-Bilder), `de_plz_centroid`
  (DE-PLZ-Centroids, Befüllung läuft).
- Trigger auf `zvg_akte_dokumente` und `zvg_akte_bild` halten denormalisierte
  Counts/Booleans aktuell.

**Mojibake-Reparatur:**
- `portal-ingest` v3: Decoder `iso-8859-1` → `utf-8` (zvg-portal.de liefert
  trotz `<meta>`-Lüge UTF-8).
- DB-Reparatur per `convert_from(convert_to(text, 'LATIN1'), 'UTF8'))`-Roundtrip:
  548 strasse, 390 ag_name_raw, 216 ort, 138 objektart bereinigt. Bei 28
  Mixed-Encoding-Zeilen Replace-Tabelle benötigt. Subagent hat die Reparatur durchgeführt.

**Portal-Ingest-Fix (vorheriger Bug):**
- `portal-ingest` v2/v3: bei existierender Akte UPDATE statt skip. Vorher gingen
  Portal-VKW-Werte für bereits per zvg.com angelegte Akten verloren.

**Geocoding-Pipeline:**
- Edge Function `geocode-akten` v3: Nominatim mit `countrycodes=de`, `bounded=1`,
  DE-Bounding-Box-Check (lat 47.20–55.10, lon 5.80–15.10).
- 4-Stufen-Fallback: Straße+Hausnr → Straße → PLZ+Ort → nur Ort.
- Bricht früh ab bei präzisem Treffer (place_rank-basiert).
- `precisionFromRank()` mappt Nominatim auf 5 Stufen: house/street/postcode/city/region.
- No-match-Sentinel: lat=-1, lon=-1 (in der Map ausgeblendet via `.gt('objekt_lat', -1)`).
- Cron alle 2 Min, batch=30.

**PDF-Bild-Extraktion (Option B, Backend deployed, noch nicht produktiv):**
- Bucket `zvg-akte-bilder` angelegt.
- Tabelle `zvg_akte_bild` mit FK auf `zvg_akte` und `zvg_akte_dokumente`.
- Edge Function `extract-bilder-aus-pdf` v1: pdfjs-dist via esm.sh, extrahiert
  JPEG-XObjects ≥300x200px aus Gutachten/Exposé-PDFs.
- Noch keine Akte verarbeitet (kein Cron). pdfjs in Deno ist technisch
  Wackelpartie — erster Test-Lauf hat aufgrund Tool-Verbindungsproblem nicht
  abgeschlossen.

### Aktueller Zustand

**Läuft produktiv:**
- Mail-Versand (Einzel + Batch), Tor-Token-Zuordnung, IMAP-Polling (Cron alle 10 Min).
- Magic-Link-Form unter https://anfrage.persiusufer.de/.
- Portal-Ingest mit VKW-Updates (Cron alle 3 Min, jeder volle Durchlauf ~63 Min).
- Geocoding (Cron alle 2 Min, 920 von ~3.000 Akten erfasst, ca. 90 Min noch
  bis voller Durchlauf, no_match-Quote ca. 28% — verbessert sich mit PLZ-Fallback).
- Portal-Backfill für Dokumente (2.910 von 3.076 aktiven Akten haben mindestens
  ein Dokument).

**Getestet:**
- Mail-Versand mit drei AGs (Hitzler, Fragola, plus Auto-Reply von Ahaus).
- Magic-Link-Form rendert sauber, JS-State-Toggle für Radio-Buttons.
- Geocoding mit DE-Bounding-Check (keine Treffer außerhalb DE).

**Provisorisch / ungetestet:**
- PDF-Bild-Extraktion: Edge Function deployed, **noch nie ausgeführt**. pdfjs-dist
  in Deno Edge Function ist unsicher; ggf. muss auf Haiku-Vision-Fallback
  gewechselt werden.
- PLZ-Centroid-Tabelle: 2.565 von 10.813 PLZ geladen, Subagent-Lauf wurde
  unterbrochen — muss fortgesetzt werden (6 SQL-Files unter `/tmp/plz_insert_*.sql`,
  davon Files 02–05 noch offen).
- Geocoder v4 mit PLZ-Centroid-Fallback noch nicht gebaut.

### Offene Punkte / nächste Schritte

**Priorisiert (hoch zu niedrig):**

1. **ZvgAkteShow erweitern** (Alex-Wunsch aus der Sitzungs-Endphase):
   - Adresse im Objekt-Bereich mit zusätzlicher Bundesland-Zeile
   - Gemarkung/Flur/Flurstück anzeigen (erstes Flurstück, falls mehrere) —
     **erfordert vorher Datenquelle:** entweder Haiku-Extraktion aus Gutachten
     oder ALKIS-WMS-GetFeatureInfo aus lat/lon (siehe `fetch_flurdaten.py`-Skript).
     Auf jeden Fall: DB-Spalten `gemarkung`, `flur`, `flurstueck` zu `zvg_akte`
     hinzufügen.
   - Objekt-Bereich editierbar machen (Klärung vor Umsetzung: Inline-Edit vs.
     Modal mit Form?)
   - Verfahren-Bereich editierbar (analog).

2. **PLZ-Centroid-Befüllung abschließen** + Geocoder v4 mit Fallback.
   - 8.248 PLZ-Zeilen noch zu laden (Files `/tmp/plz_insert_02.sql` bis `05.sql`).
   - Edge Function geocode-akten v4: bei Nominatim-no_match → DB-Lookup
     `de_plz_centroid` → setze coords mit precision='postcode'.
   - Ergibt voraussichtlich ≥95% Coverage statt aktuell ~70%.

3. **PDF-Bild-Extraktion produktiv schalten:**
   - Manuellen 3er-Probelauf der `extract-bilder-aus-pdf`-Function machen.
   - Wenn pdfjs-dist crasht oder keine Images findet → Fallback auf
     Anthropic Vision (Haiku) bauen.
   - Wenn erfolgreich: Cron einrichten + Frontend (Galerie in ZvgAkteShow).

4. **Reverse-Geocoding für BB-Akten:** vorhandenen `fetch_flurdaten.py`-Approach
   als Edge Function umsetzen — nimmt lat/lon (von Geocoder), fragt ALKIS-WMS
   `GetFeatureInfo` ab, schreibt Gemarkung/Flur/Flurstück in zvg_akte. Nur für
   BB-Akten (62 Stück).

5. **Foto-Pille erscheint, sobald PDF-Extraction läuft.**

### Wichtige Entscheidungen & Begründungen

**Mail-Format text/plain ohne multipart:**
denomailer wickelt jede Mail in multipart/mixed → multipart/alternative ein,
auch ohne Attachments. AG Cochem konnte das nicht parsen und antwortete mit
"die anliegende Mail kann hier nicht weiterverarbeitet werden, da diese nicht
lesbar ist". Eigener raw-SMTP-Client baut simple text/plain, wird von jedem
Mail-Client der letzten 30 Jahre verstanden.

**Subject ASCII-only via asciifySubject:**
=?utf-8?Q?...?=-Encoding wird über >75 Zeichen mit `=\n`-Soft-Breaks
fortgesetzt. Manche Mail-Gateways (insb. Justiz) parsen das fehlerhaft.
ASCII-Approximation umgeht das komplett.

**Magic-Link auf eigener Subdomain statt direkt Supabase Edge Function URL:**
Supabase Edge Functions kommen mit `content-type: text/plain` und CSP-Sandbox
(`default-src 'none'; sandbox`) — Browser rendert das HTML als reinen Text
statt als Seite. Plus: `anfrage.persiusufer.de` baut Vertrauen, eine
Supabase-co-URL nicht.

**Token im Subject + Message-ID:**
AZ ist nur AG-lokal eindeutig. Mit Token `[#PU-{zid}]` plus Message-ID
`<pu-{zid}.{timestamp}@persiusufer.de>` ist die Reply-Zuordnung über alle
407 AGs hinweg eindeutig. AZ-Fallback nur bei eindeutigem Match.

**Async-Pattern mit `EdgeRuntime.waitUntil` für SMTP-Versand:**
Synchrones Warten auf SMTP-Round-Trip führt zu Browser-Timeouts bei
Batch-Versand. Function returnt sofort 202, SMTP läuft im Hintergrund weiter.
Browser pollt Status via DB.

**Denormalisierte Spalten + Trigger statt JOIN-Views:**
Pillen (Foto-Count, Dokument-Count, hat_gutachten_lokal etc.) sind in
`zvg_akte` als Spalten gepflegt mit Trigger auf die jeweilige Quell-Tabelle.
Frontend kann die Daten in einem Query laden, ohne JOIN-Performance-Probleme
in der Liste.

**Geocoding mit DE-Bounding-Box-Hardlimit:**
Nominatim's `countrycodes=de`-Hint ist nicht zuverlässig genug; manche
Treffer-Datensätze haben den falschen country_code. Dreifache Sicherheit:
viewbox+bounded=1 im Request, country_code-Check, lat/lon-Range-Check.

**Foto-Pille gelb für Exposé:**
Visuell warnen, dass Exposé nur Teilinformation ist (typisch ohne SV-Gutachten,
ohne Hausnummer-genaue Beschreibung). G grün = Vollgutachten, E gelb = nur
Exposé, kein Gutachten.

### Stolperfallen / Dinge, die NICHT funktioniert haben

**Supabase Edge Functions können kein HTML ausliefern:**
Egal welcher Content-Type-Header gesetzt wird, Supabase zwingt `text/plain` +
`content-security-policy: sandbox`. Browser rendert keinen HTML. → Auf
Netlify Edge Functions gewechselt.

**leaflet :has(input:checked) funktioniert nicht in älteren Safari:**
Visuelles Feedback der Radio-Selektion im Magic-Link-Form klappte nicht.
JS-State-Toggle als robust-Lösung.

**ASCII vs. typografische Anführungszeichen in AdminPage.tsx:**
"Alle „keine PDFs"-Markierungen..." — das öffnende `„` war U+201E, das
schließende `"` war ASCII U+0022. JS-String wurde mitten im Text geschlossen
→ Build-Failure. War vorher schon im Typecheck-Log, kam erst zum Crash beim
neuen /admin-Tab. Fix: Anführungen entfernt.

**Header.tsx startsWith auf string|false:**
`currentPath` konnte `false` sein (kein matchPath-Match). `false.startsWith()`
crashed zur Laufzeit. Fix: matchPath-Klausel für `/admin/*` und
`/zvg_anfrage/*` ergänzt + typeof-Guard.

**Portal-Ingest hat existing Akten geskipped:**
Akten via zvg.com-Marktscan ohne VKW landeten in der DB. Portal-Ingest fand
sie, sagte "skipped_existing", und der VKW-Wert aus zvg-portal.de wurde nie
geschrieben. Fix: UPDATE statt skip.

**zvg-portal.de liefert UTF-8 trotz `<meta charset=ISO-8859-1>`:**
Resultat: ~1.300 Akten mit Mojibake (`KÃ¶ln` statt `Köln`). Fix: Decoder
auf utf-8 umstellen + DB-Reparatur via convert_from(convert_to(_,'LATIN1'),'UTF8').

**Brandenburg-Geobasis hat keinen offenen Forward-Geocoder:**
`search.geobasis-bb.de/dog/...`-Endpoints antworten mit 500. Der Viewer macht
seine Adress-Suche gegen einen internen, nicht dokumentierten Endpoint. Wir
können nur Reverse-Geocoding via ALKIS-WMS-GetFeatureInfo (lat/lon →
Flurstück), kein Forward-Geocoding (Adresse → lat/lon).

**fetch_flurdaten.py ist KEIN Forward-Geocoder:**
Skript nimmt vorhandene lat/lon und holt Gemarkung/Flur/Flurstück. Nicht
geeignet, um aus Anschriften Coords zu erzeugen — anderes Problem.

**pdf-parse / pdf-lib / pdfjs in Deno Edge Function:**
PDF-Image-Extraction in Deno ist nicht out-of-the-box stabil. Worker-Issues,
keine Canvas-API. Mit `disableWorker: true` + `useSystemFonts: false` ggf.
machbar, aber noch nicht verifiziert. Anthropic-Vision-Fallback bleibt als
Plan B.

### Relevante Dateien & Pfade

**Frontend-Hauptdateien:**
- `src/components/atomic-crm/zvgAkten/ZvgAkteList.tsx` — Liste mit allen
  Filter, Pillen-Spalten, View-Toggle, Tri-State-Status, Date-Picker,
  Verkehrswert-Filter.
- `src/components/atomic-crm/zvgAkten/ZvgAkteMap.tsx` — Leaflet-Karte mit
  Filter-Übernahme.
- `src/components/atomic-crm/zvgAkten/ZvgAkteShow.tsx` — Detail-Ansicht.
  **TODO:** Bundesland in Adresse, Gemarkung/Flur/Flurstück, editierbar.
- `src/components/atomic-crm/zvgAkten/StatusanfrageButton.tsx` — Einzelversand-
  Modal mit Vorschau, Token-Generation clientseitig.
- `src/components/atomic-crm/zvgAkten/BatchAnfrageButton.tsx` — Batch-Versand
  + Bulk-Action.
- `src/components/atomic-crm/zvgAkten/index.ts` — Type-Definition `ZvgAkte`.
- `src/components/atomic-crm/admin/AdminPage.tsx` — Backfill-Steuerung.
- `src/components/atomic-crm/layout/Layout.tsx` — `w-full`-Wrapper.
- `src/components/atomic-crm/layout/Header.tsx` — Navigation mit
  /admin + /zvg_anfrage matchPath.
- `netlify/edge-functions/anfrage.ts` — Magic-Link-HTML-Form.
- `netlify.toml` — Edge-Function-Routing für `/*`.

**Supabase Edge Functions:**
- `zvg-anfrage-send` v10 — RawSmtpClient, ASCII-Subject, Token+MessageID.
- `zvg-anfrage-reply` v5 — Auto-Reply-Detection, MIME-Multipart-Parser,
  Token-First-Lookup.
- `zvg-anfrage-batch-send` v2 — Async-Pattern mit EdgeRuntime.waitUntil.
- `zvg-anfrage-imap-poll` v3 — IMAP-Reader, Word-Boundary-Login-Fix.
- `portal-ingest` v3 — UTF-8-Decoder, UPDATE statt skip.
- `geocode-akten` v3 — Nominatim mit DE-Bounding-Box, 4-Stufen-Fallback,
  Präzisions-Tracking.
- `extract-bilder-aus-pdf` v1 — pdfjs-dist (UNGETESTET).
- `extract-geringstes-gebot` v6 — Haiku-Inferenz aus Anordnung/Gutachten.
- `backfill-portal-dokumente` v6 — 6-Worker-Parallel-Backfill.
- `backfill-admin` v1 — Admin-Steuerung.

**PG-Functions:**
- `normalize_az(text)` — AZ-Format-Normalisierung.
- `generate_reply_token()` — 22-Zeichen Magic-Link-Token.
- `parse_justizadressen_html(text)` — Adress-Parser.
- `import_justizadressen_records(state, jsonb)` — AG-Upsert.
- `reserve_backfill_akten(p_limit int)` — FOR UPDATE SKIP LOCKED.

**DB-Schema-Erweiterungen in dieser Session:**
- `zvg_akte`: letzte_anfrage_id/status/am/option, vkw_unbekannt, fotos_count,
  bilder_extraction_at/count/error, dokumente_count, hat_gutachten_lokal,
  hat_expose_lokal, geocoding_precision, geocoding_at.
- `zvg_anfrage`: reply_token, reply_token_used_at, reply_form_views_count,
  reply_form_first_viewed_at, sent_copy_info JSONB.
- Neue Tabellen: `zvg_akte_bild`, `de_plz_centroid`.
- Trigger: `refresh_zvg_akte_letzte_anfrage`, `refresh_zvg_akte_hat_gutachten`,
  `refresh_zvg_akte_dokumente_count`, `refresh_zvg_akte_fotos_count`.

**Outputs-Skripte (außerhalb Repo, auf User-Maschine):**
- `/uploads/fetch_flurdaten.py` — Reverse-Geocoding via ALKIS-WMS (Vorlage
  für künftige BB-Flurstücks-Anreicherung).
- `/tmp/plz_insert_00.sql` bis `_05.sql` — PLZ-Insert-Chunks für
  `de_plz_centroid` (Files 02-05 noch zu importieren).

**Workspace (iCloud):**
- `Grundstücke/CLAUDE.md` — Working Memory (Methodik, aktive Verfahren).
- `Grundstücke/Versteigerungen/<AZ> <Ort>/` — Ablage-Konvention pro Verfahren.
- `Grundstücke/Grundstuecksmarktberichte_Brandenburg/2025/` — 17 BB-Marktberichte.
- `Grundstücke/persiusufer_healthcheck_2026-05-22.md` — System-Check.

**Cron-Jobs (`cron.job`):**
- jobid=2 `zvg_anfrage_imap_poll_10min` — alle 10 Min IMAP-Poll.
- jobid=3 `portal-ingest-cron` — alle 3 Min, batch=20.
- jobid=8 `geocode-akten-cron` — alle 2 Min, batch=30.

**Netlify Site:** `persius-crm` mit Custom Domains `crm.persiusufer.de` und
`anfrage.persiusufer.de`. Env-Vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`VITE_SUPABASE_URL`, `VITE_SB_PUBLISHABLE_KEY`.

**Supabase Project:** `ujiiaqvwpnniaasdhyrb` (eu-west-1). Connected via MCP.
