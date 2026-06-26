-- ============================================================================
-- Inkrementelles Detail-Enrichment: portal_detail_updated + Kandidaten-RPC
-- Erstellt: 2026-06-25 · Projekt ujiiaqvwpnniaasdhyrb
--
-- portal_detail_updated = zvg_portal_last_updated zum Zeitpunkt des Cachens.
-- So lädt portal-detail nur neue/geänderte Detailseiten, nicht alle.
-- Backfill setzt bestehende Detail-Texte als "aktuell" (kein Re-Fetch aller).
-- ============================================================================
alter table zvg_akte add column if not exists portal_detail_updated timestamptz;

update zvg_akte set portal_detail_updated = zvg_portal_last_updated
where portal_detail_text is not null and portal_detail_updated is null;

create or replace function zvg_detail_candidates(p_limit int)
returns table(zid text, az_norm text, zvg_portal_land_abk text,
              state_abbr text, last_updated timestamptz)
language sql stable as $$
  select a.zid, a.az_norm, a.zvg_portal_land_abk, c.state_abbr,
         a.zvg_portal_last_updated
  from zvg_akte a
  join companies c on c.id = a.ag_company_id
  where a.termin > now()
    and a.status <> 'aufgehoben'
    and a.zvg_portal_id is not null
    and c.zvg_portal_ag_id is not null
    and (a.portal_detail_text is null
         or a.portal_detail_updated is distinct from a.zvg_portal_last_updated)
  order by a.termin asc
  limit p_limit
$$;
