-- ============================================================================
-- zvg_akte.glaeubiger — Gläubiger-Info aus dem Portal-Detailtext
-- Erstellt: 2026-06-26 · Projekt ujiiaqvwpnniaasdhyrb
--
-- Die zvg-portal.de-Detailseite hat bei Forderungsversteigerungen ein Feld
-- "Informationen zum Gläubiger: {Name, Kontakt, Az}" — bereits in
-- portal_detail_text gecacht. Wird hier extrahiert (deterministisch:
-- bis zum ersten Marker Gericht/Hinweis/GeoServer). Befüllung laufend durch
-- portal-detail (extractGlaeubiger). Anzeige in ZvgAkteShow nur bei
-- Forderungsversteigerungen (is_teilung=false).
-- ============================================================================
alter table zvg_akte add column if not exists glaeubiger text;

update zvg_akte set glaeubiger = nullif(trim(regexp_replace(
  split_part(portal_detail_text, 'Informationen zum Gläubiger:', 2),
  '(Gericht: Internetseite des Gerichtes|Hinweis: Die Wertgrenzen|GeoServer)[\s\S]*$', '')), '')
where portal_detail_text like '%Informationen zum Gläubiger:%';
