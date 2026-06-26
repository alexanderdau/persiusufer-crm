-- ============================================================================
-- Gläubiger-Felder (strukturiert) auf zvg_akte
-- Erstellt: 2026-06-26 · Projekt ujiiaqvwpnniaasdhyrb
--
-- Zerlegt die Gläubiger-Info in eigene Spalten. Befüllung durch die Edge
-- Function extract-glaeubiger (Haiku): bevorzugt das Portal-Feld
-- zvg_akte.glaeubiger (Text), sonst die amtliche Bekanntmachungs-PDF
-- (zvg_akte_dokumente art='bekanntmachung'). glaeubiger_typ wird hier
-- zusätzlich initial per Schlagwort gesetzt (deterministische Anzahlung),
-- Haiku überschreibt später mit höherer Genauigkeit.
-- Anzeige in ZvgAkteShow (Card "Gläubiger") + Filter "Gläubiger-Typ"
-- (nur sichtbar, wenn Versteigerungsart = Forderung gewählt ist).
-- ============================================================================
alter table zvg_akte add column if not exists glaeubiger_name text;
alter table zvg_akte add column if not exists glaeubiger_typ text;
alter table zvg_akte add column if not exists glaeubiger_sachbearbeiter text;
alter table zvg_akte add column if not exists glaeubiger_telefon text;
alter table zvg_akte add column if not exists glaeubiger_az text;
alter table zvg_akte add column if not exists glaeubiger_email text;
alter table zvg_akte add column if not exists glaeubiger_extrahiert_am timestamptz;
alter table zvg_akte add column if not exists glaeubiger_quelle text;

-- Initiale Typ-Klassifikation (Schlagwort) auf dem Rohtext.
update zvg_akte set glaeubiger_typ = case
  when glaeubiger ~* 'sparkasse|volksbank|raiffeisen|bank|bausparkasse|\ybhw\y|hypo|\yhyp\y|targo|santander|\ydkb\y|\ying\y|aareal|naspa|sparda|apobank|\yksk\y' then 'bank'
  when glaeubiger ~* 'versicherung|allianz|debeka|provinzial' then 'versicherung'
  when glaeubiger ~* '\ystadt|gemeinde|landkreis|landeskasse|justizkasse|finanzamt|finanzkasse|gerichtskasse|zollamt|kommun|behörde|jobcenter|verbandsgemeinde|hansestadt|\ykreis\y' then 'oeffentlich'
  when glaeubiger ~* 'wohnungseigentümer|eigentümergemeinschaft|\yweg\y|hausverwaltung|miteigentümer' then 'weg'
  when glaeubiger ~* 'insolvenz' then 'insolvenz'
  when glaeubiger ~* 'rechtsanw|kanzlei|\yra\y|\yrae\y' then 'anwalt'
  when glaeubiger ~* 'nicht zugestimmt|kein ansprechpartner|mitgeteilt|nicht erfolgen|werden bei|keine kontaktdaten|^keine|verfügung ge|teilungsversteigerung' then 'unbekannt'
  else 'sonstige' end
where glaeubiger is not null;

-- Drain-Batch nach Anthropic-Guthaben:
--   while :; do r=$(curl -s -m 170 ".../functions/v1/extract-glaeubiger?token=...&limit=80"); echo "$r"; echo "$r" | grep -q '"offen": 0' && break; done
