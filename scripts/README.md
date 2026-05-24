# scripts/marktscan_kleinanzeigen.py

Marktscan für Brandenburg-Baugrundstücke auf kleinanzeigen.de.

## Aufruf

```bash
export SUPABASE_URL=https://ujiiaqvwpnniaasdhyrb.supabase.co
export SUPABASE_SERVICE_KEY=sb_secret_...
export SCAN_MODE=since      # oder full
python scripts/marktscan_kleinanzeigen.py
```

## ENV-Variablen

| Variable             | Default | Bedeutung                                                  |
|----------------------|---------|------------------------------------------------------------|
| `SUPABASE_URL`       | —       | required                                                   |
| `SUPABASE_SERVICE_KEY` | —     | required (Service-Role-Key)                                |
| `SCAN_MODE`          | `full`  | `full` (Bootstrap, alle Seiten) oder `since` (stop-by-date) |
| `MAX_PAGES`          | `100`   | obere Schranke an Listing-Seiten                           |
| `HARD_LIMIT`         | `0`     | max. neue Inserate pro Lauf (0 = kein Limit)               |
| `SINCE_STOP_AFTER`   | `10`    | im since-Mode: stop nach N konsekutiv bekannten Inseraten  |
| `PAGE_THROTTLE_MIN/MAX` | `8/12` | Pause zwischen Listing-Seiten (Sekunden, random)         |
| `THROTTLE_MIN/MAX`   | `1/2.5` | Pause zwischen Detail-Requests                             |
| `LOG_DIR`            | auto    | Verzeichnis für Lauf-Logs                                  |

## GitHub Action

`.github/workflows/marktscan-kleinanzeigen.yml` führt das Skript

- **automatisch** täglich 04:30 UTC im `since`-Modus aus
- **manuell** via Actions → "Run workflow" mit Auswahl von Modus + Limits

### Required Secrets

In GitHub → Settings → Secrets and variables → Actions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

### Bootstrap-Lauf

Actions → "Marktscan kleinanzeigen.de (Baugrundstücke BB)" → "Run workflow":
- `scan_mode = full`
- `hard_limit = 0`

Läuft ~2–3 h, durchläuft alle ~63 Seiten, importiert ~1700 Inserate.
