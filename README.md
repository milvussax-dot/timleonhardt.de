# timleonhardt.de

Statische Spiele-Seite auf GitHub Pages (Branch `main`, Root-Ordner).

| Pfad | Inhalt |
|---|---|
| `index.html` | Startseite mit der Spieleauswahl. Leitet alte Einladungslinks (`/?room=…`) und Homescreen-Apps zu Gipfelrausch weiter. |
| `gipfelrausch/` | 3D-Ski-Arcade, Quelle liegt lokal im Ordner `Desktop/Game`. Details in `gipfelrausch/README.md`. |
| `umlauf/` | Ein-Knopf-Spiel mit Bestenliste. |
| `rutschpartie/` | Rutsch-Puzzle mit 30 Leveln, eine Datei. Die Level stammen aus `rutschpartie/tools/levelgen.py` (Generator und Löser mit denselben Regeln wie das Spiel). |
| `dorfplan/` | Aufbau-Strategie mit Tagesdorf (gleiche Teile für alle pro Tag), eine Datei. |
| `lb.js`, `lb-config.js` | Gemeinsame Online-Bestenliste für alle Spiele (Supabase). Setup: `leaderboard-setup.sql`. |
| `CNAME`, `.nojekyll` | Domain und Pages-Einstellung, nicht löschen. |

## Gipfelrausch aktualisieren

Die Dateien des Spiels nach `gipfelrausch/` kopieren, **nicht** ins Root: dort liegt die Startseite.

## Bestenlisten

Alle Spiele nutzen `lb.js` mit den Werten aus `lb-config.js` (Supabase Project URL und Publishable Key). Die Datenbank richtet `leaderboard-setup.sql` ein; neue Listen bekommen dort eine Zeile in `lb_boards` (mehr oder weniger ist besser, erlaubter Wertebereich). Einträge löschen: Supabase → Table Editor → `lb_scores`.

| Liste | Wert |
|---|---|
| `umlauf` | Funken |
| `rutschpartie` | Sterne, bei Gleichstand weniger Züge über Ideal |
| `dorfplan:tag:JJJJ-MM-TT`, `dorfplan` | Punkte im Tagesdorf, pro Tag und für alle Zeiten |
| `gipfelrausch:race3:<karte>`, `gipfelrausch:slalom3:<karte>` | Zeit in Millisekunden, weniger ist besser |
| `gipfelrausch:freestyle3:<park>`, `gipfelrausch:lawine` | Punkte bzw. Meter |
