# timleonhardt.de

Statische Spiele-Seite auf GitHub Pages (Branch `main`, Root-Ordner).

| Pfad | Inhalt |
|---|---|
| `index.html` | Startseite mit der Spieleauswahl. Leitet alte Einladungslinks (`/?room=…`) und Homescreen-Apps zu Gipfelrausch weiter. |
| `gipfelrausch/` | 3D-Ski-Arcade, Quelle liegt lokal im Ordner `Desktop/Game`. Details in `gipfelrausch/README.md`. |
| `umlauf/` | Ein-Knopf-Spiel mit Bestenliste. |
| `CNAME`, `.nojekyll` | Domain und Pages-Einstellung, nicht löschen. |

## Gipfelrausch aktualisieren

Die Dateien des Spiels nach `gipfelrausch/` kopieren, **nicht** ins Root: dort liegt die Startseite.

## Umlauf

- `umlauf/index.html`: das ganze Spiel, kein Build-Schritt.
- `umlauf/config.js`: Supabase Project URL und Publishable Key für die Online-Bestenliste. Leer bedeutet: Bestenliste nur auf dem jeweiligen Gerät.
- `umlauf/supabase-setup.sql`: Tabelle und Funktionen, einmal im Supabase SQL Editor ausführen. Einträge löschen: Table Editor → `umlauf_scores`.
