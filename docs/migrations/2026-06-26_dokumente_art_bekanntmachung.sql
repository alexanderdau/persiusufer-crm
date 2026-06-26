-- ============================================================================
-- zvg_akte_dokumente.art: 'bekanntmachung' erlauben
-- Erstellt: 2026-06-26 · Projekt ujiiaqvwpnniaasdhyrb
--
-- Die amtliche Bekanntmachung (Terminmitteilung-PDF) von zvg-portal.de wird als
-- eigene Dokumentart 'bekanntmachung' abgelegt (portal-anhang). Der CHECK-
-- Constraint kannte sie nicht -> erweitern.
-- Dublettenschutz: bestehender Unique-Index (zid, storage_path) + fester Pfad
-- {zid}/bekanntmachung.pdf -> max. eine Bekanntmachung pro Akte.
-- ============================================================================
alter table zvg_akte_dokumente drop constraint zvg_akte_dokumente_art_check;
alter table zvg_akte_dokumente add constraint zvg_akte_dokumente_art_check
  check (art = any (array['expose','anordnung','biethinweis','glaeubiger','gutachten',
    'grundbuch','b_plan','gma','foto','anwalt','notiz','sonstiges','bekanntmachung']));
