-- ============================================================================
-- zvg_akte.wertgrenzen_weggefallen — 5/10- und 7/10-Wertgrenzen entfallen
-- Erstellt: 2026-06-25 · Projekt ujiiaqvwpnniaasdhyrb
--
-- Flag für Verfahren, bei denen die Wertgrenzen weggefallen sind (Zuschlag unter
-- Wert möglich → Investorenfälle). Befüllt von portal-wertgrenzen (Edge Function
-- bzw. tools/portal-detail/wertgrenzen.py) über den Such-Filter hinweis=on.
-- ============================================================================
alter table zvg_akte
  add column if not exists wertgrenzen_weggefallen boolean not null default false;
