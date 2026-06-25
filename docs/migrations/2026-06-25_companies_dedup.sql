-- ============================================================================
-- Companies-Dedup (Amtsgerichte) + resultierende Akten-Merges
-- Erstellt: 2026-06-25 · Projekt ujiiaqvwpnniaasdhyrb
--
-- PROBLEM: 54 Amtsgerichte existieren doppelt in `companies` (je ein Datensatz
-- mit Portal-ID [portal-ingest] und einer ohne [zvg.com per Name]). Dadurch
-- bekommt dasselbe Gericht zwei ag_company_id -> UNIQUE(az_norm, ag_company_id)
-- greift nicht -> Cross-Portal-Dubletten (z. B. 76 K 86/25 Schöneberg: 211429
-- [zvg.com, ag 148] + p14370 [Portal, ag 267]).
--
-- FIX: pro Namens-Gruppe eine kanonische Company; alle FKs (contacts, deals,
-- zvg_akte, zvg_anfrage) umhängen; Verlierer löschen; danach die jetzt
-- kollidierenden Akten mergen (verlustfrei via coalesce). Alles in EINER
-- Transaktion, mit Backup-Tabellen (voll reversibel).
--
-- ENTSCHEIDUNGEN (vor Ausführung bestätigen):
--  (1) Kanonische Company = die mit den MEISTEN Akten; Gleichstand: die mit
--      zvg_portal_ag_id, dann kleinste id. Portal-ID wird per coalesce auf
--      canon gezogen (portal-ingest findet sie weiter).
--  (2) Kanonische Akte = bevorzugt MIT Cover/objektart (zvg.com-Enrichment),
--      dann Richness, dann zvg.com vor Portal. Alle Enrichment-/Portal-Felder
--      werden per coalesce auf canon gezogen (kein Datenverlust).
--  (3) STATUS-Konflikt: ist eine Seite 'aufgehoben', wird canon 'aufgehoben'
--      (konservativ, wie Phase 1). Die Live-Ingester korrigieren das beim
--      nächsten Scan. -> Falls stattdessen canon-Status behalten gewünscht:
--      die markierte Zeile unten anpassen.
-- ============================================================================
begin;

-- ───────────────────────── Backups ─────────────────────────
create table if not exists _dedup_backup_companies_20260625 as
  select c.* from companies c
  where c.sector = 'Amtsgericht'
    and c.name in (select name from companies where sector='Amtsgericht'
                   group by name having count(*) > 1);

create table if not exists _dedup_backup_zvg_akte_20260625 as
  select * from zvg_akte
  where ag_company_id in (select id from _dedup_backup_companies_20260625);

-- ───────────────────────── A) Company-Dedup ─────────────────────────
-- Mapping kanonische Company <- Verlierer
create temp table _cmap on commit drop as
with d as (select name from companies where sector='Amtsgericht'
           group by name having count(*) > 1),
ranked as (
  select c.id, c.name, c.zvg_portal_ag_id,
    row_number() over (partition by c.name order by
      (select count(*) from zvg_akte a where a.ag_company_id = c.id) desc,
      (c.zvg_portal_ag_id is not null) desc,
      c.id asc) rn
  from companies c join d using(name) where c.sector='Amtsgericht')
select cc.id as canon, l.id as loser, l.zvg_portal_ag_id as l_pid
from ranked cc join ranked l using(name)
where cc.rn = 1 and l.rn > 1;

-- Constraint kurz droppen (sonst Kollision beim Umhängen)
alter table zvg_akte drop constraint if exists zvg_akte_aznorm_ag_uniq;

-- Alle FKs umhängen Verlierer -> canon
update contacts    x set company_id    = m.canon from _cmap m where x.company_id    = m.loser;
update deals       x set company_id    = m.canon from _cmap m where x.company_id    = m.loser;
update zvg_anfrage x set ag_company_id = m.canon from _cmap m where x.ag_company_id = m.loser;
update zvg_akte    x set ag_company_id = m.canon from _cmap m where x.ag_company_id = m.loser;

-- Verlierer-Companies löschen
delete from companies c using _cmap m where c.id = m.loser;

-- Portal-ID auf canon ziehen (NACH dem Löschen → kollisionsfrei, l_pid aus _cmap)
update companies c set zvg_portal_ag_id = m.l_pid
from _cmap m
where c.id = m.canon and c.zvg_portal_ag_id is null and m.l_pid is not null;

-- ───────────────────────── B) Akten-Merge (neu kollidierend) ─────────────────────────
create temp table _akmap on commit drop as
with d as (select az_norm, ag_company_id from zvg_akte
           where az_norm is not null and ag_company_id is not null
           group by 1,2 having count(*) > 1),
ranked as (
  select a.zid, a.az_norm, a.ag_company_id,
    row_number() over (partition by a.az_norm, a.ag_company_id order by
      (a.cover_bild_path is not null) desc,
      (a.objektart is not null) desc,
      (coalesce(a.dokumente_count,0)+coalesce(a.fotos_count,0)) desc,
      (a.zid ~ '^p') asc,
      a.first_seen asc nulls last) rn
  from zvg_akte a join d using(az_norm, ag_company_id))
select c.zid as canon, l.zid as loser, lz.zvg_portal_id as l_pid
from ranked c
join ranked l using(az_norm, ag_company_id)
join zvg_akte lz on lz.zid = l.zid
where c.rn = 1 and l.rn > 1;

-- Enrichment + volatile Felder (außer zvg_portal_id) verlustfrei auf canon
update zvg_akte c set
  cover_bild_path     = coalesce(c.cover_bild_path, l.cover_bild_path),
  bilder_paths        = coalesce(c.bilder_paths, l.bilder_paths),
  aufnahmetag         = coalesce(c.aufnahmetag, l.aufnahmetag),
  objektart           = coalesce(c.objektart, l.objektart),
  objekt_anschrift    = coalesce(c.objekt_anschrift, l.objekt_anschrift),
  gutachten_url       = coalesce(c.gutachten_url, l.gutachten_url),
  gpreis_eur          = coalesce(c.gpreis_eur, l.gpreis_eur),
  detail_json         = coalesce(c.detail_json, l.detail_json),
  vkw_eur_zvg_portal  = coalesce(c.vkw_eur_zvg_portal, l.vkw_eur_zvg_portal),
  zvg_portal_land_abk = coalesce(c.zvg_portal_land_abk, l.zvg_portal_land_abk),
  vkw_eur             = coalesce(c.vkw_eur, l.vkw_eur),
  termin              = coalesce(c.termin, l.termin)
  -- (3) Status/stop_reason: canon behält seinen Status (keine potenziell aktiven
  --     Termine verstecken). Live-Ingester setzen 'aufgehoben' bei echtem terminAufgehoben.
from _akmap m join zvg_akte l on l.zid = m.loser
where c.zid = m.canon;

-- Kinder umhängen + entdoppeln
update zvg_akte_dokumente x set zid = m.canon from _akmap m
  where x.zid = m.loser and not exists (select 1 from zvg_akte_dokumente y
    where y.zid=m.canon and y.art=x.art and coalesce(y.storage_path,'')=coalesce(x.storage_path,''));
delete from zvg_akte_dokumente x using _akmap m where x.zid = m.loser;

update zvg_akte_bild x set zid = m.canon from _akmap m
  where x.zid = m.loser and not exists (select 1 from zvg_akte_bild y
    where y.zid=m.canon and y.storage_path=x.storage_path);
delete from zvg_akte_bild x using _akmap m where x.zid = m.loser;

update zvg_akte_favoriten x set zid = m.canon from _akmap m
  where x.zid = m.loser and not exists (select 1 from zvg_akte_favoriten y
    where y.zid=m.canon and y.sales_id=x.sales_id);
delete from zvg_akte_favoriten x using _akmap m where x.zid = m.loser;

update zvg_akte_quelle x set zid = m.canon from _akmap m
  where x.zid = m.loser and not exists (select 1 from zvg_akte_quelle y
    where y.zid=m.canon and y.quelle=x.quelle);
delete from zvg_akte_quelle x using _akmap m where x.zid = m.loser;

update zvg_anfrage x set zid = m.canon from _akmap m where x.zid = m.loser;

-- Verlierer-Akten löschen (gibt zvg_portal_id frei)
delete from zvg_akte a using _akmap m where a.zid = m.loser;

-- zvg_portal_id auf canon ziehen (jetzt kollisionsfrei)
update zvg_akte c set zvg_portal_id = coalesce(c.zvg_portal_id, m.l_pid)
from _akmap m where c.zid = m.canon;

-- ───────────────────────── Constraint wieder anlegen ─────────────────────────
alter table zvg_akte add constraint zvg_akte_aznorm_ag_uniq unique (az_norm, ag_company_id);

commit;

-- ───────────────────────── (3) Status-Korrektur (nach commit) ─────────────────────────
-- Gemergte Cross-Portal-Akten mit ZUKÜNFTIGEM Termin, die einen 'neu'-Zwilling
-- hatten: auf 'neu' setzen. (Portal hatte nur einen ALTEN Termin aufgehoben;
-- zvg.com führt den neuen aktiven Termin -> Termin verlegt, nicht abgesagt.)
-- Verhindert das Verstecken aktiver Termine.
update zvg_akte a set status='neu', stop_reason=null
where a.status='aufgehoben' and a.termin > now()
  and a.quellen @> '{zvg.com}' and a.quellen @> '{zvg-portal.de}'
  and exists (select 1 from _dedup_backup_zvg_akte_20260625 b
             where b.az_norm=a.az_norm and b.status='neu' and b.zid<>a.zid);

-- ───────────────────────── Akzeptanz (nach commit prüfen) ─────────────────────────
-- select count(*) from (select name from companies where sector='Amtsgericht'
--   group by name having count(*)>1) t;                       -- erwartet 0
-- select count(*) from (select az_norm, ag_company_id from zvg_akte
--   where az_norm is not null and ag_company_id is not null
--   group by 1,2 having count(*)>1) t;                         -- erwartet 0
-- select count(*) from zvg_akte d where ag_company_id is not null
--   and not exists (select 1 from companies c where c.id=d.ag_company_id); -- 0 verwaist
