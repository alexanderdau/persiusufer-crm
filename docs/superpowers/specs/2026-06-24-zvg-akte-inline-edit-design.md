# ZvgAkteShow — Inline-Edit & Bundesland-Zeile

**Datum:** 2026-06-24
**Status:** Genehmigt (Design), bereit für Implementierungsplanung
**Kontext:** Handover-Prio #1 (Rest) — Objekt-/Verfahren-Bereich aus der Show-Ansicht heraus bearbeitbar machen, plus Bundesland in der Adresse.

## Ziel

Schnelle Einzelkorrektur einzelner Felder direkt in `ZvgAkteShow`, ohne Wechsel auf die separate Edit-Seite. Die bestehende Edit-Seite (`ZvgAkteEdit`) bleibt unverändert für größeres Nachpflegen und für Referenz-Felder.

## Nicht-Ziele (YAGNI)

- Keine Inline-Bearbeitung der Referenz-Felder (Amtsgericht, Rechtspfleger, Sachverständige) — die brauchen Auswahl-Picker und bleiben auf der Edit-Seite.
- Kein Bearbeiten von `state_abbr` (Bundesland) — beeinflusst AG-Zuordnung/Filter, bewusst read-only.
- Keine DB-Änderung — alle Felder existieren bereits auf `zvg_akte`.

## Ansatz

**A — Klick-to-Edit pro Feld.** Jedes editierbare Feld zeigt im Ruhezustand den formatierten Wert + dezentes Stift-Icon (bei Hover sichtbar). Klick schaltet das Feld in einen Inline-Input mit Speichern (✓) / Abbrechen (✗). Kein Modal, kein Seitenwechsel.

## Komponenten

Neue Datei: `src/components/atomic-crm/zvgAkten/InlineEditField.tsx`

### `InlineEditField`
Wiederverwendbare Einzelfeld-Komponente.

- **Props:** `source: string`, `label: string`, `type: "text" | "number" | "multiline" | "datetime"`, optional `format?: (v) => string` (Anzeige, z. B. EUR/Datum), `parse?: (s) => unknown` (Eingabe → DB-Wert).
- **Ruhezustand:** formatierter Wert (oder „—"); Stift-Icon bei Hover.
- **Edit-Zustand:** shadcn `Input`/`Textarea` je nach `type`; ✓ und ✗ Buttons.
- **Tastatur:** `Esc` = abbrechen; `Enter` = speichern (bei `multiline`: `Cmd/Strg+Enter`).
- **Nur ein unabhängiger Edit pro Feld** — Felder beeinflussen sich nicht gegenseitig.

### `InlineEditAddress`
Spezialfall Adresse (5 Teilfelder).

- Anzeige: bestehende `addrSummary` + Google-Maps-Pille (unverändert).
- Edit: kompakter Editor mit Straße, Hausnummer, PLZ, Ort, Ortsteil; speichert alle Felder in **einem** Update.

## Daten & Speichern

- **Hook:** `useUpdate("zvg_akte", { id: record.zid, data: { [source]: value }, previousData: record })` aus `ra-core`.
- **Modus:** pessimistisch (auf Server warten); ✓-Button zeigt Lade-/Disabled-Zustand.
- **Feedback:** `useNotify` — Erfolg „Gespeichert", Fehler mit Meldung. React-Query aktualisiert den Datensatz automatisch (kein manuelles Reload).
- **RLS:** Update-Policy auf `zvg_akte` existiert bereits (verifiziert).

### Editierbare Felder

| Karte | Feld | `source` | type |
|-------|------|----------|------|
| Objekt | Adresse | (5 Teilfelder via `InlineEditAddress`) | — |
| Objekt | Objektart | `objektart` | text |
| Objekt | Art | `art` | text |
| Objekt | Beschreibung | `obj_beschreibung` | multiline |
| Objekt | Gemarkung | `gemarkung` | text |
| Objekt | Flur | `flur` | text |
| Objekt | Flurstück | `flurstueck` | text |
| Objekt | Flurstücksgröße | `flurstueck_groesse_qm` | number |
| Verfahren | Termin | `termin` | datetime |
| Verfahren | Verkehrswert | `vkw_eur` | number (EUR-Format) |
| Verfahren | Gutachten-Preis | `gpreis_eur` | number (EUR-Format) |

Adress-Teilfelder: `objekt_strasse`, `objekt_hausnummer`, `objekt_plz`, `objekt_ort`, `objekt_ortsteil`.

## Bundesland-Zeile

Neue **read-only** `Row label="Bundesland"` in der Objekt-Karte, abgeleitet aus `record.state_abbr` über das vorhandene `states`-Mapping (Kürzel → voller Name, z. B. „BB" → „Brandenburg"). Fällt zurück auf das Kürzel bzw. „—", wenn nicht gemappt.

## Edge Cases

- Leeres Feld → als `null` speichern (nicht `""`), damit „—"-Anzeige und Filter konsistent bleiben.
- Zahl-Eingabe: deutsche Schreibweise (Komma als Dezimaltrenner) tolerieren; leeres Feld → `null`.
- `datetime`: `<input type="datetime-local">`; Wert ↔ ISO-String konvertieren.
- Speicher-Fehler: Feld bleibt im Edit-Zustand mit eingegebenem Wert, Fehler-Notify.

## Tests

Vitest für `InlineEditField` (dataProvider gemockt):
1. Rendert formatierten Anzeigewert.
2. Klick öffnet Eingabefeld mit aktuellem Wert.
3. ✓ ruft `update` mit `{ [source]: value }`.
4. ✗ / `Esc` verwirft, kein `update`.
5. Leerer Wert wird als `null` gespeichert.

## Betroffene Dateien

- **Neu:** `src/components/atomic-crm/zvgAkten/InlineEditField.tsx` (+ Test).
- **Geändert:** `src/components/atomic-crm/zvgAkten/ZvgAkteShow.tsx` — Objekt-/Verfahren-Karten verwenden `InlineEditField`/`InlineEditAddress`, neue Bundesland-Row.
- **Unverändert:** `ZvgAkteEdit.tsx`, `index.ts` (Typen vorhanden).
