# Handoff: Vereinheitlichung der ZVG-Ingestion auf den Server-seitigen Weg

**Erstellt:** 2026-06-25 · **Für:** Claude Code · **Supabase-Projekt:** `ujiiaqvwpnniaasdhyrb` (eu-west-1)
**Status:** **Phase 1 ausgeführt & verifiziert (2026-06-25)** — 61 Dubletten gemergt, `UNIQUE(az_norm, ag_company_id)` aktiv, Backup in `_merge_backup_zvg_akte_dups_20260625` (122 Zeilen). Phase 2 (`ingest-zvgcom`) offen, Phase 3 (Cowork-Cutover) danach.

---

## 0. Entscheidung & Ziel

Aktuell gelangen ZVG-Daten über **zwei parallele Wege** in `zvg_akte`, was zu Doppel-Schreibzugriffen und 61 Dubletten geführt hat. Entscheidung (Alex, 2026-06-25): **Der führende Weg wird server-seitig.**

Zielbild — genau **zwei** server-seitige Writer, beide via pg_cron, App-unabhängig:

| Quelle | Writer (Ziel) | Status |
|---|---|---|
| zvg-portal.de | Edge `portal-ingest` (pg_cron jobid 3, alle 3 Min) | **läuft bereits** |
| zvg.com | Edge `ingest-zvgcom` (neu zu bauen + pg_cron) | **muss gebaut werden** |

Die **Cowork-Marktscans** (`marktscan-zvg`, `marktscan-zvg-backfill`, `marktscan-portal-backfill`) werden danach abgeschaltet.

Ein einziger erzwungener fachlicher Schlüssel: `UNIQUE(az_norm, ag_company_id)`.

---

## 1. Verifizierter Ist-Zustand (Stand 2026-06-25)

### Tabelle `zvg_akte`
- **PK = `zid` (text)**. 3.631 Zeilen gesamt.
- `zid`-Schema: zvg.com-Akten = numerische zvg.com-Objektnummer (z. B. `211097`); zvg-portal.de-Akten = `'p'` + `zvg_portal_id` (z. B. `p48682`).
- Verteilung: **2.862 Portal-zid**, **769 zvg.com-zid**, 3.100 mit `zvg_portal_id`.
- Fachlicher Schlüssel: `(az_norm, ag_company_id)` — **nur App-seitig**, **kein DB-Constraint**.

### FK-Kinder von `zvg_akte.zid` (echte FKs)
`zvg_akte_dokumente`, `zvg_akte_favoriten`, `zvg_anfrage`, `zvg_akte_bild`.

Zusätzliche Tabellen/Views mit `zid`-Spalte (vor Merge prüfen, ob Tabelle oder View):
`zvg_akte_detail`, `zvg_akte_letzte_anfrage` (Name legt View nahe — `\d+` prüfen, Views nicht umhängen).

### Schreibende Prozesse heute
- **pg_cron jobid 3** `portal-ingest-cron` (`*/3 * * * *`) → Edge `portal-ingest` (zvg-portal.de). Schreibt nur Listing-Felder, **keine** Dokumente. Persistenter Cursor in `portal_ingest_state`.
- **pg_cron jobid 8** `geocode-akten-cron` (jede Min) — unbeteiligt, bleibt.
- **Cowork Scheduled Tasks** (laufen in der Cowork-Sandbox, schreiben **direkt per PostgREST mit Service-Role**):
  - `marktscan-zvg` — zvg.com, Mo–Fr 9/12/15/18, Round-Robin 9 BL, inkl. Detail-Fetch (PDFs+Bilder → Storage).
  - `marktscan-zvg-backfill` — stündlich, Detail-Backfill für zvg.com-Akten ohne `objektart`.
  - `marktscan-portal-backfill` — zvg-portal.de, Mo–Fr 9/12/15/18.

### Portal-Spalten in `zvg_akte`
`zvg_portal_id` (int), `zvg_portal_land_abk` (text), `zvg_portal_last_updated` (tstz, aktuell nicht aktiv gepflegt), `vkw_eur_zvg_portal` (numeric).

---

## 2. Phase 1 — Dubletten mergen + Unique-Constraint (DB-only)

### Analyse-Ergebnis (verifiziert)
- **61 Dubletten-Gruppen** mit gleichem `(az_norm, ag_company_id)` = 122 Zeilen.
  - **54×** zvg.com-zid **+** Portal-zid (die echten Cross-Portal-Kollisionen).
  - **7×** zvg.com-zid **+** zvg.com-zid.
  - 0× Portal+Portal.
- **Keine manuellen Entscheidungsdaten** in diesen Zeilen: 0× `triage_note`, 0× `deal_id`, 0× `bietreichweite_eur`.
- Status nur `neu`/`aufgehoben` (System-Status). `stop_reason` 25× (deckt sich mit `aufgehoben`). `notify_email` 122× (uniformer Default, nicht diskriminierend).
- Kindzeilen: **0 Anfragen**, **1 Favorit** (umhängen). Dokumente/Bilder auf beiden Seiten möglich → vereinigen + entdoppeln.

→ Merge ist **mechanisch und risikoarm**. Kein manueller Entscheid nötig.

### Diagnose-Queries (zum Re-Verifizieren vor Ausführung)
```sql
-- Dubletten-Gruppen + Überzahl
select count(*) gruppen, coalesce(sum(c)-count(*),0) zu_viel
from (select az_norm, ag_company_id, count(*) c from zvg_akte
      where az_norm is not null and ag_company_id is not null
      group by 1,2 having count(*)>1) t;

-- Sicherstellen: keine User-Entscheidungsdaten in Dubletten
with d as (select az_norm,ag_company_id from zvg_akte
  where az_norm is not null and ag_company_id is not null group by 1,2 having count(*)>1)
select count(*) filter (where a.triage_note is not null) triage,
       count(*) filter (where a.deal_id is not null) deal,
       count(*) filter (where a.bietreichweite_eur is not null) bietr
from zvg_akte a join d using(az_norm,ag_company_id);
-- erwartet: 0 / 0 / 0
```

### Merge-Regel
1. **Kanonische Zeile je Gruppe**: höchste „Richness" (`dokumente_count + fotos_count`) → dann zvg.com vor Portal → dann ältester `first_seen`.
2. Portal-Felder (`zvg_portal_id`, `vkw_eur_zvg_portal`, `zvg_portal_land_abk`) und `vkw_eur`/`termin` per `coalesce` auf die kanonische Zeile ziehen (nie überschreiben, nur füllen).
3. Endstatus = `aufgehoben`, wenn **eine** Seite aufgehoben ist (konservativ — Live-Ingester korrigiert ohnehin), sonst Status der kanonischen Zeile.
4. Kindzeilen vom Verlierer auf die kanonische `zid` umhängen, **danach Dubletten entdoppeln** (Dokumente nach `(art, storage_path)`, Bilder nach `storage_path`).
5. Verlierer-Zeile löschen.
6. `UNIQUE(az_norm, ag_company_id)` anlegen.

> Storage-Objekte bleiben liegen (z. B. `zvg-documents/p48682/…`); die umgehängte Kindzeile referenziert weiterhin den alten Pfad — kein Datei-Move nötig.

### Vorgeschlagene Migration (review + ausführen)
```sql
begin;

-- Backup ALLER betroffenen Akten-Zeilen (voll reversibel)
create table if not exists _merge_backup_zvg_akte_dups_20260625 as
select a.* from zvg_akte a
join (select az_norm, ag_company_id from zvg_akte
      where az_norm is not null and ag_company_id is not null
      group by 1,2 having count(*)>1) d using(az_norm, ag_company_id);

-- Mapping canon <- loser
create temp table _grp on commit drop as
with d as (select az_norm, ag_company_id from zvg_akte
           where az_norm is not null and ag_company_id is not null
           group by 1,2 having count(*)>1),
ranked as (
  select a.zid, a.az_norm, a.ag_company_id,
    row_number() over (partition by a.az_norm, a.ag_company_id
      order by (coalesce(a.dokumente_count,0)+coalesce(a.fotos_count,0)) desc,
               (a.zid ~ '^p') asc,            -- false (zvg.com) zuerst
               a.first_seen asc nulls last) rn
  from zvg_akte a join d using(az_norm, ag_company_id))
select c.zid canon, l.zid loser
from ranked c join ranked l using(az_norm, ag_company_id)
where c.rn=1 and l.rn>1;

-- Portal-/Volatil-Felder auf canon ziehen
update zvg_akte c set
  zvg_portal_id       = coalesce(c.zvg_portal_id, l.zvg_portal_id),
  vkw_eur_zvg_portal  = coalesce(c.vkw_eur_zvg_portal, l.vkw_eur_zvg_portal),
  zvg_portal_land_abk = coalesce(c.zvg_portal_land_abk, l.zvg_portal_land_abk),
  vkw_eur             = coalesce(c.vkw_eur, l.vkw_eur),
  termin              = coalesce(c.termin, l.termin),
  status     = case when 'aufgehoben' in (c.status, l.status) then 'aufgehoben' else c.status end,
  stop_reason= coalesce(c.stop_reason, l.stop_reason)
from _grp m join zvg_akte l on l.zid=m.loser
where c.zid=m.canon;

-- Kinder umhängen + entdoppeln
update zvg_akte_dokumente x set zid=m.canon from _grp m
  where x.zid=m.loser and not exists (select 1 from zvg_akte_dokumente y
    where y.zid=m.canon and y.art=x.art and coalesce(y.storage_path,'')=coalesce(x.storage_path,''));
delete from zvg_akte_dokumente x using _grp m where x.zid=m.loser;

update zvg_akte_bild x set zid=m.canon from _grp m
  where x.zid=m.loser and not exists (select 1 from zvg_akte_bild y
    where y.zid=m.canon and y.storage_path=x.storage_path);
delete from zvg_akte_bild x using _grp m where x.zid=m.loser;

update zvg_akte_favoriten x set zid=m.canon from _grp m
  where x.zid=m.loser and not exists (select 1 from zvg_akte_favoriten y
    where y.zid=m.canon /* ggf. + and y.user_id=x.user_id */);
delete from zvg_akte_favoriten x using _grp m where x.zid=m.loser;

update zvg_anfrage x set zid=m.canon from _grp m where x.zid=m.loser;

-- zvg_akte_detail: nur falls TABLE (nicht View). Vorher \d+ prüfen!
-- update zvg_akte_detail x set zid=m.canon from _grp m
--   where x.zid=m.loser and not exists (select 1 from zvg_akte_detail y where y.zid=m.canon);
-- delete from zvg_akte_detail x using _grp m where x.zid=m.loser;

-- Verlierer löschen
delete from zvg_akte a using _grp m where a.zid=m.loser;

-- Schlüssel erzwingen
alter table zvg_akte add constraint zvg_akte_aznorm_ag_uniq unique (az_norm, ag_company_id);

commit;
```

### Akzeptanzkriterien Phase 1
- Diagnose-Query liefert `gruppen=0`.
- `zvg_akte_aznorm_ag_uniq` existiert.
- Keine verwaisten Kindzeilen (`zid` ohne passende `zvg_akte`-Zeile).
- Backup-Tabelle vorhanden.

---

## 3. Phase 2 — Edge Function `ingest-zvgcom` (live) bauen

`supabase/functions/ingest-zvgcom/index.ts` ist aktuell ein **deaktivierter Stub** (gibt 410 zurück). Neu implementieren.

### Vorlagen im Repo
- **Struktur-Template:** `supabase/functions/portal-ingest/index.ts` (Cursor-State, Token-Guard, Match-Map, NULL-schonende Updates, batch-Budget).
- **Fachlogik-Quelle:** `workspace/Grundstücke/Versteigerungen/marktscan_zvg_v2.py` (800 Zeilen) — die vollständige zvg.com-Logik inkl. Detail-Fetcher.

### Anforderungen
1. **Listing-API:** `GET https://www.zvg.com/v2024/termine.prg?act=getGridJson&id_b={bl}&sort=a` für die 9 bedienten Bundesländer. `id_b`-Liste (aus dem Script, `SLOT_DEFAULT`): `[2, 3, 4, 5, 6, 8, 9, 10, 12]`.
2. **Detail-Fetch** für neue/zu aktualisierende `zid`:
   - PDFs `expose`, `anordnung`, `biethinweis`, `glaeubiger` → Bucket **`zvg-documents/{zid}/`**, plus Zeilen in `zvg_akte_dokumente`.
   - Cover + Galerie-Bilder → Bucket **`zvg-bilder/{zid}/`** (+ `cover_bild_path`/`bilder_paths`).
   - `detail_json` aggregiert die Rohdaten.
   > Das ist der Mehraufwand ggü. `portal-ingest` (das keine Dokumente lädt). Logik 1:1 aus `marktscan_zvg_v2.py` (`fetch_detail`, Doc-Liste ab Zeile ~441, Stop-Logik ab ~516) übernehmen.
3. **Upsert nach `zvg_akte`:** Konflikt-Key = **`zid`** (zvg.com-Objektnummer), `Prefer: resolution=merge-duplicates`. Bei bestehenden Akten **nur volatile Felder** schreiben; **User-Felder schützen**: `status`, `triage_note`, `deal_id`, `bietreichweite_eur`, `notify_email`, FKs, `geringstes_gebot_*` etc. NIE überschreiben (siehe Schutzliste im Script-Header und in `portal-ingest`).
4. **`az_norm`/`ag_company_id`** korrekt setzen (Normalisierung wie `azNormV2` in `portal-ingest`), damit der neue `UNIQUE`-Constraint nicht verletzt wird und Cross-Portal-Akten gematcht statt dupliziert werden. Bei Treffer auf eine bereits existierende Portal-Akte (`p…`) gleichen `(az_norm, ag_company_id)`: **die zvg.com-Variante als kanonisch behandeln** (Portal-Felder mergen) statt neue Zeile anlegen — sonst verstößt der Insert gegen den Constraint.
5. **Stop-Logik:** `terminAufgehoben=1` oder seit >48 h nicht mehr im Listing → `status='aufgehoben'` + `stop_reason`. (Nur Akten, die nicht schon einen manuellen Status tragen.)
6. **State + Cron:** eigener Cursor-State (z. B. Tabelle `zvgcom_ingest_state` analog `portal_ingest_state`), Round-Robin über die 9 BL, `batch`/Budget-Param. pg_cron-Job per Migration:
   ```sql
   select cron.schedule('ingest-zvgcom-cron', '*/5 * * * *', $$
     select net.http_post(
       url => 'https://ujiiaqvwpnniaasdhyrb.supabase.co/functions/v1/ingest-zvgcom?token=<NEUER_TOKEN>&batch=2',
       headers => '{"Content-Type":"application/json"}'::jsonb,
       timeout_milliseconds => 120000);
   $$);
   ```
7. **Auth:** Token-Guard im Function-Body wie `portal-ingest` (Konstante oder besser `Deno.env`-Secret). `verify_jwt=false` für den Cron-Aufruf. Service-Role kommt automatisch aus `SUPABASE_SERVICE_ROLE_KEY` (Edge-Env).

### Akzeptanzkriterien Phase 2
- Manueller Aufruf zieht für ein BL neue Akten korrekt (Listing + Detail + Docs/Bilder in Storage + `zvg_akte_dokumente`).
- Re-Run ist idempotent, keine Constraint-Verletzung, keine User-Feld-Überschreibung.
- Cron läuft stabil über mehrere Durchläufe, Cursor wandert.
- Dokument-/Bild-Counts (`dokumente_count`, `fotos_count`) via bestehende Trigger aktuell.

---

## 4. Phase 3 — Cowork-Marktscans abschalten (KOORDINIERT)

**Wichtig:** Die drei Cowork-Tasks sind **Cowork Scheduled Tasks**, kein Repo-/DB-Artefakt — Claude Code kann sie nicht deaktivieren. Das macht die Cowork-Seite (Alex/Claude in Cowork) über das Scheduled-Tasks-Tool, **erst nachdem Phase 2 produktiv bewiesen ist**.

Abzuschaltende Tasks: `marktscan-zvg`, `marktscan-zvg-backfill`, `marktscan-portal-backfill`.
(Die Kleinanzeigen-Tasks `marktscan-kleinanzeigen*` bleiben — separater Workflow.)

Bis dahin laufen sie weiter, damit die Erfassung **nie aussetzt**. Claude Code meldet, sobald Phase 2 die Akzeptanzkriterien erfüllt; dann Cutover.

**Nach Cutover prüfen:** Schreibt wirklich nur noch `portal-ingest` + `ingest-zvgcom` in `zvg_akte`? (z. B. `last_seen`-Frische pro Quelle, keine Lücken in zvg.com-BL.)

---

## 5. Stolperfallen & Hinweise

- **Reihenfolge zwingend:** Phase 1 (Merge) **vor** Constraint, Constraint **vor/mit** Phase 2 (sonst kann `ingest-zvgcom` Dubletten neu erzeugen). Phase 3 zuletzt.
- **Secrets nicht committen:** Service-Role-Key und Tokens nicht in Repo-Dateien schreiben. Für `ingest-zvgcom` einen neuen Token als Secret/Env nutzen. Der `portal-ingest`-Token steht bereits als Konstante in dessen Quelle — Muster, nicht Vorbild.
- **NULL-Semantik:** `UNIQUE(az_norm, ag_company_id)` erlaubt mehrere Zeilen mit NULL (Postgres behandelt NULLs als verschieden) — Akten ohne `az_norm` blockieren sich nicht.
- **`zvg_akte_detail` / `zvg_akte_letzte_anfrage`:** vor dem Umhängen mit `\d+` klären, ob Tabelle oder View. Views nicht anfassen.
- **Favoriten-Dedupe:** ggf. echten Unique-Key der Tabelle (`zid` + `user_id`?) berücksichtigen — Schema vor dem Delete prüfen.
- **Doc/Bild-Dedupe** nach `storage_path`, weil dieselbe Datei sonst doppelt in der Galerie erscheint.

---

## 6. Reihenfolge-Checkliste

1. [x] Diagnose-Queries re-verifizieren (Zahlen oben). — 61 Gruppen / 0 manuelle Daten bestätigt.
2. [x] `zvg_akte_detail`/`zvg_akte_letzte_anfrage` Tabelle-vs-View klären; Favoriten-Unique prüfen. — beide **Views** (nicht angefasst); Favoriten-PK `(zid, sales_id)` → Dedup auf `sales_id`.
3. [x] Phase-1-Migration ausgeführt (atomar, mit Backup). Hinweis: `zvg_portal_id` ist UNIQUE → Reihenfolge angepasst (Verlierer erst löschen, dann Portal-Felder auf canon ziehen).
4. [x] Akzeptanz Phase 1 geprüft: Restdubletten 0, Constraint aktiv, 0 verwaiste Kinder, Akten 3.631→3.570.
5. [ ] `ingest-zvgcom` implementieren (Template `portal-ingest` + Logik `marktscan_zvg_v2.py`).
6. [ ] Manuell testen (1 BL), dann pg_cron aktivieren.
7. [ ] Akzeptanz Phase 2 über mehrere Cron-Läufe prüfen.
8. [ ] Cowork-Seite informieren → Cutover Phase 3 → Verifikation.
