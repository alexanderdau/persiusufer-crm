-- ============================================================================
-- Mojibake-Amtsgerichte mit sauberen Zwillingen zusammenführen
-- Erstellt: 2026-06-26 · Projekt ujiiaqvwpnniaasdhyrb
--
-- PROBLEM: 6 Amtsgericht-Companies haben durch einen alten portal-ingest-
-- Encoding-Bug kaputte Namen ("WeiÃenburg" statt "Weißenburg"). Sie tragen
-- ger_id + Akten. Daneben existiert je ein sauber benannter Zwilling (von
-- zvg.com), meist leer. Die frühere Companies-Dedup hat sie übersehen, weil die
-- Namen sich (durch das Encoding) unterscheiden. Folge: Gericht-Match per Name
-- löst auf den leeren Zwilling auf -> falsche Zuordnung / Dubletten-Gefahr; und
-- die UI zeigt "WeiÃenburg".
--
-- FIX: je Paar (Mojibake, sauberer Zwilling) -> EINE Company. Kanonisch = der
-- SAUBERE Zwilling (korrekter Name). Alle FKs (contacts, deals, zvg_anfrage,
-- zvg_akte) vom Mojibake-Eintrag auf den Zwilling umhängen, ger_id übertragen,
-- Mojibake-Eintrag löschen. Korrektheit der Zuordnung wird per
-- convert_from(convert_to(name,'LATIN1'),'UTF8') hergestellt (reproduziert das
-- Original-UTF8). Kein Akten-Merge nötig (je Paar ist eine Seite leer).
--
-- Alles in EINER Transaktion mit Backup. Vor Ausführung prüfen.
-- ============================================================================
begin;

create temp table _moji on commit drop as
select m.id as mojibake, t.id as canon, m.zvg_portal_ag_id as moji_ger
from companies m
join companies t
  on t.sector = 'Amtsgericht'
  and t.name = convert_from(convert_to(m.name, 'LATIN1'), 'UTF8')
  and t.id <> m.id
where m.sector = 'Amtsgericht' and m.name ~ '[Ã]';

-- Sicherheitsnetz: pro Paar darf höchstens EINE Seite Akten mit gleichem
-- (az_norm) haben -> sonst gäbe es beim Umhängen eine Constraint-Kollision.
-- (Aktuell: je Paar ist eine Seite leer. Falls nicht -> Abbruch.)
do $$
declare n int;
begin
  select count(*) into n from (
    select a.az_norm from zvg_akte a join _moji m on a.ag_company_id = m.mojibake
    intersect
    select a.az_norm from zvg_akte a join _moji m on a.ag_company_id = m.canon
  ) t;
  if n > 0 then raise exception 'Akten-Kollision (% az_norm) — Migration abgebrochen', n; end if;
end $$;

create table _moji_backup_companies_20260626 as
  select * from companies
  where id in (select mojibake from _moji) or id in (select canon from _moji);

-- FKs Mojibake -> sauberer Zwilling
update contacts    x set company_id    = m.canon from _moji m where x.company_id    = m.mojibake;
update deals       x set company_id    = m.canon from _moji m where x.company_id    = m.mojibake;
update zvg_anfrage x set ag_company_id = m.canon from _moji m where x.ag_company_id = m.mojibake;
update zvg_akte    x set ag_company_id = m.canon from _moji m where x.ag_company_id = m.mojibake;

-- Mojibake-Companies löschen (gibt ger_id frei)
delete from companies c using _moji m where c.id = m.mojibake;

-- ger_id auf den sauberen Zwilling ziehen (nach Delete -> kollisionsfrei)
update companies c set zvg_portal_ag_id = m.moji_ger
from _moji m
where c.id = m.canon and c.zvg_portal_ag_id is null and m.moji_ger is not null;

commit;

-- Akzeptanz (nach commit):
-- select count(*) from companies where sector='Amtsgericht' and name ~ '[Ã]';  -- erwartet 0
-- select count(*) from (select name from companies where sector='Amtsgericht' group by name having count(*)>1) t; -- 0
