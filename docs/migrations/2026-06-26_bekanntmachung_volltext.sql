-- ============================================================================
-- Bekanntmachung-Volltext + Anthropic-Status
-- Erstellt: 2026-06-26 · Projekt ujiiaqvwpnniaasdhyrb
--
-- Befund: 96,8% der amtlichen Bekanntmachungen auf zvg-portal.de sind TEXT-PDFs
-- (pdftotext liefert Text), nur ~3% sind Scans. -> Volltext wird gratis per
-- pdftotext extrahiert (tools/backfill-bekanntmachung-text.mjs); nur Scans
-- brauchen Haiku-Vision. Der Volltext enthält Verkehrswert, Wohnfläche,
-- Objekt-/Grundbuchbeschreibung und teils den Gläubiger-Abschnitt.
--
-- Der Volltext wird als Blob DIREKT auf der Akte gehalten (zvg_akte.
-- bekanntmachung_text) — schnellere Verarbeitung ohne Join; die Spalte auf
-- zvg_akte_dokumente bleibt als Roh-/Dokumentebene.
-- ============================================================================

-- Dokumentebene (Roh-Transkript je PDF)
alter table zvg_akte_dokumente add column if not exists volltext text;
alter table zvg_akte_dokumente add column if not exists volltext_am timestamptz;

-- Verarbeitungs-Blob auf der Akte
alter table zvg_akte add column if not exists bekanntmachung_text text;
alter table zvg_akte add column if not exists bekanntmachung_text_am timestamptz;

update zvg_akte a
set bekanntmachung_text = d.volltext,
    bekanntmachung_text_am = coalesce(d.volltext_am, now())
from zvg_akte_dokumente d
where d.zid = a.zid and d.art = 'bekanntmachung'
  and d.volltext is not null and a.bekanntmachung_text is null;

-- Anthropic-Credit-Status für den UI-Warnbanner
create table if not exists app_anthropic_status (
  id int primary key,
  credit_blocked_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
insert into app_anthropic_status (id) values (1) on conflict (id) do nothing;
alter table app_anthropic_status enable row level security;
drop policy if exists app_anthropic_status_read on app_anthropic_status;
create policy app_anthropic_status_read on app_anthropic_status
  for select to authenticated using (true);

-- Gläubiger zusätzlich aus dem Bekanntmachung-Volltext (Abschnitt
-- "Ansprechpartner des Gläubigers" / "Informationen zum Gläubiger"), wo das
-- Portal-Feld fehlt — danach strukturiert die Edge Function extract-glaeubiger.
