# UNIKA-Enrichment (zwangsversteigerung.de)

`enrich.py` — sammelt öffentliche UNIKA-Listings (paginiert, kein Captcha-Umgehen),
matcht per (objekt_plz, vkw_eur) eindeutig gegen `zvg_akte` und schreibt:
`grundstuecksflaeche_qm`, `wohnflaeche_qm`, `gewerbeflaeche_qm`, `unika_id`,
`wiederholungstermin` (aus Detailseite), und taggt Quelle `zwangsversteigerung.de`
(→ `zvg_akte_quelle`). Nutzt `SUPABASE_SERVICE_ROLE_KEY` aus `.env.local`.

Hinweis: PLZ+VKW ist als Anreicherungs-Schlüssel zuverlässig (97,6 % eindeutig),
aber kein Gap-Detektor (verfehlt VKW-abweichende/-leere Akten). Wiederholungstermin
steht nur auf der Detailseite (zvg.com/zvg-portal.de führen ihn nicht).
